import { createMcpHandler } from "mcp-handler";
import { authenticateBearer, bearerChallenge } from "@/lib/api/authenticate";
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

async function handler(request: Request): Promise<Response> {
  const authentication = await authenticateBearer(request);
  if (!authentication.ok) {
    return new Response(
      JSON.stringify({
        jsonrpc: "2.0",
        error: { code: -32001, message: "Jeton d’accès manquant ou invalide." },
        id: null,
      }),
      {
        status: 401,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "private, no-store",
          "WWW-Authenticate": bearerChallenge(authentication.reason),
        },
      },
    );
  }
  const bearer = BEARER.exec(request.headers.get("authorization") ?? "")?.[1] ?? "";
  request.auth = authInfoFor(bearer, authentication.principal, null);
  return mcp(request);
}

export { handler as GET, handler as POST, handler as DELETE };
