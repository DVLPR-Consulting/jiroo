import { sql } from "drizzle-orm";
import type { DB } from "@/lib/db";

// Pure formatting — the unit the brief requires under test.
export function formatItemKey(prefix: string, n: number): string {
  if (!Number.isInteger(n) || n < 1) throw new Error("formatItemKey: n must be a positive integer");
  return `${prefix.toUpperCase()}-${n}`;
}

// Atomic next key for a backlog, backed by the native Postgres sequence.
export async function nextItemKey(db: DB, backlogKey: string): Promise<string> {
  const rows = await db.execute<{ nextval: string }>(sql`SELECT nextval('item_key_seq') AS nextval`);
  const n = Number(rows.rows[0]!.nextval);
  return formatItemKey(backlogKey, n);
}
