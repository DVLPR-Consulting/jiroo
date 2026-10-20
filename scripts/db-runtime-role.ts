import "dotenv/config";
import { Client } from "pg";
import { grantRuntimeRole, RuntimeRoleError } from "@/lib/db/runtime-role";

/**
 * Grants the application's runtime role its least privileges (JIR-114).
 * Run as the schema owner, the role that runs the migrations:
 *   DIRECT_DATABASE_URL=… JIROO_RUNTIME_ROLE=jiroo_runtime pnpm db:grant-runtime
 * Run it again after the migrations of a new release: it is idempotent.
 */
async function main() {
  const ownerUrl = process.env.DIRECT_DATABASE_URL;
  const runtimeRole = process.env.JIROO_RUNTIME_ROLE;
  if (!ownerUrl || !runtimeRole) {
    throw new RuntimeRoleError(
      "Set DIRECT_DATABASE_URL (the schema owner) and JIROO_RUNTIME_ROLE (the runtime role name).",
    );
  }
  const client = new Client({ connectionString: ownerUrl });
  await client.connect();
  try {
    await grantRuntimeRole(client, runtimeRole);
  } finally {
    await client.end();
  }
  console.log(`runtime role ${runtimeRole} granted`);
}

main().catch((error: unknown) => {
  // Never print the connection string: only the reason.
  console.error(error instanceof RuntimeRoleError ? error.message : error);
  process.exit(1);
});
