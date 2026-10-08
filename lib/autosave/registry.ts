/**
 * Autosave drafts that outlive their editor, by key (e.g. one per item and
 * user): a draft whose save is still running or failed after the editor
 * unmounted (drawer closed, other tab, other item) is found again, with its
 * error and « Réessayer », when the editor comes back. An entry is dropped
 * once nothing is mounted and nothing is pending. The app shell subscribes
 * to guard the page unload while any draft is unsaved.
 */
import type { AutosaveScheduler } from "@/lib/autosave/scheduler";

export type DraftEntry = {
  scheduler: AutosaveScheduler<unknown>;
  mounted: number;
  unsubscribe: () => void;
};

const entries = new Map<string, DraftEntry>();
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((listener) => listener());
}

/** The kept entry for `key`, or a new one around `create()`. */
export function acquireDraft(key: string, create: () => AutosaveScheduler<unknown>): DraftEntry {
  const kept = entries.get(key);
  if (kept) return kept;
  const scheduler = create();
  const entry: DraftEntry = { scheduler, mounted: 0, unsubscribe: scheduler.subscribe(notify) };
  entries.set(key, entry);
  notify();
  return entry;
}

export function retainDraft(entry: DraftEntry) {
  entry.mounted += 1;
}

/** Flushes; then drops the entry if it is unmounted and settled. */
export function releaseDraft(key: string, entry: DraftEntry) {
  entry.mounted -= 1;
  void entry.scheduler.flush().finally(() => {
    if (entries.get(key) !== entry) return;
    if (entry.mounted === 0 && !entry.scheduler.snapshot().pending) {
      entry.unsubscribe();
      entries.delete(key);
      notify();
    }
  });
}

/** Whether a draft is not saved yet (debounce, save running or failed). */
export function hasUnsavedDrafts(): boolean {
  for (const entry of entries.values()) if (entry.scheduler.snapshot().pending) return true;
  return false;
}

/** Saves every pending draft now; resolves once none is in flight. */
export async function flushAllDrafts(): Promise<void> {
  await Promise.all([...entries.values()].map((entry) => entry.scheduler.flush()));
}

/** Forgets every draft (sign-out, other account, tests). */
export function clearDrafts() {
  for (const entry of entries.values()) {
    entry.unsubscribe();
    // Drop the draft first: dispose would otherwise save it.
    entry.scheduler.discard();
    void entry.scheduler.dispose();
  }
  entries.clear();
  notify();
}

export function subscribeDrafts(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
