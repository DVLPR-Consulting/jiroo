import "dotenv/config";

import { randomUUID } from "node:crypto";
import { eq, or } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema/auth";
import { backlogs, itemLinks, items, statuses } from "@/lib/db/schema/domain";
import type { ItemType } from "@/lib/design/constants";
import {
  ITEM_CHOICE_LIMIT,
  listBacklogStructure,
  listChildItems,
  listItemChoicesByIds,
  searchBacklogItems,
} from "@/lib/services/item-choices";

vi.mock("server-only", () => ({}));

const describeDb = process.env.JIROO_RUN_DB_TESTS === "1" ? describe : describe.skip;

function randomBacklogKey(): string {
  return `R${randomUUID().replace(/[^a-f]/gi, "").slice(0, 5).toUpperCase()}`;
}

type Seeded = { id: string; key: string; type: ItemType; title: string; path: string; depth: number };

describeDb("item choices", () => {
  let backlogId = "";
  let backlogKey = "";
  let statusId = "";
  let reporterId = "";
  const byTitle = new Map<string, Seeded>();

  /** Inserts a live (or deleted) item under `parent`; `rank` orders siblings. */
  async function seed(
    type: ItemType,
    title: string,
    options: { number: number; rank: string; parent?: Seeded; description?: string; deleted?: boolean },
  ): Promise<Seeded> {
    const id = randomUUID();
    const path = `${options.parent?.path ?? "root"}.${id.replaceAll("-", "")}`;
    const depth = options.parent ? options.parent.depth + 1 : 0;
    const key = `${backlogKey}-${options.number}`;
    await db.insert(items).values({
      id,
      key,
      type,
      backlogId,
      title,
      description: options.description ?? null,
      parentId: options.parent?.id ?? null,
      statusId,
      reporterId,
      rank: options.rank,
      path,
      depth,
      deletedAt: options.deleted ? new Date() : null,
    });
    const seeded = { id, key, type, title, path, depth };
    byTitle.set(title, seeded);
    return seeded;
  }

  const choiceOf = (title: string) => {
    const { id, key, type } = byTitle.get(title)!;
    return { id, key, type, title };
  };

  beforeAll(async () => {
    const [actor] = await db.select({ id: user.id }).from(user).limit(1);
    if (!actor) throw new Error("Le seed doit contenir un utilisateur.");
    reporterId = actor.id;
    const [backlog] = await db
      .insert(backlogs)
      .values({ key: randomBacklogKey(), name: "Choix d’items", color: "#475569" })
      .returning();
    backlogId = backlog!.id;
    backlogKey = backlog!.key;
    const [status] = await db
      .insert(statuses)
      .values({ backlogId, name: "À faire", category: "todo", order: 0, color: "#9aa0a6" })
      .returning();
    statusId = status!.id;

    const portal = await seed("composant", "Portail", { number: 1, rank: "a0" });
    const login = await seed("epic", "Connexion", { number: 2, rank: "a1", parent: portal });
    const search = await seed("epic", "Recherche documentaire", { number: 3, rank: "a2", parent: portal });
    const page = await seed("tache", "Page de connexion", { number: 4, rank: "a3", parent: login });
    await seed("tache", "Récupération du mot de passe", {
      number: 5,
      rank: "a4",
      parent: login,
      description: "La procédure de secours envoie un lien.",
    });
    await seed("soustache", "Formulaire", { number: 6, rank: "a5", parent: page });
    await seed("tache", "Supprimée", { number: 7, rank: "a6", parent: search, deleted: true });
    // More tasks than a picker lists, to check the bound.
    for (let index = 0; index < ITEM_CHOICE_LIMIT; index += 1) {
      await seed("tache", `Indexation ${index + 1}`, {
        number: 10 + index,
        rank: `b${String(index).padStart(2, "0")}`,
        parent: search,
      });
    }
  });

  afterAll(async () => {
    if (backlogId) await db.delete(backlogs).where(eq(backlogs.id, backlogId));
  });

  const titles = (rows: { title: string }[]) => rows.map((row) => row.title);

  it("lists the live structure, composants then epics, in hierarchy order", async () => {
    const rows = await listBacklogStructure(backlogId);
    expect(titles(rows)).toEqual(["Portail", "Connexion", "Recherche documentaire"]);
    expect(rows[0]).toEqual(choiceOf("Portail"));
  });

  it("labels the live items among given ids, deduplicated, in hierarchy order, deleted ones left out", async () => {
    const page = byTitle.get("Page de connexion")!;
    const rows = await listItemChoicesByIds(backlogId, [
      page.id,
      byTitle.get("Supprimée")!.id,
      byTitle.get("Portail")!.id,
      page.id,
      null,
      undefined,
    ]);
    expect(rows).toEqual([choiceOf("Portail"), choiceOf("Page de connexion")]);
    expect(await listItemChoicesByIds(backlogId, [null])).toEqual([]);
  });

  it("lists the live children of an item with their status, in the backlog's order", async () => {
    const rows = await listChildItems(backlogId, byTitle.get("Connexion")!.id);
    expect(rows).toEqual([
      { ...choiceOf("Page de connexion"), statusId },
      { ...choiceOf("Récupération du mot de passe"), statusId },
    ]);
    const searchChildren = await listChildItems(backlogId, byTitle.get("Recherche documentaire")!.id);
    expect(titles(searchChildren)).not.toContain("Supprimée");
    expect(searchChildren).toHaveLength(ITEM_CHOICE_LIMIT);
  });

  it("offers the first items of the asked levels in hierarchy order, bounded, without the deleted ones", async () => {
    const tasks = await searchBacklogItems(backlogId, { types: ["tache"] });
    expect(tasks).toHaveLength(ITEM_CHOICE_LIMIT);
    expect(titles(tasks).slice(0, 3)).toEqual([
      "Page de connexion",
      "Récupération du mot de passe",
      "Indexation 1",
    ]);
    expect(titles(tasks)).not.toContain("Supprimée");
    expect(titles(tasks)).not.toContain("Formulaire");

    const everything = await searchBacklogItems(backlogId);
    expect(titles(everything).slice(0, 4)).toEqual([
      "Portail",
      "Connexion",
      "Recherche documentaire",
      "Page de connexion",
    ]);
  });

  it("leaves out the excluded items", async () => {
    const rows = await searchBacklogItems(backlogId, {
      types: ["epic"],
      excludeIds: [byTitle.get("Connexion")!.id],
    });
    expect(titles(rows)).toEqual(["Recherche documentaire"]);
  });

  it("finds a key by its prefix, whatever the case, before the items whose words match", async () => {
    const rows = await searchBacklogItems(backlogId, { q: `${backlogKey.toLowerCase()}-2` });
    expect(rows[0]).toEqual(choiceOf("Connexion"));
    expect(titles(rows)).not.toContain("Portail");
  });

  it("finds a key by its number alone, before a title carrying that number", async () => {
    const rows = await searchBacklogItems(backlogId, { q: "5" });
    expect(titles(rows)).toEqual(["Récupération du mot de passe", "Indexation 5"]);
  });

  it("matches the start of words in the title and the description, accents included, in hierarchy order", async () => {
    expect(titles(await searchBacklogItems(backlogId, { q: "connexion" }))).toEqual([
      "Connexion",
      "Page de connexion",
    ]);
    expect(titles(await searchBacklogItems(backlogId, { q: "récup" }))).toEqual([
      "Récupération du mot de passe",
    ]);
    expect(titles(await searchBacklogItems(backlogId, { q: "secours" }))).toEqual([
      "Récupération du mot de passe",
    ]);
    expect(titles(await searchBacklogItems(backlogId, { q: "page connexion" }))).toEqual([
      "Page de connexion",
    ]);
  });

  it("narrows a query to the asked levels and keeps the bound", async () => {
    expect(titles(await searchBacklogItems(backlogId, { q: "connexion", types: ["tache"] }))).toEqual([
      "Page de connexion",
    ]);
    const indexed = await searchBacklogItems(backlogId, { q: "indexation" });
    expect(indexed).toHaveLength(ITEM_CHOICE_LIMIT);
  });

  it("leaves out an item and everything linked to it in either direction, however many links", async () => {
    const page = byTitle.get("Page de connexion")!;
    const linked = [
      byTitle.get("Connexion")!,
      byTitle.get("Portail")!,
      ...[...byTitle.values()].filter((item) => item.title.startsWith("Indexation ")),
    ];
    expect(linked.length).toBeGreaterThan(ITEM_CHOICE_LIMIT);
    await db.insert(itemLinks).values(
      linked.map((other, index) =>
        index % 2 === 0
          ? { sourceId: page.id, targetId: other.id, type: "relates" as const, createdBy: reporterId }
          : { sourceId: other.id, targetId: page.id, type: "blocks" as const, createdBy: reporterId },
      ),
    );
    try {
      const rows = await searchBacklogItems(backlogId, { excludeLinksOf: page.id });
      expect(titles(rows)).toEqual(["Recherche documentaire", "Récupération du mot de passe", "Formulaire"]);
      expect(titles(await searchBacklogItems(backlogId, { q: "connexion", excludeLinksOf: page.id }))).toEqual([]);
      // An item without links sees everything but itself.
      const recovery = byTitle.get("Récupération du mot de passe")!;
      const fromRecovery = await searchBacklogItems(backlogId, { excludeLinksOf: recovery.id });
      expect(titles(fromRecovery)).toContain("Page de connexion");
      expect(titles(fromRecovery)).not.toContain("Récupération du mot de passe");
    } finally {
      await db.delete(itemLinks).where(or(eq(itemLinks.sourceId, page.id), eq(itemLinks.targetId, page.id)));
    }
  });

  it("treats LIKE wildcards and tsquery operators as plain text", async () => {
    expect(await searchBacklogItems(backlogId, { q: "%" })).toEqual([]);
    expect(await searchBacklogItems(backlogId, { q: "_" })).toEqual([]);
    // Operators are dropped from the words; every word must match (AND).
    expect(titles(await searchBacklogItems(backlogId, { q: "connexion | )" }))).toEqual([
      "Connexion",
      "Page de connexion",
    ]);
    expect(await searchBacklogItems(backlogId, { q: "connexion | portail" })).toEqual([]);
  });
});
