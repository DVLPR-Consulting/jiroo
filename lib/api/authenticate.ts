import {
  authenticateApiToken,
  isApiTokenFormat,
  type ApiPrincipal,
} from "@/lib/services/api-tokens";

/**
 * Bearer authentication of the REST API and the MCP server (JIR-156): the
 * `Authorization` header carries a personal access token, which acts as its
 * owner. No cookie, no session, no second factor: the token is the proof.
 */

export type BearerFailureReason = "missing" | "invalid";

export type BearerAuthentication =
  | { ok: true; principal: ApiPrincipal }
  | { ok: false; reason: BearerFailureReason };

const BEARER = /^\s*bearer\s+(\S+)\s*$/i;

export async function authenticateBearer(request: Request, now = new Date()): Promise<BearerAuthentication> {
  const header = request.headers.get("authorization");
  if (!header || header.trim() === "") return { ok: false, reason: "missing" };
  const match = BEARER.exec(header);
  if (!match || !isApiTokenFormat(match[1]!)) return { ok: false, reason: "invalid" };
  const principal = await authenticateApiToken(match[1]!, now);
  return principal ? { ok: true, principal } : { ok: false, reason: "invalid" };
}

/** The `WWW-Authenticate` value of a 401 (RFC 6750 §3). */
export function bearerChallenge(reason: BearerFailureReason): string {
  return reason === "missing" ? 'Bearer realm="jiroo"' : 'Bearer realm="jiroo", error="invalid_token"';
}
