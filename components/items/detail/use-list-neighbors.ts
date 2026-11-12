"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import {
  loadViewNeighborsAction,
  type LoadViewNeighborsInput,
} from "@/app/actions/view-neighbors";
import { adjacentItemKey, shortcutItemKeys } from "@/lib/shortcuts/list-navigation";

/**
 * A view served by windows (JIR-145 to JIR-147), whose rows shown are not all
 * of it: the server tells the neighbors of an item outside them (JIR-153).
 */
export type ViewNeighborsSource = {
  backlogKey: string;
  view: LoadViewNeighborsInput["view"];
  viewState: string;
};

type Neighbors = { inList: boolean; previous: string | null; next: string | null };

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
    attributeFilter: ["data-shortcut-item", "data-tree-folded", "hidden", "inert"],
  });
  return () => observer.disconnect();
}

/** A string snapshot keeps useSyncExternalStore stable between renders. */
function snapshot(): string {
  const root = listRoot();
  return root ? shortcutItemKeys(root).join("\n") : "";
}

/** The Arbre's branches the user folded (`data-tree-folded`), by key, sorted. */
function foldedSnapshot(): string {
  const root = listRoot();
  if (!root) return "";
  return Array.from(root.querySelectorAll("[data-tree-folded]"))
    .flatMap((element) => {
      const key = element.getAttribute("data-tree-folded");
      return key ? [key] : [];
    })
    .sort()
    .join("\n");
}

/**
 * The previous and next items around `itemKey` in the order of the view
 * shown behind the drawer (Jira's « previous / next issue »). `inList` is
 * false without a list context (search result, item not displayed).
 *
 * In a view served by windows (`source`), the server tells the neighbors
 * over the whole view, rows not loaded yet included (JIR-153). The Liste and
 * the Backlog section are loaded from their start, so the rows shown are
 * right but at their end: the server is asked for an item outside them or
 * the last of them. The Arbre leaves gaps anywhere (children not loaded yet,
 * a filter's later matches): the server always answers there, skipping the
 * branches the user folded as the rows shown do. `version` asks again when
 * the item changed, as its place may have.
 */
export function useListNeighbors(
  itemKey: string,
  source?: ViewNeighborsSource,
  version?: string,
): Neighbors {
  const keys = useSyncExternalStore(subscribe, snapshot, () => "");
  const foldedKeys = useSyncExternalStore(subscribe, foldedSnapshot, () => "");
  const list = keys === "" ? [] : keys.split("\n");
  const shown: Neighbors = {
    inList: list.includes(itemKey),
    previous: adjacentItemKey(list, itemKey, -1),
    next: adjacentItemKey(list, itemKey, 1),
  };
  const tree = source?.view === "tree";
  const folded = tree && foldedKeys !== "" ? foldedKeys.split("\n").slice(0, 500) : [];
  const ask = source !== undefined && (tree || !shown.inList || shown.next === null);
  const request = ask
    ? JSON.stringify([source.backlogKey, source.view, source.viewState, itemKey, version ?? "", folded])
    : null;
  const [served, setServed] = useState<{ request: string; neighbors: Neighbors } | null>(null);

  useEffect(() => {
    if (request === null || !source) return;
    let current = true;
    void loadViewNeighborsAction({
      backlogKey: source.backlogKey,
      view: source.view,
      viewState: source.viewState,
      itemKey,
      ...(folded.length > 0 ? { folded } : {}),
    })
      .then((result) => {
        if (!current || !result.ok) return;
        const { inView, previous, next } = result.neighbors;
        setServed({ request, neighbors: { inList: inView, previous, next } });
      })
      .catch(() => {});
    return () => {
      current = false;
    };
    // `request` holds every input the lookup reads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request]);

  if (request === null) return shown;
  const answered = served !== null && served.request === request;
  if (!answered) {
    // Until the answer comes, the buttons stay in place, disabled, in the
    // Arbre (whose rows shown may skip the neighbor) or when the rows shown
    // do not hold the item; elsewhere the rows shown are right meanwhile.
    const inList = shown.inList || (served?.neighbors.inList ?? false);
    return tree || !shown.inList ? { inList, previous: null, next: null } : shown;
  }
  const server = served.neighbors;
  if (tree) return { ...server, inList: server.inList || shown.inList };
  return {
    inList: shown.inList || server.inList,
    previous: shown.previous ?? server.previous,
    next: shown.next ?? server.next,
  };
}
