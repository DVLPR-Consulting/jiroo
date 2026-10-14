import { describe, expect, it } from "vitest";
import {
  groupDevRefs,
  pullRequestNumber,
  refRepository,
  shortCommitSha,
  type DevRef,
} from "@/lib/items/dev-refs";

const ref = (overrides: Partial<DevRef>): DevRef => ({
  id: overrides.id ?? "ref",
  url: "https://github.com/acme/api/pull/1",
  kind: "pr",
  createdAt: "2026-10-01T00:00:00.000Z",
  ...overrides,
});

describe("groupDevRefs", () => {
  it("groups webhook references by kind, most recent first, and keeps manual links apart", () => {
    const grouped = groupDevRefs([
      ref({ id: "manual", provider: null }),
      ref({ id: "c-old", kind: "commit", provider: "github", occurredAt: "2026-10-10T00:00:00.000Z" }),
      ref({ id: "c-new", kind: "commit", provider: "github", occurredAt: "2026-10-12T00:00:00.000Z" }),
      ref({ id: "b", kind: "branch", provider: "gitlab", occurredAt: "2026-10-11T00:00:00.000Z" }),
      ref({ id: "pr", kind: "pr", provider: "github", occurredAt: "2026-10-09T00:00:00.000Z" }),
    ]);
    expect(grouped.pullRequests.map((r) => r.id)).toEqual(["pr"]);
    expect(grouped.branches.map((r) => r.id)).toEqual(["b"]);
    expect(grouped.commits.map((r) => r.id)).toEqual(["c-new", "c-old"]);
    expect(grouped.manual.map((r) => r.id)).toEqual(["manual"]);
  });
});

describe("reference labels", () => {
  it("reads numbers, SHAs and repositories from the links", () => {
    expect(pullRequestNumber({ url: "https://github.com/acme/api/pull/42", provider: "github" })).toBe("#42");
    expect(pullRequestNumber({ url: "https://gitlab.com/g/s/p/-/merge_requests/7", provider: "gitlab" })).toBe("!7");
    expect(shortCommitSha("https://github.com/acme/api/commit/1a2b3c4d5e6f")).toBe("1a2b3c4");
    expect(refRepository("https://gitlab.com/g/s/p/-/merge_requests/7")).toBe("g/s/p");
    expect(refRepository("https://github.com/acme/api/tree/feature/x")).toBe("acme/api");
    expect(refRepository("not a url")).toBeNull();
  });
});
