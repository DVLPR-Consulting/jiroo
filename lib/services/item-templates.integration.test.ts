import "dotenv/config";

import { randomInt, randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { requireBacklogPermissionById } from "@/lib/auth/action-authorization";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema/auth";
import {
  backlogPermissionConfigs,
  backlogs,
  itemTemplates,
  labels,
  permissionGrants,
  permissionSchemes,
  securityAuditEvents,
} from "@/lib/db/schema/domain";
import {
  createItemTemplate,
  deleteItemTemplate,
  DUPLICATE_TEMPLATE_MESSAGE,
  FOREIGN_LABEL_MESSAGE,
  listItemTemplates,
  TEMPLATE_LIMIT_MESSAGE,
  updateItemTemplate,
} from "@/lib/services/item-templates";
import { ITEM_TEMPLATES_PER_BACKLOG_MAX } from "@/lib/validation/item-template";

vi.mock("server-only", () => ({}));

const describeDb = process.env.JIROO_RUN_DB_TESTS === "1" ? describe : describe.skip;
const run = randomUUID();
const admin = `tpl-admin-${run}`;
const reader = `tpl-reader-${run}`;
const letters = (count: number) =>
  Array.from({ length: count }, () => String.fromCharCode(65 + randomInt(26))).join("");

describeDb("item templates (JIR-43)", () => {
  let backlogA: string;
  let backlogB: string;
  let schemeId: string;
  let labelA: string;
  let labelB: string;
  let foreignLabel: string;

  beforeAll(async () => {
    await db.insert(user).values([admin, reader].map((id) => ({
      id, name: id, email: `${id}@example.test`, emailVerified: true, role: "contributor",
    })));
    const [a, b] = await db.insert(backlogs)
      .values([{ key: `T${letters(5)}`, name: "Modèles A" }, { key: `U${letters(5)}`, name: "Modèles B" }])
      .returning();
    backlogA = a!.id;
    backlogB = b!.id;
    const [scheme] = await db.insert(permissionSchemes).values({ key: `tpl-${run}`, name: "Modèles" }).returning();
    schemeId = scheme!.id;
    await db.insert(backlogPermissionConfigs).values({ backlogId: backlogA, permissionSchemeId: schemeId });
    await db.insert(permissionGrants).values([
      { permissionKey: "browse_backlog", userId: admin },
      { permissionKey: "administer_backlog", userId: admin },
      { permissionKey: "browse_backlog", userId: reader },
      { permissionKey: "create_items", userId: reader },
    ].map((grant) => ({
      scope: "backlog" as const, permissionSchemeId: schemeId, principalType: "user" as const, ...grant,
    })));
    const stored = await db.insert(labels).values([
      { backlogId: backlogA, name: "ux", color: "#000000" },
      { backlogId: backlogA, name: "api", color: "#111111" },
      { backlogId: backlogB, name: "ailleurs", color: "#222222" },
    ]).returning();
    [labelA, labelB, foreignLabel] = stored.map((label) => label.id) as [string, string, string];
  });

  afterAll(async () => {
    await db.delete(securityAuditEvents).where(inArray(securityAuditEvents.backlogId, [backlogA, backlogB]));
    await db.delete(backlogs).where(inArray(backlogs.id, [backlogA, backlogB]));
    await db.delete(permissionSchemes).where(eq(permissionSchemes.id, schemeId));
    await db.delete(user).where(inArray(user.id, [admin, reader]));
  });

  it("creates a template with its content and audits it", async () => {
    const template = await createItemTemplate({
      backlogId: backlogA, name: "Incident", itemType: "tache", kind: "bug", title: "Incident : ",
      description: "## Impact\n", priority: 3, labelIds: [labelA, labelA],
    }, admin);
    expect(template).toMatchObject({
      name: "Incident", itemType: "tache", kind: "bug", priority: 3, labelIds: [labelA], missingLabelCount: 0,
    });
    const events = await db.select().from(securityAuditEvents)
      .where(and(eq(securityAuditEvents.targetType, "item_template"), eq(securityAuditEvents.targetId, template.id)));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ action: "item_template.create", backlogId: backlogA, oldValue: null });
  });

  it("refuses a second template with the same name, whatever its case", async () => {
    await expect(createItemTemplate({ backlogId: backlogA, name: "incident" }, admin))
      .rejects.toThrow(DUPLICATE_TEMPLATE_MESSAGE);
  });

  it("allows the same name in another backlog", async () => {
    await expect(createItemTemplate({ backlogId: backlogB, name: "Incident" }, admin)).resolves.toBeDefined();
  });

  it("refuses a label from another backlog", async () => {
    await expect(createItemTemplate({ backlogId: backlogA, name: "Croisé", labelIds: [foreignLabel] }, admin))
      .rejects.toThrow(FOREIGN_LABEL_MESSAGE);
  });

  it("drops a deleted label when listed, and says how many", async () => {
    const template = await createItemTemplate(
      { backlogId: backlogA, name: "Deux labels", labelIds: [labelA, labelB] }, admin,
    );
    await db.delete(labels).where(eq(labels.id, labelB));
    const listed = (await listItemTemplates(backlogA)).find((candidate) => candidate.id === template.id);
    expect(listed).toMatchObject({ labelIds: [labelA], missingLabelCount: 1 });
  });

  it("lists only the backlog's own templates, by name", async () => {
    const names = (await listItemTemplates(backlogA)).map((template) => template.name);
    expect(names).toEqual(["Deux labels", "Incident"]);
  });

  it("updates and deletes a template, auditing both", async () => {
    const template = await createItemTemplate({ backlogId: backlogA, name: "Brouillon" }, admin);
    const updated = await updateItemTemplate({ id: template.id, name: "Revue", priority: 1 }, admin);
    expect(updated).toMatchObject({ name: "Revue", priority: 1 });
    await deleteItemTemplate({ id: template.id }, admin);
    expect(await db.select().from(itemTemplates).where(eq(itemTemplates.id, template.id))).toEqual([]);
    const actions = (await db.select({ action: securityAuditEvents.action }).from(securityAuditEvents)
      .where(eq(securityAuditEvents.targetId, template.id))).map((event) => event.action).sort();
    expect(actions).toEqual(["item_template.create", "item_template.delete", "item_template.update"]);
  });

  it("keeps at most the limit per backlog, even when created at once", async () => {
    const existing = (await listItemTemplates(backlogA)).length;
    const attempts = Array.from({ length: ITEM_TEMPLATES_PER_BACKLOG_MAX - existing + 3 }, (_, index) =>
      createItemTemplate({ backlogId: backlogA, name: `Lot ${index}` }, admin));
    const results = await Promise.allSettled(attempts);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(3);
    expect(results.find((result) => result.status === "rejected")).toMatchObject({
      reason: expect.objectContaining({ message: TEMPLATE_LIMIT_MESSAGE }),
    });
    expect(await listItemTemplates(backlogA)).toHaveLength(ITEM_TEMPLATES_PER_BACKLOG_MAX);
  });

  it("reserves managing templates to the backlog's administrators", async () => {
    await expect(requireBacklogPermissionById({ actorId: admin, backlogId: backlogA, permission: "administer_backlog" }))
      .resolves.toBeDefined();
    await expect(requireBacklogPermissionById({ actorId: reader, backlogId: backlogA, permission: "administer_backlog" }))
      .rejects.toThrow();
  });
});
