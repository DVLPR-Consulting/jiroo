"use client";

import { useSyncExternalStore } from "react";
import { adjacentItemKey, shortcutItemKeys } from "@/lib/shortcuts/list-navigation";

/** The view behind the drawer: the page's main region. */
function listRoot(): Element | null {
  return document.querySelector("main");
}

function subscribe(onChange: () => void): () => void {
  const root = listRoot();
  if (!root) return () => {};
  const observer = new MutationObserver(onChange);
  observer.observe(root, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["data-shortcut-item", "hidden", "inert"],
  });
  return () => observer.disconnect();
}

/** A string snapshot keeps useSyncExternalStore stable between renders. */
function snapshot(): string {
  const root = listRoot();
  return root ? shortcutItemKeys(root).join("\n") : "";
}

/**
 * The previous and next items around `itemKey` in the order of the view
 * shown behind the drawer (Jira's « previous / next issue »). `inList` is
 * false without a list context (search result, item not displayed).
 */
export function useListNeighbors(itemKey: string): {
  inList: boolean;
  previous: string | null;
  next: string | null;
} {
  const keys = useSyncExternalStore(subscribe, snapshot, () => "");
  const list = keys === "" ? [] : keys.split("\n");
  return {
    inList: list.includes(itemKey),
    previous: adjacentItemKey(list, itemKey, -1),
    next: adjacentItemKey(list, itemKey, 1),
  };
}
