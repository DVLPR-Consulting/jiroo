import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseDatedJson } from "@/lib/serialization/dated-json";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  loadItemDetailData: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/services/item-detail", () => ({
  loadItemDetailData: mocks.loadItemDetailData,
}));

import { GET } from "./route";

function get(key: string, itemKey: string) {
  return GET(new Request(`http://localhost/api/backlogs/${key}/items/${itemKey}`), {
    params: Promise.resolve({ key, itemKey }),
  });
}

describe("GET /api/backlogs/[key]/items/[itemKey]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ user: { id: "viewer-1" } });
  });

  it("rejects a request without an enrolled session before loading anything", async () => {
    mocks.getSession.mockResolvedValue(null);

    const response = await get("CASS", "CASS-1");

    expect(response.status).toBe(401);
    expect(mocks.loadItemDetailData).not.toHaveBeenCalled();
  });

  it("answers the loaded detail as non-cacheable JSON that keeps dates", async () => {
    const createdAt = new Date("2026-10-01T08:00:00.000Z");
    mocks.loadItemDetailData.mockResolvedValue({
      kind: "item",
      panel: { detail: { id: "item-1", key: "CASS-1", createdAt } },
    });

    const response = await get("cass", "CASS-1");

    expect(mocks.loadItemDetailData).toHaveBeenCalledWith({
      userId: "viewer-1",
      backlogKey: "cass",
      itemKey: "CASS-1",
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("Content-Type")).toMatch(/^application\/json/);
    const body = parseDatedJson<{ panel: { detail: { createdAt: Date } } }>(await response.text());
    expect(body.panel.detail.createdAt).toEqual(createdAt);
  });

  it("answers 404 alike for an inaccessible backlog and an unknown item", async () => {
    mocks.loadItemDetailData.mockResolvedValueOnce(null);
    const inaccessible = await get("LABS", "LABS-1");
    mocks.loadItemDetailData.mockResolvedValueOnce({ kind: "not-found", itemKey: "CASS-9" });
    const unknown = await get("CASS", "CASS-9");

    for (const response of [inaccessible, unknown]) {
      expect(response.status).toBe(404);
      expect(response.headers.get("Cache-Control")).toBe("private, no-store");
      expect(await response.text()).toBe("");
    }
  });

  it.each([
    ["CASS", "not-a-key"],
    ["CASS1", "CASS-1"],
    ["CASS", "CASS-1; DROP"],
  ])("answers 404 for malformed keys %s / %s without querying", async (key, itemKey) => {
    const response = await get(key, itemKey);

    expect(response.status).toBe(404);
    expect(mocks.loadItemDetailData).not.toHaveBeenCalled();
  });
});
