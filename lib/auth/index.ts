import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { twoFactor } from "better-auth/plugins";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";

export const auth = betterAuth({
  appName: "Jiroo",
  // Accounts are provisioned by administrators through the server-side API.
  disabledPaths: ["/sign-up/email"],
  // Sessions live only in the database (no session.cookieCache, no
  // secondaryStorage): account recovery revokes access by deleting session
  // rows (lib/services/account-recovery.ts). Enabling either cache would let
  // revoked sessions survive until the cache expires.
  database: drizzleAdapter(db, { provider: "pg", schema }),
  emailAndPassword: { enabled: true, autoSignIn: false },
  user: {
    additionalFields: {
      role: { type: "string", required: false, defaultValue: "contributor", input: false },
    },
  },
  plugins: [twoFactor()],
});
