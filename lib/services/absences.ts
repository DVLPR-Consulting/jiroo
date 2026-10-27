import "server-only";

import { randomUUID } from "node:crypto";
import { and, asc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import type { Half } from "@/lib/dates/half-days";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema/auth";
import { absences, securityAuditEvents } from "@/lib/db/schema/domain";
import { carve } from "@/lib/le-point/absences";
import { absenceIdInput, carveAbsenceInput, declareAbsenceInput, listAbsencesInput } from "@/lib/validation/absence";

/**
 * Declared absences (JIR-124): the half-days a person is away, from the
 * morning or the afternoon of a day to that of another. They are the fact
 * behind « en congé » in Le point, the person-days of a sprint and the
 * presence page. Callers check the rights (one's own absence, or a member's
 * for the backlog's administrators); every mutation validates, writes and
 * appends its security audit event in one transaction.
 */

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export const ABSENCE_OVERLAP_MESSAGE = "Cette période chevauche une absence déjà déclarée.";
export const ABSENCE_NOT_FOUND_MESSAGE = "Absence introuvable.";

export type AbsenceDto = {
  id: string;
  userId: string;
  /** `YYYY-MM-DD`, both ends included. */
  startDate: string;
  endDate: string;
  /** The morning (`am`) or the afternoon (`pm`) the absence starts and ends with. */
  startHalf: Half;
  endHalf: Half;
  createdBy: string | null;
};

const columns = {
  id: absences.id,
  userId: absences.userId,
  startDate: absences.startDate,
  endDate: absences.endDate,
  startHalf: absences.startHalf,
  endHalf: absences.endHalf,
  createdBy: absences.createdBy,
};

/** What the audit keeps: whose half-days, never more. */
const snapshot = (row: AbsenceDto) => ({
  userId: row.userId, startDate: row.startDate, startHalf: row.startHalf, endDate: row.endDate, endHalf: row.endHalf,
});

async function audit(
  tx: Transaction,
  input: {
    actorId: string;
    action: "absence.declare" | "absence.remove" | "absence.carve";
    backlogId: string;
    absenceId: string;
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
    targetType: "absence",
    targetId: input.absenceId,
    oldValue: input.oldValue,
    newValue: input.newValue,
    requestCorrelationId: input.requestCorrelationId ?? randomUUID(),
  });
}

/** The absences of these people that touch the period, earliest first. */
export async function listAbsences(input: unknown): Promise<AbsenceDto[]> {
  const { userIds, startDate, endDate } = listAbsencesInput.parse(input);
  if (userIds.length === 0) return [];
  return db
    .select(columns)
    .from(absences)
    .where(and(inArray(absences.userId, userIds), lte(absences.startDate, endDate), gte(absences.endDate, startDate)))
    .orderBy(asc(absences.userId), asc(absences.startDate), asc(absences.startHalf), asc(absences.id));
}

/** Whose absence it is, for the caller's rights check; null when unknown. */
export async function getAbsenceOwner(absenceId: string): Promise<string | null> {
  const [row] = await db.select({ userId: absences.userId }).from(absences).where(eq(absences.id, absenceId)).limit(1);
  return row?.userId ?? null;
}

export async function declareAbsence(input: unknown, actorId: string, requestCorrelationId?: string): Promise<AbsenceDto> {
  const data = declareAbsenceInput.parse(input);
  return db.transaction(async (tx) => {
    // One declaration at a time per person, so an overlap is caught under concurrency.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`jiroo:absences:${data.userId}`}))`);
    // Half-days compare as (day, half) pairs: « am » precedes « pm ».
    const [overlap] = await tx
      .select({ id: absences.id })
      .from(absences)
      .where(and(
        eq(absences.userId, data.userId),
        sql`(${absences.startDate}, ${absences.startHalf}) <= (${data.endDate}::date, ${data.endHalf}::text)`,
        sql`(${absences.endDate}, ${absences.endHalf}) >= (${data.startDate}::date, ${data.startHalf}::text)`,
      ))
      .limit(1);
    if (overlap) throw new Error(ABSENCE_OVERLAP_MESSAGE);
    const [created] = await tx
      .insert(absences)
      .values({
        userId: data.userId, startDate: data.startDate, startHalf: data.startHalf, endDate: data.endDate, endHalf: data.endHalf, createdBy: actorId,
      })
      .returning(columns);
    await audit(tx, {
      actorId, action: "absence.declare", backlogId: data.backlogId, absenceId: created!.id,
      oldValue: null, newValue: snapshot(created!), requestCorrelationId,
    });
    return created!;
  });
}

export async function removeAbsence(input: unknown, actorId: string, requestCorrelationId?: string): Promise<AbsenceDto> {
  const { id, backlogId } = absenceIdInput.parse(input);
  return db.transaction(async (tx) => {
    const [current] = await tx.select(columns).from(absences).where(eq(absences.id, id)).for("update");
    if (!current) throw new Error(ABSENCE_NOT_FOUND_MESSAGE);
    await tx.delete(absences).where(eq(absences.id, id));
    await audit(tx, {
      actorId, action: "absence.remove", backlogId, absenceId: id,
      oldValue: snapshot(current), newValue: null, requestCorrelationId,
    });
    return current;
  });
}

/**
 * Takes half-days off an absence, from one to another both included: what
 * remains (none, one or two ranges on working half-days) replaces it. The
 * audit keeps the absence as it was and what remains of it.
 */
export async function carveAbsence(input: unknown, actorId: string, requestCorrelationId?: string): Promise<AbsenceDto[]> {
  const data = carveAbsenceInput.parse(input);
  return db.transaction(async (tx) => {
    const [current] = await tx.select(columns).from(absences).where(eq(absences.id, data.id)).for("update");
    if (!current) throw new Error(ABSENCE_NOT_FOUND_MESSAGE);
    const remaining = carve(
      { user: current.userId, start: current.startDate, end: current.endDate, startHalf: current.startHalf, endHalf: current.endHalf },
      { day: data.startDate, half: data.startHalf },
      { day: data.endDate, half: data.endHalf },
    );
    await tx.delete(absences).where(eq(absences.id, data.id));
    const created = remaining.length === 0
      ? []
      : await tx
        .insert(absences)
        .values(remaining.map((range) => ({
          userId: current.userId, startDate: range.start, startHalf: range.startHalf ?? "am", endDate: range.end, endHalf: range.endHalf ?? "pm", createdBy: current.createdBy,
        })))
        .returning(columns);
    await audit(tx, {
      actorId, action: "absence.carve", backlogId: data.backlogId, absenceId: data.id,
      oldValue: snapshot(current), newValue: { remaining: created.map(snapshot) }, requestCorrelationId,
    });
    return created;
  });
}
