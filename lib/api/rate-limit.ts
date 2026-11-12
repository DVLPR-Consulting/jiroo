import { and, eq, lt, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { apiTokenRate } from "@/lib/db/schema/domain";

/**
 * The request budget of a token (JIR-156): so many authenticated requests
 * per minute, counted atomically in the database so every instance shares
 * the same count, like the repository webhooks' budget.
 */

export const API_RATE_LIMIT_PER_MINUTE = 300;
export const API_RATE_WINDOW_MS = 60_000;

export type RateReservation = { allowed: boolean; count: number; retryAfterSeconds: number };

function windowStartOf(now: Date): Date {
  return new Date(Math.floor(now.getTime() / API_RATE_WINDOW_MS) * API_RATE_WINDOW_MS);
}

/** Seconds until the next window opens, at least 1, for `Retry-After`. */
export function retryAfterSeconds(now = new Date()): number {
  const nextWindow = windowStartOf(now).getTime() + API_RATE_WINDOW_MS;
  return Math.max(1, Math.ceil((nextWindow - now.getTime()) / 1000));
}

/**
 * Reserves one request in the token's current minute and says whether it fits
 * the budget. Refused requests are counted too: a client that keeps hammering
 * stays refused. The previous windows of the token are dropped on the first
 * request of a new one.
 */
export async function reserveApiRequest(
  tokenId: string,
  now = new Date(),
  limit = API_RATE_LIMIT_PER_MINUTE,
): Promise<RateReservation> {
  const windowStart = windowStartOf(now);
  const [row] = await db
    .insert(apiTokenRate)
    .values({ tokenId, windowStart, count: 1 })
    .onConflictDoUpdate({
      target: [apiTokenRate.tokenId, apiTokenRate.windowStart],
      set: { count: sql`${apiTokenRate.count} + 1` },
    })
    .returning({ count: apiTokenRate.count });
  const count = row!.count;
  if (count === 1) {
    await db
      .delete(apiTokenRate)
      .where(and(eq(apiTokenRate.tokenId, tokenId), lt(apiTokenRate.windowStart, windowStart)));
  }
  return { allowed: count <= limit, count, retryAfterSeconds: retryAfterSeconds(now) };
}
