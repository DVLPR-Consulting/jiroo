import { describe, expect, it } from "vitest";
import { buildActivityFeed } from "@/lib/items/activity-feed";

const comments = [
  { id: "c1", createdAt: new Date("2026-10-01T10:00:00Z") },
  { id: "c2", createdAt: "2026-10-03T10:00:00.000Z" },
];
const activities = [
  { id: "a1", action: "create", at: new Date("2026-09-30T10:00:00Z") },
  { id: "a2", action: "comment", at: new Date("2026-10-01T10:00:00Z") },
  { id: "a3", action: "status_change", at: new Date("2026-10-02T10:00:00Z") },
];

const ids = (entries: { id: string }[]) => entries.map((entry) => entry.id);

describe("buildActivityFeed", () => {
  it("merges comments and history, newest first by default", () => {
    const feed = buildActivityFeed({ comments, activities });
    expect(ids(feed)).toEqual(["c2", "a3", "c1", "a1"]);
    expect(feed.map((entry) => entry.kind)).toEqual([
      "comment",
      "history",
      "comment",
      "history",
    ]);
  });

  it("sorts oldest first on request", () => {
    expect(ids(buildActivityFeed({ comments, activities }, { sort: "oldest" }))).toEqual([
      "a1",
      "c1",
      "a3",
      "c2",
    ]);
  });

  it("filters comments only or history only", () => {
    expect(ids(buildActivityFeed({ comments, activities }, { filter: "comments" }))).toEqual([
      "c2",
      "c1",
    ]);
    expect(ids(buildActivityFeed({ comments, activities }, { filter: "history" }))).toEqual([
      "a3",
      "a1",
    ]);
  });

  it("leaves out the « commented » history rows the comments already show", () => {
    expect(ids(buildActivityFeed({ comments: [], activities }))).not.toContain("a2");
  });

  it("keeps a stable order for entries at the same instant", () => {
    const at = new Date("2026-10-05T10:00:00Z");
    const feed = buildActivityFeed({
      comments: [{ id: "c9", createdAt: at }],
      activities: [{ id: "a9", action: "update", at }],
    });
    expect(ids(feed)).toEqual(["c9", "a9"]);
    expect(
      ids(
        buildActivityFeed(
          {
            comments: [{ id: "c9", createdAt: at }],
            activities: [{ id: "a9", action: "update", at }],
          },
          { sort: "oldest" },
        ),
      ),
    ).toEqual(["a9", "c9"]);
  });
});
