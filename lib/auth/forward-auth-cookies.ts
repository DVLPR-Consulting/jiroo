import "server-only";

import { parseSetCookieHeader, toCookieOptions } from "better-auth/cookies";
import { cookies } from "next/headers";

/**
 * Server Actions call Better Auth through `auth.api`, so cookies it emits are
 * not written to the browser automatically. Copy them onto the Next.js
 * response, as Better Auth's `nextCookies()` plugin does, but only for the
 * calls that opt in (e.g. password change rotating the current session).
 */
export async function forwardAuthCookies(responseHeaders: Headers): Promise<void> {
  const setCookie = responseHeaders.get("set-cookie");
  if (!setCookie) return;
  const store = await cookies();
  for (const [name, attributes] of parseSetCookieHeader(setCookie)) {
    if (!name) continue;
    store.set(name, attributes.value, toCookieOptions(attributes));
  }
}
