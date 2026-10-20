import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

async function main() {
  const directUrl = process.env.DIRECT_DATABASE_URL?.trim();
  if (!directUrl) {
    throw new Error("DIRECT_DATABASE_URL is required for migrations; set the schema owner's direct connection URL.");
  }
  const pool = new Pool({ connectionString: directUrl });
  try {
    const db = drizzle(pool);
    await migrate(db, { migrationsFolder: "./drizzle" });
  } finally {
    await pool.end();
  }
  console.log("migrations applied");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
