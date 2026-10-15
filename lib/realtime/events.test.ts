import { describe, expect, it } from "vitest";
import {
  MAX_EVENT_ITEM_IDS,
  buildChangeEvent,
  matchesSubscription,
  parseChangeEvent,
  reactionFor,
  serializeChangeEvent,
  toWireEvent,
} from "@/lib/realtime/events";

const BACKLOG = "6f1c1f9e-8d0a-4c55-9f3e-2b7d1c0a9e11";
const OTHER_BACKLOG = "0b6e3e5c-1d4f-4f8e-8a7d-5c9b2a1e3f22";
const ITEM = "a3d2c1b0-9e8f-4a7b-8c6d-5e4f3a2b1c00";
const AT = new Date("2026-10-15T12:00:00.000Z");

function itemId(index: number): string {
  return `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
}

describe("buildChangeEvent", () => {
  it("builds a versioned backlog event", () => {
    expect(
      buildChangeEvent({ kind: "item", backlogId: BACKLOG, itemIds: [ITEM], actorId: "u1" }, AT),
    ).toEqual({
      v: 1,
      kind: "item",
      backlogId: BACKLOG,
      itemIds: [ITEM],
      actorId: "u1",
      at: "2026-10-15T12:00:00.000Z",
    });
  });

  it("dedupes item ids", () => {
    const event = buildChangeEvent(
      { kind: "item", backlogId: BACKLOG, itemIds: [ITEM, ITEM], actorId: "u1" },
      AT,
    );
    expect(event.itemIds).toEqual([ITEM]);
  });

  it("drops item ids beyond the cap so the event means 'any item'", () => {
    const itemIds = Array.from({ length: MAX_EVENT_ITEM_IDS + 1 }, (_, index) => itemId(index));
    const event = buildChangeEvent({ kind: "item", backlogId: BACKLOG, itemIds, actorId: "u1" }, AT);
    expect(event.itemIds).toBeUndefined();
  });

  it("keeps a null actor for system changes such as webhooks", () => {
    const event = buildChangeEvent({ kind: "item", backlogId: BACKLOG, actorId: null }, AT);
    expect(event.actorId).toBeNull();
  });
});

describe("parseChangeEvent", () => {
  it("round-trips a serialized event", () => {
    const event = buildChangeEvent({ kind: "notification", userId: "u2", actorId: "u1" }, AT);
    expect(parseChangeEvent(serializeChangeEvent(event))).toEqual(event);
  });

  const at = AT.toISOString();
  it.each([
    ["malformed json", "{"],
    ["an unknown version", JSON.stringify({ v: 2, kind: "item", backlogId: BACKLOG, actorId: null, at })],
    ["an unknown kind", JSON.stringify({ v: 1, kind: "comment", backlogId: BACKLOG, actorId: null, at })],
    ["a backlog event without backlog", JSON.stringify({ v: 1, kind: "item", actorId: null, at })],
    ["a notification without user", JSON.stringify({ v: 1, kind: "notification", actorId: null, at })],
    ["extra content", JSON.stringify({ v: 1, kind: "item", backlogId: BACKLOG, actorId: null, at, title: "x" })],
  ])("rejects %s", (_label, payload) => {
    expect(parseChangeEvent(payload)).toBeNull();
  });
});

describe("serializeChangeEvent", () => {
  it("stays under the NOTIFY payload limit at the item cap", () => {
    const itemIds = Array.from({ length: MAX_EVENT_ITEM_IDS }, (_, index) => itemId(index));
    const payload = serializeChangeEvent(
      buildChangeEvent(
        { kind: "item", backlogId: BACKLOG, itemIds, actorId: "x".repeat(64) },
        AT,
      ),
    );
    expect(Buffer.byteLength(payload)).toBeLessThan(8000);
  });
});

describe("matchesSubscription", () => {
  const subscription = { backlogId: BACKLOG, userId: "me" };

  it("matches changes in the subscribed backlog", () => {
    const event = buildChangeEvent({ kind: "sprint", backlogId: BACKLOG, actorId: "u1" }, AT);
    expect(matchesSubscription(event, subscription)).toBe(true);
  });

  it("ignores changes in other backlogs", () => {
    const event = buildChangeEvent({ kind: "item", backlogId: OTHER_BACKLOG, actorId: "u1" }, AT);
    expect(matchesSubscription(event, subscription)).toBe(false);
  });

  it("ignores backlog changes without a subscribed backlog", () => {
    const event = buildChangeEvent({ kind: "item", backlogId: BACKLOG, actorId: "u1" }, AT);
    expect(matchesSubscription(event, { backlogId: null, userId: "me" })).toBe(false);
  });

  it("matches only my notifications", () => {
    const mine = buildChangeEvent({ kind: "notification", userId: "me", actorId: "u1" }, AT);
    const theirs = buildChangeEvent({ kind: "notification", userId: "u3", actorId: "u1" }, AT);
    expect(matchesSubscription(mine, { backlogId: null, userId: "me" })).toBe(true);
    expect(matchesSubscription(theirs, subscription)).toBe(false);
  });
});

describe("toWireEvent", () => {
  it("exposes only the kind, the item ids and whether I am the author", () => {
    const event = buildChangeEvent(
      { kind: "item", backlogId: BACKLOG, itemIds: [ITEM], actorId: "me" },
      AT,
    );
    expect(toWireEvent(event, "me")).toEqual({ kind: "item", itemIds: [ITEM], self: true });
    expect(toWireEvent(event, "other")).toEqual({ kind: "item", itemIds: [ITEM], self: false });
  });

  it("treats system changes as someone else's", () => {
    const event = buildChangeEvent({ kind: "item", backlogId: BACKLOG, actorId: null }, AT);
    expect(toWireEvent(event, "me").self).toBe(false);
  });
});

describe("reactionFor", () => {
  it("refreshes the open item and shows the banner for someone else's change", () => {
    expect(
      reactionFor({ kind: "item", itemIds: [ITEM], self: false }, { openItemId: ITEM }),
    ).toEqual({ refreshOpenItem: true, showBanner: true, refreshBell: false });
  });

  it("refreshes the open item but hides the banner for my own change", () => {
    expect(
      reactionFor({ kind: "item", itemIds: [ITEM], self: true }, { openItemId: ITEM }),
    ).toEqual({ refreshOpenItem: true, showBanner: false, refreshBell: false });
  });

  it("leaves the open item alone when another item changed", () => {
    const reaction = reactionFor(
      { kind: "item", itemIds: [itemId(1)], self: false },
      { openItemId: ITEM },
    );
    expect(reaction.refreshOpenItem).toBe(false);
  });

  it("refreshes the open item when the change may touch any item", () => {
    expect(reactionFor({ kind: "sprint", self: false }, { openItemId: ITEM }).refreshOpenItem).toBe(
      true,
    );
    expect(
      reactionFor({ kind: "release", self: false }, { openItemId: ITEM }).refreshOpenItem,
    ).toBe(true);
  });

  it("does not refresh without an open item", () => {
    expect(reactionFor({ kind: "item", self: false }, { openItemId: null }).refreshOpenItem).toBe(
      false,
    );
  });

  it("refreshes only the bell for a notification", () => {
    expect(reactionFor({ kind: "notification", self: false }, { openItemId: ITEM })).toEqual({
      refreshOpenItem: false,
      showBanner: false,
      refreshBell: true,
    });
  });

  it("catches up quietly once the stream is ready", () => {
    expect(reactionFor({ kind: "ready", self: false }, { openItemId: ITEM })).toEqual({
      refreshOpenItem: true,
      showBanner: false,
      refreshBell: true,
    });
  });

  it("acts as if everything changed after a resync", () => {
    expect(reactionFor({ kind: "resync", self: false }, { openItemId: ITEM })).toEqual({
      refreshOpenItem: true,
      showBanner: true,
      refreshBell: true,
    });
  });
});
