"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSidebarState } from "@/components/shell/sidebar-state";
import { useShortcutHandler } from "@/components/shortcuts/keyboard-shortcuts-provider";
import {
  moveShortcutFocus,
  openCurrentShortcutItem,
} from "@/lib/shortcuts/list-navigation";
import {
  backlogKeyFromPath,
  GO_SHORTCUT_IDS,
  goShortcutHref,
  LAST_BACKLOG_STORAGE_KEY,
  OPEN_SEARCH_EVENT,
  type GoShortcutId,
} from "@/lib/shortcuts/navigation";

function readLastBacklog(): string | null {
  try {
    return window.localStorage.getItem(LAST_BACKLOG_STORAGE_KEY);
  } catch {
    return null;
  }
}

function GoShortcut({ id, backlogKey }: { id: GoShortcutId; backlogKey: string | null }) {
  const router = useRouter();
  useShortcutHandler(id, () => {
    const href = goShortcutHref(id, backlogKey ?? readLastBacklog());
    if (href) router.push(href);
  });
  return null;
}

function mainRegion(): ParentNode {
  return document.querySelector("main") ?? document;
}

/** j / k / o over the rows and cards of the current item view. */
function ListShortcuts() {
  useShortcutHandler("list.next", () => {
    moveShortcutFocus(mainRegion(), 1);
  });
  useShortcutHandler("list.previous", () => {
    moveShortcutFocus(mainRegion(), -1);
  });
  useShortcutHandler("list.open", () => {
    openCurrentShortcutItem();
  });
  return null;
}

/** App-wide shortcuts: « / » search, « [ » sidebar, « g » destinations and lists. */
export function GlobalShortcuts() {
  const pathname = usePathname();
  const { toggle } = useSidebarState();
  const backlogKey = backlogKeyFromPath(pathname);

  useEffect(() => {
    if (!backlogKey) return;
    try {
      window.localStorage.setItem(LAST_BACKLOG_STORAGE_KEY, backlogKey);
    } catch {
      // Storage unavailable: « g » then only works inside a backlog.
    }
  }, [backlogKey]);

  useShortcutHandler("search", () => {
    window.dispatchEvent(new Event(OPEN_SEARCH_EVENT));
  });
  useShortcutHandler("toggleSidebar", toggle);

  return (
    <>
      {GO_SHORTCUT_IDS.map((id) => (
        <GoShortcut key={id} id={id} backlogKey={backlogKey} />
      ))}
      <ListShortcuts />
    </>
  );
}
