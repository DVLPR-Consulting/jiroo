/**
 * Autosave drafts that outlive their editor, by key (e.g. one per item): a
 * draft whose save is still running or failed after the editor unmounted
 * (drawer closed, other tab, other item) is found again, with its error and
 * « Réessayer », when the editor comes back. An entry is dropped once
 * nothing is mounted and nothing is pending.
 *
 * Session boundary: drafts belong to the user who wrote them, and the
 * registry knows the active (signed-in, server-verified) user. Switching
 * user kills every draft of another user first, without saving it; only
 * the active user's drafts are ever flushed, and nothing is flushed without
 * an active user (e.g. on the login page). The unload warning still covers
 * every unsaved draft.
 */
import type { AutosaveScheduler } from "@/lib/autosave/scheduler";

export type DraftEntry = {
  owner: string;
  scheduler: AutosaveScheduler<unknown>;
  mounted: number;
  unsubscribe: () => void;
};

const entries = new Map<string, DraftEntry>();
const listeners = new Set<() => void>();
let activeUser: string | null = null;

function notify() {
  listeners.forEach((listener) => listener());
}

function drop(key: string, entry: DraftEntry) {
  entry.unsubscribe();
  entry.scheduler.kill();
  entries.delete(key);
}

/**
 * Sets the signed-in user. Changing to another user kills every draft that
 * is not theirs before anything else; `null` (signed out, login page) keeps
 * the drafts for the unload warning but suspends them, so none is sent until
 * their owner is active again.
 */
export function setActiveDraftUser(user: string | null) {
  if (user === activeUser) return;
  if (user !== null) {
    for (const [key, entry] of entries) if (entry.owner !== user) drop(key, entry);
  }
  activeUser = user;
  for (const entry of entries.values()) {
    if (user === null) entry.scheduler.suspend();
    else entry.scheduler.resume();
  }
  notify();
}

export function getActiveDraftUser() {
  return activeUser;
}

/** The kept entry for `key`, or a new one around `create()`, for `user`. */
export function acquireDraft(
  user: string,
  key: string,
  create: () => AutosaveScheduler<unknown>,
): DraftEntry {
  // The editor renders for the verified session user: make them active.
  setActiveDraftUser(user);
  const id = `${user}\u0000${key}`;
  const kept = entries.get(id);
  if (kept) return kept;
  const scheduler = create();
  const entry: DraftEntry = {
    owner: user,
    scheduler,
    mounted: 0,
    unsubscribe: scheduler.subscribe(notify),
  };
  entries.set(id, entry);
  notify();
  return entry;
}

/** Whether the entry is still kept (not killed nor dropped). */
export function isDraftKept(entry: DraftEntry): boolean {
  for (const candidate of entries.values()) if (candidate === entry) return true;
  return false;
}

export function retainDraft(entry: DraftEntry) {
  entry.mounted += 1;
}

/**
 * The editor unmounted. Another signed-in user: the draft is killed. No
 * active user (session ended, or a transient cleanup such as Strict Mode's
 * effect replay): it is kept, suspended since the session went inactive
 * (nothing is sent, not even an armed debounce), and stays guarded. Its owner: it is flushed, then dropped once unmounted and settled.
 */
export function releaseDraft(entry: DraftEntry) {
  entry.mounted -= 1;
  const id = [...entries].find(([, candidate]) => candidate === entry)?.[0];
  if (!id) return;
  if (activeUser === null) return;
  if (entry.owner !== activeUser) {
    drop(id, entry);
    notify();
    return;
  }
  void entry.scheduler.flush().finally(() => {
    if (entries.get(id) !== entry) return;
    if (entry.mounted === 0 && !entry.scheduler.snapshot().pending) {
      entry.unsubscribe();
      entries.delete(id);
      notify();
    }
  });
}

/** Whether any kept draft is not saved yet (debounce, save running or failed). */
export function hasUnsavedDrafts(): boolean {
  for (const entry of entries.values()) if (entry.scheduler.snapshot().pending) return true;
  return false;
}

/** Saves the active user's pending drafts now; nothing without an active user. */
export async function flushAllDrafts(): Promise<void> {
  const own = [...entries.values()].filter((entry) => entry.owner === activeUser);
  await Promise.all(own.map((entry) => entry.scheduler.flush()));
}

/** Forgets every draft without saving it (sign-out, tests). */
export function clearDrafts() {
  for (const [key, entry] of entries) drop(key, entry);
  notify();
}

export function subscribeDrafts(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
