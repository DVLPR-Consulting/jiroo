import "server-only";

import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { browseAccessPredicate } from "@/lib/auth/accessible-backlogs";
import { checkPermission, listAssignableUsersForBacklogs } from "@/lib/auth/authorization";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema/auth";
import { backlogs } from "@/lib/db/schema/domain";
import type { PresenceProfile } from "@/lib/presence/model";

export type PresenceMember = { id: string; name: string; profile: PresenceProfile };
export type PresenceBacklog = { id: string; key: string; name: string; color: string; members: PresenceMember[] };

/** Twelve calendar months, clamping February 29 to February 28. */
function aYearAgo(now: Date): Date {
  const result = new Date(now);
  result.setUTCDate(1);
  result.setUTCFullYear(now.getUTCFullYear() - 1);
  result.setUTCDate(Math.min(now.getUTCDate(), new Date(Date.UTC(result.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate()));
  return result;
}

/**
 * Sidebar-visible backlogs and their assignable members. Without browse_users,
 * only the reader is returned, even if they cannot be assigned work.
 * Nicolas's observed-profile rule: current assignment or an assignment change
 * in the last twelve months means developer, otherwise product. It is never
 * a permission role. A person's profile spans only the backlogs visible here;
 * an assignment in a hidden/archived backlog must not disclose that backlog.
 */
export async function loadPresenceScope(actorId: string): Promise<PresenceBacklog[]> {
  const directory = await checkPermission({ actorId, permission: "browse_users", scope: { type: "global" } });
  const now = new Date();
  return db.transaction(async (tx) => {
    const visible = await tx.select({ id: backlogs.id, key: backlogs.key, name: backlogs.name, color: backlogs.color })
      .from(backlogs).where(and(isNull(backlogs.archivedAt), browseAccessPredicate(actorId))).orderBy(asc(backlogs.name));
    if (visible.length === 0) return [];
    const ids = visible.map((row) => row.id);
    const directoryRows = directory.allowed ? await listAssignableUsersForBacklogs(ids, tx) : null;
    const self = directoryRows === null ? await tx.select({ id: user.id, name: user.name }).from(user).where(eq(user.id, actorId)).limit(1) : [];
    const people = new Set(directoryRows ? directoryRows.map((person) => person.id) : self.map((person) => person.id));
    const observed = people.size === 0 ? [] : (await tx.execute<{ userId: string }>(sql`
      select assignee_id as "userId" from items
      where items.backlog_id in (${sql.join(ids.map((id) => sql`${id}`), sql`, `)}) and items.deleted_at is null
        and assignee_id in (${sql.join([...people].map((id) => sql`${id}`), sql`, `)})
      union
      select assignment.user_id as "userId"
      from activities change join items on items.id = change.item_id
      cross join lateral unnest(array[change.old_value, change.new_value]) as assignment(user_id)
      where items.backlog_id in (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})
        and change.action = 'update' and change.field = 'assignee'
        and change.at >= ${aYearAgo(now)} and change.at <= ${now}
        and assignment.user_id in (${sql.join([...people].map((id) => sql`${id}`), sql`, `)})
    `)).rows;
    const developers = new Set(observed.map((row) => row.userId));
    const members = new Map<string, PresenceMember[]>();
    for (const person of directoryRows ?? []) {
      const group = members.get(person.backlogId) ?? [];
      group.push({ id: person.id, name: person.name, profile: developers.has(person.id) ? "developer" : "product" });
      members.set(person.backlogId, group);
    }
    return visible.map((row) => ({ ...row, members: directoryRows !== null ? members.get(row.id) ?? [] : self.map((person) => ({ ...person, profile: developers.has(person.id) ? "developer" : "product" })) }));
  }, { isolationLevel: "repeatable read", accessMode: "read only" });
}


