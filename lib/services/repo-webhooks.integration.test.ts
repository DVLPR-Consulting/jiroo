import "dotenv/config";

import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { itemRefs, repoConnections } from "@/lib/db/schema/domain";
import type { DevRefCandidate } from "@/lib/repo-webhooks/events";
import { addRef, listRefsForItem, removeRef } from "@/lib/services/refs";
import { createRepoConnection, deleteRepoConnection, setRepoConnectionEnabled } from "@/lib/services/repo-connections";
import {
  countRecentDeliveries,
  findWebhookConnection,
  ingestWebhookReferences,
  recordWebhookError,
  recordWebhookEvent,
  type WebhookConnection,
} from "@/lib/services/repo-webhooks";
import {
  createRepoConnectionFixture,
  deleteRepoConnectionFixture,
  ensureTestSecretKey,
  type RepoConnectionFixture,
} from "@/lib/services/repo-connections.integration-fixture";

vi.mock("server-only", () => ({}));

const describeDb = process.env.JIROO_RUN_DB_TESTS === "1" ? describe : describe.skip;

function pr(texts: string[], state: DevRefCandidate["state"], occurredAt: string, title = texts[0]!): DevRefCandidate {
  return { kind: "pr", id: "42", title, authorName: "alex-m", state, occurredAt: new Date(occurredAt), texts };
}

describeDb("repository webhook ingestion (JIR-95)", () => {
  let fixture: RepoConnectionFixture;
  let connection: WebhookConnection;

  beforeAll(async () => {
    ensureTestSecretKey();
    fixture = await createRepoConnectionFixture("Webhooks");
    const created = await createRepoConnection({
      backlogId: fixture.backlogA.id,
      provider: "github",
      repositoryPath: "example-org/example-repo",
    }, fixture.users.admin);
    connection = (await findWebhookConnection(created.connection.id, "github"))!;
  });

  afterAll(async () => {
    if (fixture) await deleteRepoConnectionFixture(fixture);
  });

  async function refsOf(itemId: string) {
    return db.select().from(itemRefs).where(eq(itemRefs.itemId, itemId)).orderBy(itemRefs.kind, itemRefs.externalId);
  }

  it("finds only enabled connections of the right forge", async () => {
    expect(connection).toMatchObject({ backlogKey: fixture.backlogA.key, repositoryPath: "example-org/example-repo" });
    expect(await findWebhookConnection(connection.id, "gitlab")).toBeNull();
    await setRepoConnectionEnabled({ connectionId: connection.id, enabled: false }, fixture.users.admin);
    expect(await findWebhookConnection(connection.id, "github")).toBeNull();
    await setRepoConnectionEnabled({ connectionId: connection.id, enabled: true }, fixture.users.admin);
  });

  it("links branches and commits to the live items of the connected backlog only", async () => {
    const { first, second, deleted, foreign } = fixture.items;
    const result = await ingestWebhookReferences({
      connection,
      deliveryId: "push-1",
      refs: [
        { kind: "branch", id: `feature/${first.key.toLowerCase()}-login`, title: `feature/${first.key.toLowerCase()}-login`, authorName: "alex-m", state: null, occurredAt: new Date("2026-10-13T07:20:00Z"), texts: [`feature/${first.key.toLowerCase()}-login`] },
        { kind: "commit", id: "1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b", title: `${first.key} and ${second.key}`, authorName: "Alex Martin", state: null, occurredAt: new Date("2026-10-13T07:15:00Z"), texts: [`${first.key} and ${second.key}`] },
        { kind: "commit", id: "9f1c2b7e4d3a5f6b8c0d1e2f3a4b5c6d7e8f9a0b", title: `${deleted.key} ${foreign.key}`, authorName: "Alex Martin", state: null, occurredAt: new Date("2026-10-13T07:16:00Z"), texts: [`${deleted.key} ${foreign.key}`] },
      ],
    });
    expect(result).toEqual({ duplicate: false, linked: 3 });

    const firstRefs = await refsOf(first.id);
    expect(firstRefs.map((ref) => [ref.kind, ref.url, ref.state])).toEqual([
      ["commit", "https://github.com/example-org/example-repo/commit/1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b", null],
      ["branch", `https://github.com/example-org/example-repo/tree/feature/${first.key.toLowerCase()}-login`, null],
    ]);
    expect(firstRefs[0]).toMatchObject({
      connectionId: connection.id,
      provider: "github",
      externalId: "github.com/example-org/example-repo#1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b",
      authorName: "Alex Martin",
      createdBy: null,
    });
    expect(await refsOf(second.id)).toHaveLength(1);
    expect(await refsOf(deleted.id)).toHaveLength(0);
    expect(await refsOf(foreign.id)).toHaveLength(0);

    const [status] = await db.select().from(repoConnections).where(eq(repoConnections.id, connection.id));
    expect(status!.lastEventAt).not.toBeNull();
    expect(status!.lastError).toBeNull();
  });

  it("ignores a replayed delivery and never duplicates a reference", async () => {
    const { first } = fixture.items;
    const before = await refsOf(first.id);
    const refs: DevRefCandidate[] = [{ kind: "commit", id: "1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b", title: first.key, authorName: "Alex Martin", state: null, occurredAt: new Date("2026-10-13T07:15:00Z"), texts: [first.key] }];
    expect(await ingestWebhookReferences({ connection, deliveryId: "push-1", refs })).toEqual({ duplicate: true, linked: 0 });
    expect(await ingestWebhookReferences({ connection, deliveryId: "push-2", refs })).toEqual({ duplicate: false, linked: 1 });
    expect(await ingestWebhookReferences({ connection, deliveryId: null, refs })).toEqual({ duplicate: false, linked: 1 });
    expect((await refsOf(first.id)).map((ref) => ref.id)).toEqual(before.map((ref) => ref.id));
  });

  it("follows a pull request from opened to merged, and ignores a late older event", async () => {
    const { second } = fixture.items;
    await ingestWebhookReferences({ connection, deliveryId: "pr-opened", refs: [pr(["Login form", `feature/${second.key}`], "open", "2026-10-13T08:00:00Z")] });
    let [ref] = (await refsOf(second.id)).filter((candidate) => candidate.kind === "pr");
    expect(ref).toMatchObject({ state: "open", title: "Login form", url: "https://github.com/example-org/example-repo/pull/42" });

    await ingestWebhookReferences({ connection, deliveryId: "pr-merged", refs: [pr([`${second.key} Login form`, `feature/${second.key}`], "merged", "2026-10-13T10:00:00Z")] });
    await ingestWebhookReferences({ connection, deliveryId: "pr-late", refs: [pr(["Login form", `feature/${second.key}`], "open", "2026-10-13T09:00:00Z")] });
    const prRefs = (await refsOf(second.id)).filter((candidate) => candidate.kind === "pr");
    expect(prRefs).toHaveLength(1);
    [ref] = prRefs;
    expect(ref).toMatchObject({ state: "merged", title: `${second.key} Login form` });
  });

  it("lists detected references next to manual links, and only lets manual links be removed", async () => {
    const { second } = fixture.items;
    const manual = await addRef({ itemId: second.id, url: "https://github.com/acme/api/pull/9" }, fixture.users.admin);
    const listed = await listRefsForItem(second.id);
    const detected = listed.find((ref) => ref.kind === "pr" && ref.provider === "github");
    expect(detected).toMatchObject({ state: "merged", authorName: "alex-m", title: `${second.key} Login form` });
    expect(listed.find((ref) => ref.id === manual.id)).toMatchObject({ provider: null, state: null });

    await removeRef(detected!.id);
    await removeRef(manual.id);
    const remaining = (await listRefsForItem(second.id)).map((ref) => ref.id);
    expect(remaining).toContain(detected!.id);
    expect(remaining).not.toContain(manual.id);
  });

  it("lets the references of a deleted connection be removed", async () => {
    const { first } = fixture.items;
    const other = await createRepoConnection({
      backlogId: fixture.backlogA.id,
      provider: "github",
      repositoryPath: "example-org/orphaned",
    }, fixture.users.admin);
    const otherConnection = (await findWebhookConnection(other.connection.id, "github"))!;
    await ingestWebhookReferences({
      connection: otherConnection,
      deliveryId: "orphan-1",
      refs: [{ kind: "branch", id: first.key, title: first.key, authorName: null, state: null, occurredAt: new Date(), texts: [first.key] }],
    });
    const [orphan] = (await listRefsForItem(first.id)).filter((ref) => ref.connectionId === other.connection.id);
    await removeRef(orphan!.id);
    expect((await listRefsForItem(first.id)).map((ref) => ref.id)).toContain(orphan!.id);

    await deleteRepoConnection({ connectionId: other.connection.id }, fixture.users.admin);
    await removeRef(orphan!.id);
    expect((await listRefsForItem(first.id)).map((ref) => ref.id)).not.toContain(orphan!.id);
  });

  it("counts pings and ignored events against the delivery budget", async () => {
    const before = await countRecentDeliveries(connection.id, 60_000);
    await recordWebhookEvent(connection.id, "ping-1");
    await recordWebhookEvent(connection.id, "ping-1");
    await recordWebhookEvent(connection.id, "ignored-1");
    expect(await countRecentDeliveries(connection.id, 60_000)).toBe(before + 2);
  });

  it("throttles the recorded error of a failing connection", async () => {
    await recordWebhookError(connection.id, "Signature invalide.");
    const [firstError] = await db.select().from(repoConnections).where(eq(repoConnections.id, connection.id));
    await recordWebhookError(connection.id, "Signature invalide.");
    const [again] = await db.select().from(repoConnections).where(eq(repoConnections.id, connection.id));
    expect(again!.lastError).toBe("Signature invalide.");
    expect(again!.lastErrorAt).toEqual(firstError!.lastErrorAt);
    await recordWebhookError(connection.id, "Jeton secret invalide.");
    const [changed] = await db.select().from(repoConnections).where(inArray(repoConnections.id, [connection.id]));
    expect(changed!.lastError).toBe("Jeton secret invalide.");
  });
});
