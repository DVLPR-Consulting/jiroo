"use client";

import { useEffect } from "react";
import {
  readRecentKeys,
  RECENT_ITEMS_STORAGE_KEY,
  recordRecentKey,
} from "@/lib/items/recent";

export function RecentItemTracker({ itemKey }: { itemKey: string }) {
  useEffect(() => {
    try {
      const keys = recordRecentKey(
        readRecentKeys(localStorage.getItem(RECENT_ITEMS_STORAGE_KEY)),
        itemKey,
      );
      localStorage.setItem(RECENT_ITEMS_STORAGE_KEY, JSON.stringify(keys));
    } catch {
      // Browser storage may be unavailable (privacy mode, policy, or quota).
    }
  }, [itemKey]);

  return null;
}
