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
 *
 * In a view served by windows (`source`), an item outside the rows shown, or
 * the last of them, asks the server for its neighbors over the whole view:
 * the rows not loaded yet still have their place in it (JIR-153). `version`
 * asks again when the item changed, as its place may have.
 */
export function useListNeighbors(
  itemKey: string,
  source?: ViewNeighborsSource,
  version?: string,
): Neighbors {
  const keys = useSyncExternalStore(subscribe, snapshot, () => "");
  const list = keys === "" ? [] : keys.split("\n");
  const shown: Neighbors = {
    inList: list.includes(itemKey),
    previous: adjacentItemKey(list, itemKey, -1),
    next: adjacentItemKey(list, itemKey, 1),
  };
  const ask = source !== undefined && (!shown.inList || shown.next === null);
  const request = ask
    ? JSON.stringify([source.backlogKey, source.view, source.viewState, itemKey, version ?? ""])
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

  if (request === null || served === null) return shown;
  // While another item's answer is on its way, the buttons stay in place, disabled.
  const server = served.request === request
    ? served.neighbors
    : { inList: served.neighbors.inList, previous: null, next: null };
  return {
    inList: shown.inList || server.inList,
    previous: shown.previous ?? server.previous,
    next: shown.next ?? server.next,
  };
}
