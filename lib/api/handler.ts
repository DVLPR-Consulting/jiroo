import "server-only";
import { authenticateBearer, bearerChallenge } from "@/lib/api/authenticate";
import { mapErrorToProblem, problem } from "@/lib/api/http";
import { reserveApiRequest } from "@/lib/api/rate-limit";
import { type Actor, runWithActor } from "@/lib/auth/actor-context";
import { withRequestCache } from "@/lib/auth/request-cache";
import { scopeAllows } from "@/lib/services/api-tokens";

type ApiHandler<P> = (request: Request, actor: Actor, params: P) => Promise<Response>;
/** One independent authorization cache and actor context per HTTP request. */
export function withApiAuth<P = Record<string, never>>(scope: "read" | "write", handler: ApiHandler<P>) {
  return async (request: Request, context?: { params: Promise<P> }): Promise<Response> => withRequestCache(async () => {
    try {
      const authentication = await authenticateBearer(request);
      if (!authentication.ok) return problem("unauthorized", { headers: { "WWW-Authenticate": bearerChallenge(authentication.reason) } });
      const { principal } = authentication;
      // Every authenticated request spends budget, refused ones included (JIR-160).
      const budget = await reserveApiRequest(principal.tokenId);
      if (!budget.allowed) return problem("rate_limited", { headers: { "Retry-After": String(budget.retryAfterSeconds) } });
      if (!scopeAllows(principal.scope, scope)) return problem("insufficient_scope");
      const actor: Actor = { actorId: principal.actorId, tokenId: principal.tokenId, source: "api" };
      const params = context ? await context.params : {} as P;
      return await runWithActor(actor, () => handler(request, actor, params));
    } catch (error) { return mapErrorToProblem(error); }
  });
}
