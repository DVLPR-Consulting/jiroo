"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { createAutosaveScheduler, type AutosaveScheduler, type SaveResult } from "@/lib/autosave/scheduler";
import { acquireDraft, clearDrafts, releaseDraft, retainDraft } from "@/lib/autosave/registry";

/** Test helper: forgets every kept draft. */
export function resetAutosaveRegistry() {
  clearDrafts();
}

/**
 * React binding of the autosave scheduler: debounced saves and a flush when
 * the component unmounts. The scheduler (draft, save state) lives in the
 * draft registry under `key` until its change is saved, so it survives the
 * component; the app shell's UnsavedDraftsGuard protects the page unload
 * and flushes when the page is hidden.
 */
export function useAutosave<T>({
  key,
  initial,
  revision,
  save,
  delay,
  equals,
}: {
  /** Identifies the draft (e.g. per user and item). */
  key: string;
  initial: T;
  /** Server revision of the initial value (see SaveResult). */
  revision?: number;
  save: (value: T) => Promise<SaveResult>;
  delay: number;
  equals?: (a: T, b: T) => boolean;
}) {
  const [entry] = useState(() =>
    acquireDraft(
      key,
      () =>
        createAutosaveScheduler<T>({ initial, revision, delay, equals, save }) as
          AutosaveScheduler<unknown>,
    ),
  );
  const scheduler = entry.scheduler as AutosaveScheduler<T>;
  const snapshot = useSyncExternalStore(scheduler.subscribe, scheduler.snapshot, scheduler.snapshot);

  // Later saves use the latest callback (fresh props / closures).
  useEffect(() => {
    scheduler.setSave(save);
  });

  // Unmount (and Strict Mode's simulated one): save what is pending now.
  useEffect(() => {
    retainDraft(entry);
    return () => releaseDraft(key, entry);
  }, [entry, key]);

  return {
    ...snapshot,
    current: scheduler.current,
    change: scheduler.change,
    flush: scheduler.flush,
    retry: scheduler.retry,
    adopt: scheduler.adopt,
    discard: scheduler.discard,
  };
}
