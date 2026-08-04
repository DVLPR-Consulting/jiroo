import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

async function readRawSession() {
  return auth.api.getSession({ headers: await headers() });
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
