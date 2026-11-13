import { requireAppPageSession } from "@/lib/auth/session";
import { listApiTokens } from "@/lib/services/api-tokens";
import { ApiTokensPanel, type ApiTokenView } from "@/components/account/api-tokens-panel";
import { ShellBreadcrumb } from "@/components/shell/shell-breadcrumb";

/**
 * « Jetons d'accès » (JIR-156): the signed-in user's personal access tokens
 * for the REST API and the MCP server. Listing, creating and revoking need
 * the full session; the tokens themselves act as the user without it.
 */
export default async function ApiTokensPage() {
  const session = await requireAppPageSession();
  const tokens = await listApiTokens(session.user.id);
  const views: ApiTokenView[] = tokens.map((token) => ({
    id: token.id,
    name: token.name,
    tokenPrefix: token.tokenPrefix,
    scope: token.scope,
    expiresAt: token.expiresAt?.toISOString() ?? null,
    lastUsedAt: token.lastUsedAt?.toISOString() ?? null,
    createdAt: token.createdAt.toISOString(),
  }));

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-1 border-b border-border px-6 py-4">
        <ShellBreadcrumb />
        {/* Wording: Codex proposal for JIR-156 (column A). */}
        <h1 className="t-h1">Jetons d’accès</h1>
        <p className="t-sm text-muted-foreground">
          Reliez un outil ou un agent à Jiroo. Son accès dépend de vos droits et de la portée du
          jeton.
        </p>
      </div>
      <div className="flex-1 overflow-y-auto px-6 py-4">
        <ApiTokensPanel tokens={views} now={new Date().toISOString()} />
      </div>
    </div>
  );
}
