"use client";

import { useSyncExternalStore } from "react";
import {
  shortcutsEnabledSnapshot,
  subscribeShortcutsEnabled,
} from "@/lib/shortcuts/preferences";

/** Whether single-key shortcuts are on for this device (WCAG 2.1.4). */
export function useShortcutsEnabled(): boolean {
  return useSyncExternalStore(
    subscribeShortcutsEnabled,
    shortcutsEnabledSnapshot,
    () => true,
  );
}
