import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { twoFactor } from "better-auth/plugins";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";

export const auth = betterAuth({
  appName: "Jiroo",
  database: drizzleAdapter(db, { provider: "pg", schema }),
  emailAndPassword: { enabled: true, autoSignIn: false },
  user: {
    additionalFields: {
      role: { type: "string", required: false, defaultValue: "contributor", input: false },
    },
  },
  plugins: [twoFactor()],
});
