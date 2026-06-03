import { sql } from "drizzle-orm";
import type { DB } from "@/lib/db";

// Pure formatting — the unit the brief requires under test.
export function formatItemKey(prefix: string, n: number): string {
  if (!Number.isInteger(n) || n < 1) throw new Error("formatItemKey: n must be a positive integer");
  return `${prefix.toUpperCase()}-${n}`;
}

// Next key for a backlog, backed by the native Postgres sequence.
// Accepts any executor with `.execute` (the pooled `db` OR a `tx`), so callers can run
// nextval ON THE TRANSACTION'S connection — no cast. NB: nextval is non-transactional, so a
// rolled-back create permanently burns a value (gaps); uniqueness is backstopped by items.key.
export async function nextItemKey(
  exec: Pick<DB, "execute">,
  backlogKey: string,
): Promise<string> {
  const rows = await exec.execute<{ nextval: string }>(sql`SELECT nextval('item_key_seq') AS nextval`);
  const n = Number(rows.rows[0]!.nextval);
  return formatItemKey(backlogKey, n);
}
