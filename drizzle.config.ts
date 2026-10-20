import "dotenv/config";
import { defineConfig } from "drizzle-kit";

// The schema owner's direct connection, for the commands that connect
// (migrate, push, studio); `generate` only reads the schema and needs none.
const directUrl = process.env.DIRECT_DATABASE_URL?.trim();

export default defineConfig({
  dialect: "postgresql",
  schema: "./lib/db/schema/index.ts",
  out: "./drizzle",
  ...(directUrl ? { dbCredentials: { url: directUrl } } : {}),
});
