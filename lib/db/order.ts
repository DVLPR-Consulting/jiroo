import { sql, type SQLWrapper } from "drizzle-orm";

/** Keep fractional-rank ordering identical to JavaScript's binary `<` / `>`. */
export function binaryTextOrder(column: SQLWrapper) {
  return sql`${column} collate "C"`;
}
