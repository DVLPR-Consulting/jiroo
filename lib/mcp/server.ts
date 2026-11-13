import "server-only";
import type { AuthInfo, McpServer } from "@modelcontextprotocol/server";
import { JIROO_TOOLS, runTool, type ToolResult } from "@/lib/mcp/tools";
import type { ApiPrincipal } from "@/lib/services/api-tokens";
import type { ApiTokenScope } from "@/lib/validation/api-token";

/**
 * Wires the Jiroo tools onto an MCP server (JIR-158). The principal comes
 * from the bearer token `withMcpAuth` verified for this request; without it
 * every tool answers a refusal (the route requires authentication anyway).
 */

export const SERVER_INFO = { name: "jiroo", version: "1.0.0" } as const;

/** Builds the `AuthInfo` the MCP layer carries for a verified token. */
export function authInfoFor(bearer: string, principal: ApiPrincipal, expiresAt: Date | null): AuthInfo {
  return {
    token: bearer,
    clientId: principal.tokenId,
    scopes: principal.scope === "write" ? ["read", "write"] : ["read"],
    ...(expiresAt ? { expiresAt: Math.floor(expiresAt.getTime() / 1000) } : {}),
    extra: { actorId: principal.actorId, tokenId: principal.tokenId, scope: principal.scope },
  };
}

/** Reads the principal back; `null` when the request was not authenticated. */
export function principalFrom(authInfo: AuthInfo | undefined): ApiPrincipal | null {
  const extra = authInfo?.extra;
  if (!extra) return null;
  const { actorId, tokenId, scope } = extra as Partial<Record<"actorId" | "tokenId" | "scope", unknown>>;
  if (typeof actorId !== "string" || typeof tokenId !== "string" || (scope !== "read" && scope !== "write")) return null;
  return { actorId, tokenId, scope: scope as ApiTokenScope };
}

/** The part of the SDK's request context the tools read: the HTTP auth info `withMcpAuth` attached. */
type RequestContextLike = { http?: { authInfo?: AuthInfo } };

const UNAUTHENTICATED: ToolResult = {
  content: [{ type: "text", text: "Jeton d’accès manquant ou invalide." }],
  isError: true,
};

export function registerJirooTools(server: McpServer): void {
  for (const tool of JIROO_TOOLS) {
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: tool.inputSchema,
        annotations: { readOnlyHint: tool.scope === "read", destructiveHint: false, openWorldHint: false },
      },
      async (args: unknown, ctx: RequestContextLike) => {
        const principal = principalFrom(ctx.http?.authInfo);
        if (!principal) return UNAUTHENTICATED;
        return runTool(tool, args, principal);
      },
    );
  }
}
