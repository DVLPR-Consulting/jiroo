import "dotenv/config";

import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema/auth";
import { backlogs, items, itemWebLinks, statuses } from "@/lib/db/schema/domain";
import { addWebLink, listWebLinksForItem, removeWebLink } from "@/lib/services/web-links";

vi.mock("server-only", () => ({}));

const describeDb = process.env.JIROO_RUN_DB_TESTS === "1" ? describe : describe.skip;

async function createFixture() {
  const [actor] = await db.select({ id: user.id }).from(user).limit(1);
  if (!actor) throw new Error("Le seed doit contenir un utilisateur.");

  const key = `WL${randomUUID().replace(/[^a-f]/gi, "").slice(0, 5).toUpperCase()}`;
  const [backlog] = await db
    .insert(backlogs)
    .values({ key, name: "Liens web", color: "#475569" })
    .returning();
  if (!backlog) throw new Error("Fixture backlog impossible.");
  const [status] = await db
    .insert(statuses)
    .values({ backlogId: backlog.id, name: "À faire", category: "todo", order: 0, color: "#9aa0a6" })
    .returning();
  if (!status) throw new Error("Fixture statut impossible.");

  const itemId = randomUUID();
  const deletedItemId = randomUUID();
  const base = { type: "composant" as const, backlogId: backlog.id, statusId: status.id, reporterId: actor.id, depth: 0 };
  await db.insert(items).values([
    { ...base, id: itemId, key: `${key}-1`, title: "Item", rank: "a0", path: `root.${itemId.replaceAll("-", "")}` },
    {
      ...base,
      id: deletedItemId,
      key: `${key}-2`,
      title: "Item supprimé",
      rank: "a1",
      path: `root.${deletedItemId.replaceAll("-", "")}`,
      deletedAt: new Date(),
    },
  ]);
  return { actorId: actor.id, backlogId: backlog.id, itemId, deletedItemId };
}

async function cleanup(backlogId: string) {
  await db.delete(backlogs).where(eq(backlogs.id, backlogId));
}

describeDb("web links service (JIR-99)", () => {
  it("adds, lists in order of addition, and removes idempotently", async () => {
    const fixture = await createFixture();
    try {
      const figma = await addWebLink(
        { itemId: fixture.itemId, url: " https://www.figma.com/design/abc ", title: "Maquettes" },
        fixture.actorId,
      );
      const spec = await addWebLink({ itemId: fixture.itemId, url: "https://intra.local/spec" }, fixture.actorId);

      expect(figma).toMatchObject({ url: "https://www.figma.com/design/abc", title: "Maquettes", createdBy: fixture.actorId });
      expect((await listWebLinksForItem(fixture.itemId)).map((link) => [link.url, link.title])).toEqual([
        ["https://www.figma.com/design/abc", "Maquettes"],
        ["https://intra.local/spec", null],
      ]);

      await removeWebLink(figma.id);
      await removeWebLink(figma.id);
      expect((await listWebLinksForItem(fixture.itemId)).map((link) => link.id)).toEqual([spec.id]);
    } finally {
      await cleanup(fixture.backlogId);
    }
  });

  it("refuses a soft-deleted item and a non-http URL without writing", async () => {
    const fixture = await createFixture();
    try {
      await expect(
        addWebLink({ itemId: fixture.deletedItemId, url: "https://intra.local/spec" }, fixture.actorId),
      ).rejects.toThrow("Item introuvable.");
      await expect(
        addWebLink({ itemId: fixture.itemId, url: "javascript:alert(1)" }, fixture.actorId),
      ).rejects.toThrow("URL invalide (http ou https).");
      const rows = await db.select().from(itemWebLinks).where(eq(itemWebLinks.itemId, fixture.deletedItemId));
      expect(rows).toEqual([]);
      expect(await listWebLinksForItem(fixture.itemId)).toEqual([]);
    } finally {
      await cleanup(fixture.backlogId);
    }
  });

  it("drops the links with their item", async () => {
    const fixture = await createFixture();
    try {
      await addWebLink({ itemId: fixture.itemId, url: "https://intra.local/spec" }, fixture.actorId);
      await db.delete(items).where(eq(items.id, fixture.itemId));
      expect(await listWebLinksForItem(fixture.itemId)).toEqual([]);
    } finally {
      await cleanup(fixture.backlogId);
    }
  });
});
