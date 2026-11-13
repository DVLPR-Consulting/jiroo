import { createMcpHandler } from "mcp-handler";
import { authenticateBearer, bearerChallenge } from "@/lib/api/authenticate";
import { PayloadTooLargeError, readBoundedText } from "@/lib/api/http";
import { reserveApiRequest } from "@/lib/api/rate-limit";
import { authInfoFor, registerJirooTools, SERVER_INFO } from "@/lib/mcp/server";

/**
 * The Jiroo MCP server (JIR-158): Streamable HTTP, stateless, authenticated
 * by a personal access token in `Authorization: Bearer …`. There is no OAuth
 * server to discover, so the 401 challenge names none: the client is
 * configured with the header (docs/mcp.md). The verified principal travels
 * to the tools as the request's `auth`, which mcp-handler hands to them as
 * `ctx.http.authInfo`.
 */

export const runtime = "nodejs";
export const maxDuration = 60;

const mcp = createMcpHandler((server) => registerJirooTools(server), { serverInfo: SERVER_INFO });

const BEARER = /^\s*bearer\s+(\S+)\s*$/i;

function jsonRpcError(status: number, message: string, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify({ jsonrpc: "2.0", error: { code: -32001, message }, id: null }), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "private, no-store", ...headers },
  });
}

async function handler(request: Request): Promise<Response> {
  const authentication = await authenticateBearer(request);
  if (!authentication.ok) {
    return jsonRpcError(401, "Jeton d’accès manquant ou invalide.", {
      "WWW-Authenticate": bearerChallenge(authentication.reason),
    });
  }
  // Bounded body, and one JSON-RPC message per request: a batch array would
  // run many tools for one unit of budget (security review, JIR-160). The
  // current MCP transport no longer uses batches.
  let forwarded = request;
  if (request.method === "POST") {
    let text: string;
    try {
      text = await readBoundedText(request);
    } catch (error) {
      if (error instanceof PayloadTooLargeError) return jsonRpcError(413, "Le corps de la requête est trop volumineux.");
      throw error;
    }
    if (text.trimStart().startsWith("[")) {
      return jsonRpcError(400, "Une seule requête JSON-RPC par appel : les lots ne sont pas acceptés.");
    }
    forwarded = new Request(request.url, { method: "POST", headers: request.headers, body: text });
  }
  // Every authenticated MCP request spends budget, not only tool calls:
  // initialize, tools/list and pings too (security audit, JIR-160).
  try {
    const budget = await reserveApiRequest(authentication.principal.tokenId);
    if (!budget.allowed) {
      return jsonRpcError(429, `Trop de requêtes pour ce jeton : réessayez dans ${budget.retryAfterSeconds} s.`, {
        "Retry-After": String(budget.retryAfterSeconds),
      });
    }
  } catch (error) {
    console.error(`[mcp] budget failed: ${error instanceof Error ? error.name : typeof error}`);
    return jsonRpcError(500, "Une erreur interne a empêché l’opération.");
  }
  const bearer = BEARER.exec(request.headers.get("authorization") ?? "")?.[1] ?? "";
  forwarded.auth = authInfoFor(bearer, authentication.principal, null);
  return mcp(forwarded);
}

export { handler as GET, handler as POST, handler as DELETE };
