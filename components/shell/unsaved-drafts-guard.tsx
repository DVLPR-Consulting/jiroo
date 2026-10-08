"use client";

import { useEffect, useSyncExternalStore } from "react";
import { flushAllDrafts, hasUnsavedDrafts, subscribeDrafts } from "@/lib/autosave/registry";

/**
 * Mounted once in the app shell: while any autosave draft is unsaved (even
 * after its editor closed), leaving the page asks for confirmation; hiding
 * the page saves every pending draft.
 */
export function UnsavedDraftsGuard() {
  const unsaved = useSyncExternalStore(subscribeDrafts, hasUnsavedDrafts, () => false);

  useEffect(() => {
    const onHidden = () => {
      if (document.visibilityState === "hidden") void flushAllDrafts();
    };
    document.addEventListener("visibilitychange", onHidden);
    return () => document.removeEventListener("visibilitychange", onHidden);
  }, []);

  useEffect(() => {
    if (!unsaved) return;
    const guard = (event: BeforeUnloadEvent) => {
      void flushAllDrafts();
      event.preventDefault();
      // Legacy browsers only show the prompt with a returnValue.
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [unsaved]);

  return null;
}
