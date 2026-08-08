import type { PoolClient } from "pg";

export async function withSprintHistoryCleanup<T>(
  client: PoolClient,
  callback: () => Promise<T>,
): Promise<T> {
  if (process.env.NODE_ENV !== "test" || process.env.JIROO_RUN_DB_TESTS !== "1") {
    throw new Error("Sprint history cleanup is test-only.");
  }
  await client.query("set local session_replication_role = 'replica'");
  try {
    return await callback();
  } finally {
    await client.query("set local session_replication_role = 'origin'");
  }
}
