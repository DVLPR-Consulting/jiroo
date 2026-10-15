import { beforeEach, describe, expect, it, vi } from "vitest";
import { REALTIME_CHANNEL, parseChangeEvent } from "@/lib/realtime/events";

vi.mock("server-only", () => ({}));

const { query, revalidatePath } = vi.hoisted(() => ({
  query: vi.fn<(sql: string, params: [string, string[]]) => Promise<unknown>>(),
  revalidatePath: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/lib/db", () => ({ databasePool: { query } }));

const { invalidateBacklog, notifyUsers, publishBacklogChange } = await import("@/lib/realtime/publish");

const BACKLOG = "6f1c1f9e-8d0a-4c55-9f3e-2b7d1c0a9e11";
const ITEM = "a3d2c1b0-9e8f-4a7b-8c6d-5e4f3a2b1c00";

function publishedEvents() {
  return query.mock.calls.flatMap(([sql, params]) => {
    expect(sql).toContain("pg_notify");
    expect(params[0]).toBe(REALTIME_CHANNEL);
    return params[1].map((payload) => parseChangeEvent(payload));
  });
}

describe("invalidateBacklog", () => {
  beforeEach(() => {
    query.mockReset().mockResolvedValue({ rows: [] });
    revalidatePath.mockReset();
  });

  it("re-renders the backlog pages and publishes an item change", async () => {
    await invalidateBacklog("CASS", { backlogId: BACKLOG, itemIds: [ITEM], actorId: "u1" });

    expect(revalidatePath.mock.calls).toEqual([["/b/CASS"], ["/b/CASS/roadmap"], ["/b/CASS/reports"]]);
    expect(publishedEvents()).toEqual([
      expect.objectContaining({ kind: "item", backlogId: BACKLOG, itemIds: [ITEM], actorId: "u1" }),
    ]);
  });

  it("publishes the given kind", async () => {
    await invalidateBacklog("CASS", { kind: "sprint", backlogId: BACKLOG, actorId: null });
    expect(publishedEvents()).toEqual([
      expect.objectContaining({ kind: "sprint", backlogId: BACKLOG, actorId: null }),
    ]);
  });

  it("does not fail the action when the database refuses the notification", async () => {
    query.mockRejectedValue(new Error("connection lost"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      invalidateBacklog("CASS", { backlogId: BACKLOG, actorId: "u1" }),
    ).resolves.toBeUndefined();
    expect(revalidatePath).toHaveBeenCalledTimes(3);
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});

describe("publishBacklogChange", () => {
  beforeEach(() => {
    query.mockReset().mockResolvedValue({ rows: [] });
    revalidatePath.mockReset();
  });

  it("publishes without re-rendering any page", async () => {
    await publishBacklogChange({ backlogId: BACKLOG, itemIds: [ITEM], actorId: null });
    expect(revalidatePath).not.toHaveBeenCalled();
    expect(publishedEvents()).toEqual([
      expect.objectContaining({ kind: "item", backlogId: BACKLOG, itemIds: [ITEM], actorId: null }),
    ]);
  });
});

describe("notifyUsers", () => {
  beforeEach(() => {
    query.mockReset().mockResolvedValue({ rows: [] });
  });

  it("publishes one notification per recipient in a single query", async () => {
    await notifyUsers(["u2", "u3", "u2"], "u1");

    expect(query).toHaveBeenCalledOnce();
    expect(publishedEvents()).toEqual([
      expect.objectContaining({ kind: "notification", userId: "u2", actorId: "u1" }),
      expect.objectContaining({ kind: "notification", userId: "u3", actorId: "u1" }),
    ]);
  });

  it("skips the database without recipients", async () => {
    await notifyUsers([], "u1");
    expect(query).not.toHaveBeenCalled();
  });
});
