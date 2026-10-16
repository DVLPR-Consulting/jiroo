import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildChangeEvent } from "@/lib/realtime/events";
import type { BusListener } from "@/lib/realtime/bus";

const BACKLOG_ID = "6f1c1f9e-8d0a-4c55-9f3e-2b7d1c0a9e11";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getBacklogByKeyForUser: vi.fn(),
  subscribe: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/services/backlogs", () => ({
  getBacklogByKeyForUser: mocks.getBacklogByKeyForUser,
}));
vi.mock("@/lib/realtime/bus", () => ({
  getRealtimeBus: () => ({ subscribe: mocks.subscribe }),
}));

import { GET } from "./route";

function get(query = "") {
  const abort = new AbortController();
  const response = GET(
    new Request(`http://localhost/api/realtime${query}`, { signal: abort.signal }),
  );
  return { response, abort };
}

describe("GET /api/realtime", () => {
  let listener: BusListener | null;
  const unsubscribe = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    listener = null;
    mocks.getSession.mockResolvedValue({ user: { id: "viewer-1" } });
    mocks.getBacklogByKeyForUser.mockResolvedValue({ id: BACKLOG_ID, key: "CASS" });
    mocks.subscribe.mockImplementation((_subscription: unknown, next: BusListener) => {
      listener = next;
      return unsubscribe;
    });
  });

  it("rejects a request without a session before subscribing", async () => {
    mocks.getSession.mockResolvedValue(null);
    const { response } = get("?backlog=CASS");
    expect((await response).status).toBe(401);
    expect(mocks.subscribe).not.toHaveBeenCalled();
  });

  // A refused page still has a bell: the tab falls back to its notifications,
  // and an unknown backlog answers exactly the same, revealing nothing.
  it("streams only my notifications for a backlog the viewer may not browse", async () => {
    mocks.getBacklogByKeyForUser.mockResolvedValue(null);
    const { response, abort } = get("?backlog=SECRET");
    expect((await response).status).toBe(200);
    expect(mocks.getBacklogByKeyForUser).toHaveBeenCalledWith("SECRET", "viewer-1");
    expect(mocks.subscribe).toHaveBeenCalledWith(
      { backlogId: null, userId: "viewer-1" },
      expect.any(Function),
    );
    abort.abort();
  });

  it("streams only my notifications for a malformed backlog key without querying", async () => {
    const { response, abort } = get("?backlog=not%20a%20key");
    expect((await response).status).toBe(200);
    expect(mocks.getBacklogByKeyForUser).not.toHaveBeenCalled();
    expect(mocks.subscribe).toHaveBeenCalledWith(
      { backlogId: null, userId: "viewer-1" },
      expect.any(Function),
    );
    abort.abort();
  });

  it("streams the backlog's changes and my notifications", async () => {
    const { response, abort } = get("?backlog=CASS");
    const res = await response;
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/event-stream; charset=utf-8");
    expect(res.headers.get("Cache-Control")).toBe("private, no-cache, no-transform");
    expect(res.headers.get("X-Accel-Buffering")).toBe("no");
    expect(mocks.subscribe).toHaveBeenCalledWith(
      { backlogId: BACKLOG_ID, userId: "viewer-1" },
      expect.any(Function),
    );

    if (!res.body) throw new Error("no body");
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    expect(decoder.decode((await reader.read()).value)).toBe("retry: 3000\n\n");
    listener?.(buildChangeEvent({ kind: "item", backlogId: BACKLOG_ID, actorId: "viewer-1" }));
    expect(decoder.decode((await reader.read()).value)).toBe(
      'data: {"kind":"item","self":true}\n\n',
    );

    abort.abort();
    expect((await reader.read()).done).toBe(true);
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it("streams only my notifications outside a backlog", async () => {
    const { response, abort } = get();
    expect((await response).status).toBe(200);
    expect(mocks.getBacklogByKeyForUser).not.toHaveBeenCalled();
    expect(mocks.subscribe).toHaveBeenCalledWith(
      { backlogId: null, userId: "viewer-1" },
      expect.any(Function),
    );
    abort.abort();
  });
});
