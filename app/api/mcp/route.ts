import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { authenticateBearer } from "@/lib/api/authenticate";
import { authInfoFor, registerJirooTools, SERVER_INFO } from "@/lib/mcp/server";

/**
 * The Jiroo MCP server (JIR-158): Streamable HTTP, stateless, authenticated
 * by a personal access token in `Authorization: Bearer …`. No OAuth: the
 * client is configured with the header (docs/mcp.md).
 */

export const runtime = "nodejs";
export const maxDuration = 60;

const mcp = createMcpHandler((server) => registerJirooTools(server), { serverInfo: SERVER_INFO });

const handler = withMcpAuth(
  mcp,
  async (request, bearer) => {
    if (!bearer) return undefined;
    const authentication = await authenticateBearer(request);
    if (!authentication.ok) return undefined;
    return authInfoFor(bearer, authentication.principal, null);
  },
  { required: true },
);

export { handler as GET, handler as POST, handler as DELETE };
