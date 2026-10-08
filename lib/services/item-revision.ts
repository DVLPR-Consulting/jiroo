import { sql } from "drizzle-orm";
import { items } from "@/lib/db/schema/domain";

/**
 * Next `items.updated_at` for an UPDATE: the transaction time in whole
 * milliseconds, and always at least one millisecond after the row's previous
 * value. The item is locked by the writing transaction, so every write gets
 * a unique, strictly increasing revision that a JavaScript Date carries
 * without loss (the description editor orders server states with it).
 */
export function nextItemRevision() {
  return sql<Date>`greatest(date_trunc('milliseconds', now()), date_trunc('milliseconds', ${items.updatedAt}) + interval '1 millisecond')`;
}
