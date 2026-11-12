import "server-only";

import { revalidatePath } from "next/cache";
import { databasePool } from "@/lib/db";
import {
  REALTIME_CHANNEL,
  buildChangeEvent,
  serializeChangeEvent,
  type BacklogChangeKind,
  type ChangeEvent,
} from "@/lib/realtime/events";

export type BacklogChange = {
  /** Defaults to `item`. */
  kind?: BacklogChangeKind;
  backlogId: string;
  /** The touched items when known; omitted means any item may have changed. */
  itemIds?: readonly string[];
  /** `null` for system changes such as a git webhook. */
  actorId: string | null;
};

/**
 * Called by a server action once its service has committed: re-renders the
 * backlog pages for the author and tells the other open tabs to refresh.
 */
export async function invalidateBacklog(backlogKey: string, change: BacklogChange): Promise<void> {
  revalidateBacklogPages(backlogKey);
  await publishBacklogChange(change);
}

/**
 * Re-renders the backlog pages for the author: in the response of the Server
 * Action that calls it, and on their later visits. An action calls it after
 * a use case has published the change itself (JIR-155); the API and the MCP
 * server have no page to re-render.
 */
export function revalidateBacklogPages(backlogKey: string): void {
  revalidatePath(`/b/${backlogKey}`);
  revalidatePath(`/b/${backlogKey}/roadmap`);
  revalidatePath(`/b/${backlogKey}/reports`);
  revalidatePath(`/b/${backlogKey}/le-point`);
}

/**
 * Publishes without re-rendering, for writers outside a server action such as
 * the git webhooks: open tabs refresh through the change event.
 */
export async function publishBacklogChange(change: BacklogChange): Promise<void> {
  await publishChanges([
    buildChangeEvent({
      kind: change.kind ?? "item",
      backlogId: change.backlogId,
      itemIds: change.itemIds,
      actorId: change.actorId,
    }),
  ]);
}

/** Tells the recipients' open tabs that their notification bell changed. */
export async function notifyUsers(userIds: readonly string[], actorId: string | null): Promise<void> {
  await publishChanges(
    [...new Set(userIds)].map((userId) => buildChangeEvent({ kind: "notification", userId, actorId })),
  );
}

/**
 * Best effort: the change is already committed, so a failed NOTIFY must not
 * fail the action. Other tabs then catch up on their next load.
 */
async function publishChanges(events: readonly ChangeEvent[]): Promise<void> {
  if (events.length === 0) return;
  try {
    await databasePool.query("SELECT pg_notify($1, payload) FROM unnest($2::text[]) AS payload", [
      REALTIME_CHANNEL,
      events.map(serializeChangeEvent),
    ]);
  } catch (error) {
    console.error("[realtime] could not publish a change", error);
  }
}
