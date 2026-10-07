import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { twoFactor } from "better-auth/plugins";
import {
  AUTH_VERSION_FIELD,
  rejectStaleSession,
  stampSessionAuthVersion,
  verifyPasswordCapturingAuthVersion,
} from "@/lib/auth/auth-version";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";

export const auth = betterAuth({
  appName: "Jiroo",
  // Accounts are provisioned by administrators through the server-side API.
  // Password changes go through the rate-limited Server Action
  // (app/actions/account.ts); auth.api calls are unaffected by disabledPaths.
  disabledPaths: ["/sign-up/email", "/change-password"],
  // Sessions live only in the database (no session.cookieCache, no
  // secondaryStorage): account recovery revokes access by deleting session
  // rows (lib/services/account-recovery.ts). Enabling either cache would let
  // revoked sessions survive until the cache expires.
  database: drizzleAdapter(db, { provider: "pg", schema }),
  emailAndPassword: {
    enabled: true,
    autoSignIn: false,
    // Captures the auth version proven fresh with the password (JIR-62).
    password: { verify: verifyPasswordCapturingAuthVersion },
  },
  user: {
    additionalFields: {
      role: { type: "string", required: false, defaultValue: "contributor", input: false },
    },
  },
  // A session only stays valid while its auth version is the user's
  // (lib/auth/auth-version.ts): checked before every Better Auth endpoint.
  session: { additionalFields: { authVersion: AUTH_VERSION_FIELD } },
  hooks: { before: rejectStaleSession },
  databaseHooks: {
    session: { create: { before: stampSessionAuthVersion } },
  },
  plugins: [twoFactor()],
});
