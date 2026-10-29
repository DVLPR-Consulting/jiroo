import type { Page, Request, Route } from "@playwright/test";

export type ActionMatch = (input: Record<string, unknown>) => boolean;

/** Parse only the plain JSON argument array; parser errors can contain secrets. */
export function readActionArguments(body: string | null): unknown[] | null {
  if (body === null) return null;
  try {
    const args: unknown = JSON.parse(body);
    return Array.isArray(args) ? args : null;
  } catch {
    return null;
  }
}

/** These mutations take one object. Never guess among several arguments. */
export function matchesAction(args: unknown[] | null, match: ActionMatch): boolean {
  if (args?.length !== 1) return false;
  const input = args[0];
  return typeof input === "object" && input !== null && !Array.isArray(input) && match(input as Record<string, unknown>);
}

function requestArguments(request: Request, match: ActionMatch): unknown[] | null {
  if (request.method() !== "POST" || !request.headers()["next-action"]?.trim()) return null;
  const args = readActionArguments(request.postData());
  return matchesAction(args, match) ? args : null;
}

/** Call before the UI action. Headers acknowledge the request, not its effects. */
export async function awaitAction(page: Page, options: { match: ActionMatch; timeout?: number }) {
  const response = await page.waitForResponse(
    (candidate) => requestArguments(candidate.request(), options.match) !== null,
    { timeout: options.timeout ?? 10_000 },
  );
  return { status: response.status(), args: readActionArguments(response.request().postData())! };
}

/** Retain existing scenario timings; callers still assert the UI/DB outcome. */
export async function performAction(page: Page, match: ActionMatch, action: () => Promise<void>) {
  const startedAt = Date.now();
  const [response] = await Promise.all([awaitAction(page, { match }), action()]);
  if (response.status >= 400) throw new Error(`Mutation returned HTTP ${response.status}.`);
  return { ...response, elapsedMs: Date.now() - startedAt };
}

/** Intercept once; unrelated actions (including permission reads) keep flowing. */
export async function interceptAction(page: Page, options: {
  match: ActionMatch;
  respond: (route: Route, args: unknown[]) => Promise<void>;
}) {
  let captured: Request | null = null;
  const handler = async (route: Route) => {
    const request = route.request();
    const args = requestArguments(request, options.match);
    if (captured === null && args !== null) {
      captured = request;
      await options.respond(route, args);
    } else {
      await route.fallback();
    }
  };
  await page.route("**/*", handler);
  return {
    request(): Request {
      if (captured === null) throw new Error("No matching action was intercepted.");
      return captured;
    },
    dispose: () => page.unroute("**/*", handler),
  };
}
