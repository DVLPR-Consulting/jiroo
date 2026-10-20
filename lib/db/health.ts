import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

// Readiness must not consume the application's pool during an outage. Bound
// both acquisition (including the wait queue) and the query: at most 2 s total.
const healthPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 1,
  connectionTimeoutMillis: 1000,
  query_timeout: 1000,
  idleTimeoutMillis: 1000,
  allowExitOnIdle: true,
});
// pg-pool removes a failed idle connection; the next probe reports readiness.
healthPool.on("error", () => undefined);

export const healthDb = drizzle({ client: healthPool });
