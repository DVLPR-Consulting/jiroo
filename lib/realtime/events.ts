import { z } from "zod";

/** Postgres NOTIFY channel shared by every Jiroo process. */
export const REALTIME_CHANNEL = "jiroo_changes";

/**
 * Above this many items an event stops listing them and means "any item of the
 * backlog". Keeps the payload well under the 8000-byte NOTIFY limit.
 */
export const MAX_EVENT_ITEM_IDS = 50;

const BACKLOG_KINDS = ["item", "sprint", "release", "backlog"] as const;
export type BacklogChangeKind = (typeof BACKLOG_KINDS)[number];
export type ChangeKind = BacklogChangeKind | "notification";

// user.id is TEXT (better-auth), not a uuid.
const userId = z.string().min(1).max(128);

const backlogChangeSchema = z.strictObject({
  v: z.literal(1),
  kind: z.enum(BACKLOG_KINDS),
  backlogId: z.uuid(),
  itemIds: z.array(z.uuid()).max(MAX_EVENT_ITEM_IDS).optional(),
  actorId: userId.nullable(),
  at: z.iso.datetime(),
});

const notificationChangeSchema = z.strictObject({
  v: z.literal(1),
  kind: z.literal("notification"),
  userId,
  actorId: userId.nullable(),
  at: z.iso.datetime(),
});

const changeEventSchema = z.discriminatedUnion("kind", [
  backlogChangeSchema,
  notificationChangeSchema,
]);

/** Identifiers only, never content: clients reload through the usual RBAC-checked paths. */
export type ChangeEvent = z.infer<typeof changeEventSchema>;

export type ChangeInput =
  | {
      kind: BacklogChangeKind;
      backlogId: string;
      itemIds?: readonly string[];
      actorId: string | null;
    }
  | { kind: "notification"; userId: string; actorId: string | null };

export type BacklogChangeEvent = z.infer<typeof backlogChangeSchema>;
export type NotificationChangeEvent = z.infer<typeof notificationChangeSchema>;

export function buildChangeEvent(
  input: Extract<ChangeInput, { kind: BacklogChangeKind }>,
  now?: Date,
): BacklogChangeEvent;
export function buildChangeEvent(
  input: Extract<ChangeInput, { kind: "notification" }>,
  now?: Date,
): NotificationChangeEvent;
export function buildChangeEvent(input: ChangeInput, now?: Date): ChangeEvent;
export function buildChangeEvent(input: ChangeInput, now: Date = new Date()): ChangeEvent {
  const at = now.toISOString();
  if (input.kind === "notification") {
    return { v: 1, kind: "notification", userId: input.userId, actorId: input.actorId, at };
  }
  const itemIds = input.itemIds ? [...new Set(input.itemIds)] : undefined;
  return {
    v: 1,
    kind: input.kind,
    backlogId: input.backlogId,
    ...(itemIds && itemIds.length > 0 && itemIds.length <= MAX_EVENT_ITEM_IDS ? { itemIds } : {}),
    actorId: input.actorId,
    at,
  };
}

export function serializeChangeEvent(event: ChangeEvent): string {
  return JSON.stringify(event);
}

export function parseChangeEvent(payload: string): ChangeEvent | null {
  let raw: unknown;
  try {
    raw = JSON.parse(payload);
  } catch {
    return null;
  }
  const parsed = changeEventSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export type RealtimeSubscription = { backlogId: string | null; userId: string };

export function matchesSubscription(event: ChangeEvent, subscription: RealtimeSubscription): boolean {
  if (event.kind === "notification") return event.userId === subscription.userId;
  return subscription.backlogId !== null && event.backlogId === subscription.backlogId;
}

/** What the browser receives. `resync` is sent after a lost connection, never published. */
export type WireEvent = {
  kind: ChangeKind | "resync";
  itemIds?: string[];
  self: boolean;
};

export function toWireEvent(event: ChangeEvent, viewerId: string): WireEvent {
  return {
    kind: event.kind,
    ...(event.kind !== "notification" && event.itemIds ? { itemIds: event.itemIds } : {}),
    self: event.actorId !== null && event.actorId === viewerId,
  };
}

export type RealtimeReaction = {
  refreshOpenItem: boolean;
  showBanner: boolean;
  refreshBell: boolean;
};

export function reactionFor(
  event: WireEvent,
  context: { openItemId: string | null },
): RealtimeReaction {
  if (event.kind === "resync") {
    return { refreshOpenItem: context.openItemId !== null, showBanner: true, refreshBell: true };
  }
  if (event.kind === "notification") {
    return { refreshOpenItem: false, showBanner: false, refreshBell: true };
  }
  const touchesOpenItem =
    context.openItemId !== null &&
    (event.itemIds === undefined || event.itemIds.includes(context.openItemId));
  return { refreshOpenItem: touchesOpenItem, showBanner: !event.self, refreshBell: false };
}
