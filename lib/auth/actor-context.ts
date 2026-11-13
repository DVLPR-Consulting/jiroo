import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";

/** Where a write came from; recorded with each activity (JIR-155). */
export const ACTIVITY_SOURCES = ["ui", "api", "mcp", "webhook"] as const;

export type ActivitySource = (typeof ACTIVITY_SOURCES)[number];

/**
 * The authenticated principal a use case runs for: the user whose rights
 * apply and whose id the activities carry, plus how they reached Jiroo.
 */
export type Actor = {
  actorId: string;
  source: ActivitySource;
  /** The access token that authenticated the actor, when one did (JIR-156). */
  tokenId?: string;
};

const storage = new AsyncLocalStorage<Actor>();

/**
 * Runs `work` for `actor`: everything it awaits can read the actor back with
 * `currentActorContext()`, so the services record the right source without
 * each call site threading it through (same pattern as the request cache).
 */
export function runWithActor<T>(actor: Actor, work: () => Promise<T>): Promise<T> {
  return storage.run(actor, work);
}

/** The actor of the current scope, or `null` outside any use case. */
export function currentActorContext(): Actor | null {
  return storage.getStore() ?? null;
}

/**
 * The source to record on an activity: the current actor's, or the interface
 * when a Server Action writes without going through a use case yet.
 */
export function currentActivitySource(): ActivitySource {
  return storage.getStore()?.source ?? "ui";
}

/** The two attribution columns every activity row carries (JIR-156). */
export function activityAttribution(): { source: ActivitySource; tokenId: string | null } {
  const actor = storage.getStore();
  return { source: actor?.source ?? "ui", tokenId: actor?.tokenId ?? null };
}
