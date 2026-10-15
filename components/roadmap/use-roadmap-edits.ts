"use client";

import { useEffect, useRef, useState } from "react";
import { updateItemAction } from "@/app/actions/items";
import type { Day } from "@/lib/roadmap/days";
import { toDatePatch, type Interval } from "@/lib/roadmap/intervals";
import type { RoadmapSource } from "@/lib/roadmap/rows";
import { toast } from "@/lib/toast";

/** Days shown before the server confirms them. */
type Override = { start: Day; due: Day; seq: number; settled: boolean };

/**
 * Optimistic date edits: a moved bar stays where it was dropped while it
 * saves, goes back if the save fails, and gives way to the server's days once
 * the page re-renders after a successful save.
 */
export function useRoadmapEdits(
  backlogKey: string,
  items: readonly RoadmapSource[],
  announce: (message: string) => void,
) {
  const [overrides, setOverrides] = useState<ReadonlyMap<string, Override>>(() => new Map());
  const [seenItems, setSeenItems] = useState(items);
  const seq = useRef(0);
  /** Saves waiting for the arrow keys to settle, by item. */
  const pending = useRef(new Map<string, { timer: ReturnType<typeof setTimeout>; run: () => void }>());

  // Leaving the page sends the edits still waiting rather than losing them.
  useEffect(() => {
    const waiting = pending.current;
    return () => {
      for (const { timer, run } of waiting.values()) {
        clearTimeout(timer);
        run();
      }
      waiting.clear();
    };
  }, []);

  // A server render after a save carries its days: drop the settled overrides.
  if (seenItems !== items) {
    setSeenItems(items);
    if ([...overrides.values()].some((override) => override.settled)) {
      setOverrides(new Map([...overrides].filter(([, override]) => !override.settled)));
    }
  }

  function settle(id: string, mine: number, ok: boolean) {
    setOverrides((current) => {
      const override = current.get(id);
      // A later edit of the same item owns the override now.
      if (!override || override.seq !== mine) return current;
      const next = new Map(current);
      if (ok) next.set(id, { ...override, settled: true });
      else next.delete(id);
      return next;
    });
  }

  const effectiveItems = overrides.size === 0
    ? items
    : items.map((item) => {
        const override = overrides.get(item.id);
        return override ? { ...item, start: override.start, due: override.due } : item;
      });

  /**
   * Shows `interval` at once, then saves it as the item's start and due days,
   * after `delayMs` without a newer edit of the item (arrow keys repeat).
   */
  function save(
    item: { id: string; key: string },
    interval: Interval,
    describe: string,
    delayMs = 0,
  ) {
    const mine = ++seq.current;
    setOverrides((current) =>
      new Map(current).set(item.id, { start: interval.start, due: interval.end, seq: mine, settled: false }),
    );
    clearTimeout(pending.current.get(item.id)?.timer);
    pending.current.delete(item.id);
    const run = () => void send(item, interval, describe, mine);
    if (delayMs === 0) {
      run();
      return;
    }
    const timer = setTimeout(() => {
      pending.current.delete(item.id);
      run();
    }, delayMs);
    pending.current.set(item.id, { timer, run });
  }

  async function send(item: { id: string; key: string }, interval: Interval, describe: string, mine: number) {
    try {
      const result = await updateItemAction({ id: item.id, backlogKey, ...toDatePatch(interval) });
      if (result.ok) {
        settle(item.id, mine, true);
        announce(`${item.key} planifié ${describe}.`);
        return;
      }
      settle(item.id, mine, false);
      const message = "error" in result && typeof result.error === "string"
        ? result.error
        : "Mise à jour impossible.";
      toast.error(message);
      announce(`${item.key} : ${message}`);
    } catch {
      settle(item.id, mine, false);
      toast.error("Mise à jour impossible.");
      announce(`${item.key} : mise à jour impossible.`);
    }
  }

  return { effectiveItems, save };
}
