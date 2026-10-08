"use client";

import { useEffect, useSyncExternalStore } from "react";
import { flushAllDrafts, hasUnsavedDrafts, subscribeDrafts } from "@/lib/autosave/registry";

/**
 * Mounted once in the root layout, so it survives a redirect to /login:
 * while any kept draft is unsaved (even after its editor or the whole
 * authenticated shell unmounted), leaving the page asks for confirmation.
 * Hiding the page saves the active user's pending drafts (none without a
 * signed-in user).
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
