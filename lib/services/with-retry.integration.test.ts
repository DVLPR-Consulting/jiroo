import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { backlogs } from "@/lib/db/schema/domain";
import { withRetry } from "@/lib/services/items";

vi.mock("server-only", () => ({}));
const describeDb = process.env.JIROO_RUN_DB_TESTS === "1" ? describe : describe.skip;

describeDb("PostgreSQL retries", () => {
  it("retries a real Drizzle unique violation after the failed transaction rolls back", async () => {
    const key = `RT${randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase()}`;
    const [backlog] = await db.insert(backlogs).values({ key, name: "Retry fixture", color: "#475569" }).returning();
    let attempts = 0;
    try {
      await expect(withRetry(() => db.transaction(async (tx) => {
        attempts++;
        if (attempts === 1) await tx.insert(backlogs).values({ key, name: "Collision", color: "#475569" });
        return "recovered";
      }))).resolves.toBe("recovered");
      expect(attempts).toBe(2);
    } finally {
      await db.delete(backlogs).where(eq(backlogs.id, backlog!.id));
    }
  });
});
