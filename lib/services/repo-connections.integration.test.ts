import "dotenv/config";

import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { requireRepoConnectionPermission } from "@/lib/auth/action-authorization";
import { deploymentSecretBoxKey, openSecret } from "@/lib/crypto/secret-box";
import { db } from "@/lib/db";
import { itemRefs, repoConnections, securityAuditEvents } from "@/lib/db/schema/domain";
import {
  createRepoConnection,
  deleteRepoConnection,
  listRepoConnections,
  regenerateRepoConnectionSecret,
  setRepoConnectionEnabled,
} from "@/lib/services/repo-connections";
import {
  createRepoConnectionFixture,
  deleteRepoConnectionFixture,
  ensureTestSecretKey,
  type RepoConnectionFixture,
} from "@/lib/services/repo-connections.integration-fixture";

vi.mock("server-only", () => ({}));

const describeDb = process.env.JIROO_RUN_DB_TESTS === "1" ? describe : describe.skip;

describeDb("repository connections (JIR-95)", () => {
  let fixture: RepoConnectionFixture;

  beforeAll(async () => {
    ensureTestSecretKey();
    fixture = await createRepoConnectionFixture("Connexions");
  });

  afterAll(async () => {
    if (fixture) await deleteRepoConnectionFixture(fixture);
  });

  async function storedCiphertext(connectionId: string) {
    const [row] = await db
      .select({ secretCiphertext: repoConnections.secretCiphertext })
      .from(repoConnections)
      .where(eq(repoConnections.id, connectionId));
    return row!.secretCiphertext;
  }

  async function auditEvents(connectionId: string) {
    return db
      .select()
      .from(securityAuditEvents)
      .where(and(
        eq(securityAuditEvents.targetType, "repo_connection"),
        eq(securityAuditEvents.targetId, connectionId),
      ))
      .orderBy(securityAuditEvents.createdAt);
  }

  it("creates a connection whose secret is returned once and stored encrypted", async () => {
    const { connection, secret } = await createRepoConnection({
      backlogId: fixture.backlogA.id,
      provider: "github",
      repositoryPath: "https://github.com/Example-Org/Example-Repo.git",
    }, fixture.users.admin, "repo-create");

    expect(connection).toMatchObject({
      provider: "github",
      instanceUrl: "https://github.com",
      repositoryPath: "example-org/example-repo",
      enabled: true,
      lastEventAt: null,
    });
    expect(connection).not.toHaveProperty("secretCiphertext");
    expect(secret).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const ciphertext = await storedCiphertext(connection.id);
    expect(ciphertext).not.toContain(secret);
    expect(openSecret(ciphertext, deploymentSecretBoxKey())).toBe(secret);

    const [event] = await auditEvents(connection.id);
    expect(event).toMatchObject({
      action: "repo_connection_created",
      backlogId: fixture.backlogA.id,
      requestCorrelationId: "repo-create",
    });
    expect(JSON.stringify(event)).not.toContain(secret);
    expect(await listRepoConnections(fixture.backlogA.id)).toEqual([connection]);
  });

  it("refuses connecting the same repository twice to a backlog", async () => {
    const input = { backlogId: fixture.backlogA.id, provider: "gitlab", repositoryPath: "group/dup" };
    await createRepoConnection(input, fixture.users.admin);
    await expect(createRepoConnection({ ...input, repositoryPath: "Group/Dup" }, fixture.users.admin))
      .rejects.toThrow("Ce dépôt est déjà connecté à ce backlog.");
  });

  it("regenerates the secret, disables, re-enables and deletes, auditing each step", async () => {
    const { connection, secret } = await createRepoConnection({
      backlogId: fixture.backlogA.id,
      provider: "gitlab",
      repositoryPath: "juridiction/greffe/api",
      instanceUrl: "https://gitlab.example.invalid",
    }, fixture.users.admin);
    const regenerated = await regenerateRepoConnectionSecret({ connectionId: connection.id }, fixture.users.admin);
    expect(regenerated.secret).not.toBe(secret);
    expect(openSecret(await storedCiphertext(connection.id), deploymentSecretBoxKey())).toBe(regenerated.secret);

    expect((await setRepoConnectionEnabled({ connectionId: connection.id, enabled: false }, fixture.users.admin)).enabled).toBe(false);
    expect((await setRepoConnectionEnabled({ connectionId: connection.id, enabled: true }, fixture.users.admin)).enabled).toBe(true);

    await db.insert(itemRefs).values({
      itemId: fixture.items.first.id,
      url: "https://gitlab.example.invalid/juridiction/greffe/api/-/merge_requests/1",
      kind: "pr",
      connectionId: connection.id,
      provider: "gitlab",
      externalId: "gitlab.example.invalid/juridiction/greffe/api#1",
    });
    await deleteRepoConnection({ connectionId: connection.id }, fixture.users.admin);
    const [kept] = await db.select().from(itemRefs).where(eq(itemRefs.itemId, fixture.items.first.id));
    expect(kept).toMatchObject({ connectionId: null, provider: "gitlab" });

    const actions = (await auditEvents(connection.id)).map((event) => event.action);
    expect(actions).toEqual([
      "repo_connection_created",
      "repo_connection_secret_regenerated",
      "repo_connection_disabled",
      "repo_connection_enabled",
      "repo_connection_deleted",
    ]);
    for (const event of await auditEvents(connection.id)) {
      expect(JSON.stringify(event)).not.toContain(secret);
      expect(JSON.stringify(event)).not.toContain(regenerated.secret);
    }
  });

  it("lets only the backlog's administrators manage a connection", async () => {
    const { connection } = await createRepoConnection({
      backlogId: fixture.backlogA.id,
      provider: "github",
      repositoryPath: "acme/rights",
    }, fixture.users.admin);
    const check = (actorId: string) => requireRepoConnectionPermission({
      actorId,
      connectionId: connection.id,
      permission: "administer_backlog",
    });
    await expect(check(fixture.users.admin)).resolves.toMatchObject({
      backlogId: fixture.backlogA.id,
      backlogKey: fixture.backlogA.key,
    });
    await expect(check(fixture.users.reader)).rejects.toMatchObject({ name: "PermissionDeniedError" });
    await expect(check(fixture.users.outsider)).rejects.toMatchObject({ name: "ResourceNotFoundError" });
  });
});
