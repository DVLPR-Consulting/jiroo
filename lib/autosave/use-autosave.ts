"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import {
  createAutosaveScheduler,
  type AutosaveScheduler,
  type SaveResult,
} from "@/lib/autosave/scheduler";

type Entry = { scheduler: AutosaveScheduler<unknown>; mounted: number };

/**
 * Schedulers that outlive their editor, by key (e.g. one per item): a draft
 * whose save is still running or failed after the editor unmounted (drawer
 * closed, other tab, other item) is found again, with its error and
 * « Réessayer », when the editor comes back. An entry is dropped once
 * nothing is mounted and nothing is pending.
 */
const registry = new Map<string, Entry>();

/** Test helper: forgets every kept draft. */
export function resetAutosaveRegistry() {
  registry.clear();
}

function retain(entry: Entry) {
  entry.mounted += 1;
}

/** Flushes; then drops the kept entry if it is unmounted and settled. */
function release(key: string | undefined, entry: Entry) {
  entry.mounted -= 1;
  void entry.scheduler.flush().finally(() => {
    if (!key || registry.get(key) !== entry) return;
    if (entry.mounted === 0 && !entry.scheduler.snapshot().pending) registry.delete(key);
  });
}

/**
 * React binding of the autosave scheduler: debounced saves, a flush when the
 * component unmounts or the page is hidden, and a `beforeunload` guard only
 * while a change is not saved yet. With a `key`, the scheduler (draft, save
 * state) survives the component until its change is saved.
 */
export function useAutosave<T>({
  key,
  initial,
  revision,
  save,
  delay,
  equals,
}: {
  /** Keeps the draft and its save state beyond this component's lifetime. */
  key?: string;
  initial: T;
  /** Server revision of the initial value (see SaveResult). */
  revision?: number;
  save: (value: T) => Promise<SaveResult>;
  delay: number;
  equals?: (a: T, b: T) => boolean;
}) {
  const [entry] = useState<Entry>(() => {
    const kept = key ? registry.get(key) : undefined;
    if (kept) return kept;
    const created: Entry = {
      scheduler: createAutosaveScheduler<T>({
        initial,
        revision,
        delay,
        equals,
        save,
      }) as AutosaveScheduler<unknown>,
      mounted: 0,
    };
    if (key) registry.set(key, created);
    return created;
  });
  const scheduler = entry.scheduler as AutosaveScheduler<T>;
  const snapshot = useSyncExternalStore(scheduler.subscribe, scheduler.snapshot, scheduler.snapshot);

  // Later saves use the latest callback (fresh props / closures).
  useEffect(() => {
    scheduler.setSave(save);
  });

  // Unmount (and Strict Mode's simulated one): save what is pending now.
  useEffect(() => {
    retain(entry);
    return () => release(key, entry);
  }, [entry, key]);

  useEffect(() => {
    const onHidden = () => {
      if (document.visibilityState === "hidden") void scheduler.flush();
    };
    document.addEventListener("visibilitychange", onHidden);
    return () => document.removeEventListener("visibilitychange", onHidden);
  }, [scheduler]);

  useEffect(() => {
    if (!snapshot.pending) return;
    const guard = (event: BeforeUnloadEvent) => {
      void scheduler.flush();
      event.preventDefault();
      // Legacy browsers only show the prompt with a returnValue.
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [scheduler, snapshot.pending]);

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
