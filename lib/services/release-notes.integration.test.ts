import "dotenv/config";

import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { Client } from "pg";
import { afterAll, describe, expect, it, vi } from "vitest";
import { databasePool, db } from "@/lib/db";
import { user } from "@/lib/db/schema/auth";
import { backlogs, itemFixVersions, items, statuses } from "@/lib/db/schema/domain";
import { getReleaseNotesModel } from "@/lib/services/release-notes";
import { createRelease, publishRelease, getReleaseDetail } from "@/lib/services/releases";

vi.mock("server-only", () => ({}));

const describeDb = process.env.JIROO_RUN_DB_TESTS === "1" ? describe : describe.skip;
const fixtureBacklogIds = new Set<string>();

afterAll(async () => {
  for (const backlogId of fixtureBacklogIds) {
    const client = await databasePool.connect();
    try {
      await client.query("begin");
      await client.query("set local session_replication_role = 'replica'");
      await client.query("delete from release_publication_items where backlog_id = $1", [backlogId]);
      await client.query("delete from release_publications where backlog_id = $1", [backlogId]);
      await client.query("delete from release_events where backlog_id = $1", [backlogId]);
      await client.query("delete from releases where backlog_id = $1", [backlogId]);
      await client.query("set local session_replication_role = 'origin'");
      await client.query("delete from backlogs where id = $1", [backlogId]);
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }
});

async function fixture(name: string) {
  const [actor] = await db.select({ id: user.id }).from(user).limit(1);
  if (!actor) throw new Error("Le seed doit contenir un utilisateur.");
  const suffix = randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase();
  const [backlog] = await db
    .insert(backlogs)
    .values({ key: `RN${suffix}`, name, color: "#475569" })
    .returning();
  fixtureBacklogIds.add(backlog!.id);
  const [todo, done] = await db
    .insert(statuses)
    .values([
      { backlogId: backlog!.id, name: "À faire", category: "todo", order: 0, color: "#64748b" },
      { backlogId: backlog!.id, name: "Terminé", category: "done", order: 1, color: "#64748b" },
    ])
    .returning();
  const release = await createRelease(
    { backlogId: backlog!.id, name: "2026.10", description: "Version d’automne", driverId: actor.id },
    actor.id,
    "notes-create",
  );
  let ordinal = 0;
  const addItems = async (
    values: Array<{ title: string; kind?: "feature" | "bug"; type?: "tache" | "soustache"; done?: boolean }>,
  ) => {
    const rows = values.map((value) => {
      const id = randomUUID();
      ordinal += 1;
      return {
        id,
        key: `${backlog!.key}-${ordinal}`,
        type: value.type ?? ("tache" as const),
        kind: value.kind ?? ("feature" as const),
        backlogId: backlog!.id,
        title: value.title,
        statusId: value.done ? done!.id : todo!.id,
        reporterId: actor.id,
        rank: `a${ordinal.toString().padStart(7, "0")}`,
        path: `root.${id.replaceAll("-", "")}`,
      };
    });
    await db.insert(items).values(rows);
    await db.insert(itemFixVersions).values(
      rows.map((row) => ({ backlogId: backlog!.id, itemId: row.id, releaseId: release.id, addedBy: actor.id })),
    );
    return rows;
  };
  return { actor, backlog: backlog!, release, todo: todo!, done: done!, addItems };
}

describeDb("release notes read model", () => {
  it("reads the current top-level items of the version with their kind and completion", async () => {
    const { backlog, release, addItems } = await fixture("Notes current");
    const [feature, bug] = await addItems([
      { title: "Recherche", done: true },
      { title: "Tri", kind: "bug" },
      { title: "Sous-tâche", type: "soustache", done: true },
    ]);
    const model = await getReleaseNotesModel({ backlogId: backlog.id, releaseId: release.id });
    expect(model).toEqual({
      releaseName: "2026.10",
      description: "Version d’automne",
      effectiveReleaseDate: null,
      truncated: false,
      items: [
        { key: feature!.key, title: "Recherche", kind: "feature", type: "tache", completed: true },
        { key: bug!.key, title: "Tri", kind: "bug", type: "tache", completed: false },
      ],
    });
  });

  it("follows the live state, even for a published version", async () => {
    const { actor, backlog, release, done, addItems } = await fixture("Notes live");
    const [item] = await addItems([{ title: "Avant", done: true }]);
    const detail = await getReleaseDetail(backlog.id, release.id);
    await publishRelease(
      {
        backlogId: backlog.id,
        releaseId: release.id,
        expectedRevision: detail!.revision,
        expectedScopeRevision: detail!.publicationScopeRevision,
        effectiveDate: "2026-08-20",
        incompleteDisposition: "keep",
      },
      actor.id,
      "notes-publish",
    );
    await db.update(items).set({ title: "Après", statusId: done.id }).where(eq(items.id, item!.id));
    const [added] = await addItems([{ title: "Ajouté après publication", kind: "bug" }]);
    const model = await getReleaseNotesModel({ backlogId: backlog.id, releaseId: release.id });
    expect(model?.effectiveReleaseDate).toBe("2026-08-20");
    expect(model?.items.map((entry) => [entry.key, entry.title])).toEqual([
      [item!.key, "Après"],
      [added!.key, "Ajouté après publication"],
    ]);

    await db.update(items).set({ deletedAt: new Date() }).where(eq(items.id, added!.id));
    const afterTrash = await getReleaseNotesModel({ backlogId: backlog.id, releaseId: release.id });
    expect(afterTrash?.items.map((entry) => entry.key)).toEqual([item!.key]);
  });

  it("returns null for a missing or cross-backlog version", async () => {
    const { backlog, release } = await fixture("Notes access");
    const other = await fixture("Notes other");
    await expect(getReleaseNotesModel({ backlogId: other.backlog.id, releaseId: release.id })).resolves.toBeNull();
    await expect(getReleaseNotesModel({ backlogId: backlog.id, releaseId: randomUUID() })).resolves.toBeNull();
  });

  it("keeps a fixed query count for 1 and 1,000 items", async () => {
    const counts: number[] = [];
    for (const size of [1, 1_000]) {
      const { backlog, release, addItems } = await fixture(`Notes volume ${size}`);
      await addItems(Array.from({ length: size }, (_, index) => ({ title: `Item ${index}`, done: true })));
      const querySpy = vi.spyOn(Client.prototype, "query");
      try {
        const model = await getReleaseNotesModel({ backlogId: backlog.id, releaseId: release.id });
        expect(model?.items).toHaveLength(size);
        counts.push(querySpy.mock.calls.length);
      } finally {
        querySpy.mockRestore();
      }
    }
    expect(counts[0]).toBeGreaterThan(0);
    expect(counts[1]).toBe(counts[0]);
  });
});
