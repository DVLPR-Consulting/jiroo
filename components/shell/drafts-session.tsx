"use client";

import { useEffect } from "react";
import { getActiveDraftUser, setActiveDraftUser } from "@/lib/autosave/registry";

/**
 * Rendered by the authenticated layout with the server-verified session
 * user: tells the draft registry who is signed in, so another user's kept
 * drafts are dropped (never shown nor saved) and none are flushed once the
 * session ends.
 */
export function DraftsSession({ userId }: { userId: string }) {
  useEffect(() => {
    setActiveDraftUser(userId);
    return () => {
      if (getActiveDraftUser() === userId) setActiveDraftUser(null);
    };
  }, [userId]);
  return null;
}
