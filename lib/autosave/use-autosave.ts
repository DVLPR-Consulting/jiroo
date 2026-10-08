"use client";

import { useEffect, useState } from "react";
import {
  createAutosaveScheduler,
  type AutosaveSnapshot,
  type SaveResult,
} from "@/lib/autosave/scheduler";

const IDLE: AutosaveSnapshot = { status: "idle", error: null, pending: false };

/**
 * React binding of the autosave scheduler: debounced saves, a flush when the
 * component unmounts (drawer closed, item switched) or the page is hidden,
 * and a `beforeunload` guard only while a change is not saved yet.
 */
export function useAutosave<T>({
  initial,
  save,
  delay,
  equals,
}: {
  initial: T;
  save: (value: T) => Promise<SaveResult>;
  delay: number;
  equals?: (a: T, b: T) => boolean;
}) {
  const [snapshot, setSnapshot] = useState<AutosaveSnapshot>(IDLE);
  const [scheduler] = useState(() =>
    createAutosaveScheduler<T>({ initial, delay, equals, save, onChange: setSnapshot }),
  );
  // Later saves use the latest callback (fresh props / closures).
  useEffect(() => {
    scheduler.setSave(save);
  });

  // Unmount (and Strict Mode's simulated one): save what is pending now.
  // flush keeps the scheduler usable, unlike dispose.
  useEffect(() => () => void scheduler.flush(), [scheduler]);

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
    change: scheduler.change,
    flush: scheduler.flush,
    retry: scheduler.retry,
    adopt: scheduler.adopt,
  };
}
