import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

// Next.js keeps cookies() in sync with cookies set by the current Server Action
// before re-rendering, but headers() still carries the original Cookie header.
// Reading from cookies() lets a rotated session (e.g. after a password change
// that revokes every other session) authenticate the re-render.
async function requestHeaders(): Promise<Headers> {
  const forwarded = new Headers(await headers());
  const cookieHeader = (await cookies()).toString();
  if (cookieHeader) forwarded.set("cookie", cookieHeader);
  else forwarded.delete("cookie");
  return forwarded;
}

async function readRawSession() {
  return auth.api.getSession({ headers: await requestHeaders() });
}

// Application callers fail closed: a password-only session is not an app session.
export async function getSession() {
  const session = await readRawSession();
  return session?.user.twoFactorEnabled === true ? session : null;
}

// The route-only guards below are intentionally the only pending-session readers
// exposed outside this module so Server Actions cannot accidentally bypass enrollment.
export async function requireAppPageSession() {
  const session = await readRawSession();
  if (!session) redirect("/login");
  if (session.user.twoFactorEnabled !== true) redirect("/2fa/enroll");
  return session;
}

// Enrollment must retain the password-only session used by Better Auth's enable
// endpoint, while rejecting anonymous and already-enrolled requests server-side.
export async function requireEnrollmentPageSession() {
  const session = await readRawSession();
  if (!session) redirect("/login");
  if (session.user.twoFactorEnabled === true) redirect("/");
  return session;
}
