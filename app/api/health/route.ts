import { sql } from "drizzle-orm";
import { healthDb as db } from "@/lib/db/health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

/** Public readiness probe: never return database or deployment details. */
export async function GET() {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => reject(new Error("Health query timed out")), 2000);
  });
  try {
    await Promise.race([db.execute(sql`select 1`), deadline]);
    return Response.json({ status: "ok" }, { headers: NO_STORE });
  } catch {
    return Response.json({ status: "unavailable" }, { status: 503, headers: NO_STORE });
  } finally {
    clearTimeout(timeout);
  }
}
