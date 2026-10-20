import "dotenv/config";
import { defineConfig } from "drizzle-kit";

const directUrl = process.env.DIRECT_DATABASE_URL?.trim();
if (!directUrl) {
  throw new Error("DIRECT_DATABASE_URL is required for schema tools; set the schema owner's direct connection URL.");
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./lib/db/schema/index.ts",
  out: "./drizzle",
  dbCredentials: { url: directUrl },
});
