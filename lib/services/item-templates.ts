import "server-only";

import { randomUUID } from "node:crypto";
import { and, asc, count, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema/auth";
import { itemTemplates, labels, securityAuditEvents } from "@/lib/db/schema/domain";
import type { ItemKind, ItemType } from "@/lib/design/constants";
import {
  createItemTemplateInput,
  ITEM_TEMPLATES_PER_BACKLOG_MAX,
  itemTemplateIdInput,
  updateItemTemplateInput,
} from "@/lib/validation/item-template";

/**
 * Ticket templates of a backlog (JIR-43). Callers check the permissions
 * (`browse_backlog` to read, `administer_backlog` to write); every mutation
 * validates, writes and appends its security audit event in one transaction.
 */

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export const DUPLICATE_TEMPLATE_MESSAGE = "Un modèle porte déjà ce nom dans ce backlog.";
export const TEMPLATE_NOT_FOUND_MESSAGE = "Modèle introuvable.";
export const TEMPLATE_LIMIT_MESSAGE = `Un backlog compte au plus ${ITEM_TEMPLATES_PER_BACKLOG_MAX} modèles.`;
export const FOREIGN_LABEL_MESSAGE = "Un label choisi n’appartient pas à ce backlog.";

export type ItemTemplateDto = {
  id: string;
  backlogId: string;
  name: string;
  itemType: ItemType | null;
  kind: ItemKind;
  title: string;
  description: string;
  priority: number;
  /** The template's labels that still exist in the backlog. */
  labelIds: string[];
  /** Labels the template named but the backlog no longer has. */
  missingLabelCount: number;
  updatedAt: Date;
};

const columns = {
  id: itemTemplates.id,
  backlogId: itemTemplates.backlogId,
  name: itemTemplates.name,
  itemType: itemTemplates.itemType,
  kind: itemTemplates.kind,
  title: itemTemplates.title,
  description: itemTemplates.description,
  priority: itemTemplates.priority,
  labelIds: itemTemplates.labelIds,
  updatedAt: itemTemplates.updatedAt,
};

type TemplateRow = { [K in keyof typeof columns]: (typeof itemTemplates.$inferSelect)[K] };

function toDto(row: TemplateRow, liveLabelIds: ReadonlySet<string>): ItemTemplateDto {
  const kept = row.labelIds.filter((id) => liveLabelIds.has(id));
  return { ...row, labelIds: kept, missingLabelCount: row.labelIds.length - kept.length };
}

/** A backlog's templates by name, labels checked against its live labels. */
export async function listItemTemplates(backlogId: string): Promise<ItemTemplateDto[]> {
  const [rows, backlogLabels] = await Promise.all([
    db.select(columns).from(itemTemplates).where(eq(itemTemplates.backlogId, backlogId))
      .orderBy(asc(itemTemplates.name), asc(itemTemplates.id)),
    db.select({ id: labels.id }).from(labels).where(eq(labels.backlogId, backlogId)),
  ]);
  const live = new Set(backlogLabels.map((label) => label.id));
  return rows.map((row) => toDto(row, live));
}

/** The backlog a template belongs to, for the caller's permission check. */
export async function getItemTemplateBacklogId(templateId: string): Promise<string | null> {
  const { id } = itemTemplateIdInput.parse({ id: templateId });
  const [row] = await db.select({ backlogId: itemTemplates.backlogId }).from(itemTemplates)
    .where(eq(itemTemplates.id, id)).limit(1);
  return row?.backlogId ?? null;
}

async function assertBacklogLabels(tx: Transaction, backlogId: string, labelIds: string[]): Promise<void> {
  if (labelIds.length === 0) return;
  const found = await tx.select({ id: labels.id }).from(labels)
    .where(and(eq(labels.backlogId, backlogId), inArray(labels.id, labelIds)));
  if (found.length !== labelIds.length) throw new Error(FOREIGN_LABEL_MESSAGE);
}

async function audit(
  tx: Transaction,
  input: {
    actorId: string;
    action: "item_template.create" | "item_template.update" | "item_template.delete";
    backlogId: string;
    templateId: string;
    oldValue: Record<string, unknown> | null;
    newValue: Record<string, unknown> | null;
    requestCorrelationId?: string;
  },
): Promise<void> {
  const [actor] = await tx.select({ name: user.name }).from(user).where(eq(user.id, input.actorId)).limit(1);
  if (!actor) throw new Error("Utilisateur introuvable.");
  await tx.insert(securityAuditEvents).values({
    actorId: input.actorId,
    actorLabel: actor.name,
    action: input.action,
    scope: "backlog",
    backlogId: input.backlogId,
    targetType: "item_template",
    targetId: input.templateId,
    oldValue: input.oldValue,
    newValue: input.newValue,
    requestCorrelationId: input.requestCorrelationId ?? randomUUID(),
  });
}

/** What the audit keeps: the template's content, never more. */
function snapshot(row: Omit<TemplateRow, "id" | "backlogId" | "updatedAt">) {
  return {
    name: row.name,
    itemType: row.itemType,
    kind: row.kind,
    title: row.title,
    priority: row.priority,
    labelIds: row.labelIds,
    descriptionLength: row.description.length,
  };
}

function isUniqueViolation(error: unknown): boolean {
  const cause = (error as { cause?: { code?: string } } | null)?.cause;
  return (error as { code?: string } | null)?.code === "23505" || cause?.code === "23505";
}

export async function createItemTemplate(
  input: unknown,
  actorId: string,
  requestCorrelationId?: string,
): Promise<ItemTemplateDto> {
  const data = createItemTemplateInput.parse(input);
  try {
    return await db.transaction(async (tx) => {
      // One creation at a time per backlog, so the limit holds under concurrency.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`jiroo:item-templates:${data.backlogId}`}))`);
      const [stored] = await tx.select({ total: count() }).from(itemTemplates)
        .where(eq(itemTemplates.backlogId, data.backlogId));
      if ((stored?.total ?? 0) >= ITEM_TEMPLATES_PER_BACKLOG_MAX) throw new Error(TEMPLATE_LIMIT_MESSAGE);
      await assertBacklogLabels(tx, data.backlogId, data.labelIds);
      const [created] = await tx.insert(itemTemplates).values({ ...data, createdBy: actorId }).returning(columns);
      await audit(tx, {
        actorId, action: "item_template.create", backlogId: data.backlogId, templateId: created!.id,
        oldValue: null, newValue: snapshot(created!), requestCorrelationId,
      });
      return toDto(created!, new Set(data.labelIds));
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new Error(DUPLICATE_TEMPLATE_MESSAGE);
    throw error;
  }
}

export async function updateItemTemplate(
  input: unknown,
  actorId: string,
  requestCorrelationId?: string,
): Promise<ItemTemplateDto> {
  const { id, ...data } = updateItemTemplateInput.parse(input);
  try {
    return await db.transaction(async (tx) => {
      const [current] = await tx.select(columns).from(itemTemplates).where(eq(itemTemplates.id, id)).for("update");
      if (!current) throw new Error(TEMPLATE_NOT_FOUND_MESSAGE);
      await assertBacklogLabels(tx, current.backlogId, data.labelIds);
      const [updated] = await tx.update(itemTemplates).set({ ...data, updatedAt: new Date() })
        .where(eq(itemTemplates.id, id)).returning(columns);
      await audit(tx, {
        actorId, action: "item_template.update", backlogId: current.backlogId, templateId: id,
        oldValue: snapshot(current), newValue: snapshot(updated!), requestCorrelationId,
      });
      return toDto(updated!, new Set(data.labelIds));
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new Error(DUPLICATE_TEMPLATE_MESSAGE);
    throw error;
  }
}

/** Removes the template only: items created from it are untouched. */
export async function deleteItemTemplate(
  input: unknown,
  actorId: string,
  requestCorrelationId?: string,
): Promise<{ backlogId: string }> {
  const { id } = itemTemplateIdInput.parse(input);
  return db.transaction(async (tx) => {
    const [current] = await tx.select(columns).from(itemTemplates).where(eq(itemTemplates.id, id)).for("update");
    if (!current) throw new Error(TEMPLATE_NOT_FOUND_MESSAGE);
    await tx.delete(itemTemplates).where(eq(itemTemplates.id, id));
    await audit(tx, {
      actorId, action: "item_template.delete", backlogId: current.backlogId, templateId: id,
      oldValue: snapshot(current), newValue: null, requestCorrelationId,
    });
    return { backlogId: current.backlogId };
  });
}
