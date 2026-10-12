/**
 * The item drawer's unified « Activité » feed (Jira's Activity section):
 * comments and history in one list, filtered with « Tout / Commentaires /
 * Historique » and sorted « Plus récents / Plus anciens ».
 */

export const ACTIVITY_FILTERS = ["all", "comments", "history"] as const;
export type ActivityFilter = (typeof ACTIVITY_FILTERS)[number];

export const ACTIVITY_FILTER_LABELS: Record<ActivityFilter, string> = {
  all: "Tout",
  comments: "Commentaires",
  history: "Historique",
};

export type ActivitySort = "newest" | "oldest";

export const ACTIVITY_SORT_LABELS: Record<ActivitySort, string> = {
  newest: "Plus récents",
  oldest: "Plus anciens",
};

type CommentLike = { id: string; createdAt: Date | string };
type HistoryLike = { id: string; action: string; at: Date | string };

export type ActivityFeedEntry<C extends CommentLike, H extends HistoryLike> =
  | { kind: "comment"; id: string; at: Date; comment: C }
  | { kind: "history"; id: string; at: Date; activity: H };

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

export function buildActivityFeed<C extends CommentLike, H extends HistoryLike>(
  { comments, activities }: { comments: readonly C[]; activities: readonly H[] },
  { filter = "all", sort = "newest" }: { filter?: ActivityFilter; sort?: ActivitySort } = {},
): ActivityFeedEntry<C, H>[] {
  const entries: ActivityFeedEntry<C, H>[] = [];
  if (filter !== "history") {
    for (const comment of comments) {
      entries.push({ kind: "comment", id: comment.id, at: toDate(comment.createdAt), comment });
    }
  }
  if (filter !== "comments") {
    for (const activity of activities) {
      // « a commenté » duplicates the comment itself, which the feed shows.
      if (activity.action === "comment") continue;
      entries.push({ kind: "history", id: activity.id, at: toDate(activity.at), activity });
    }
  }
  // At the same instant a comment reads after the change it explains.
  const kindRank = (entry: ActivityFeedEntry<C, H>) => (entry.kind === "history" ? 0 : 1);
  entries.sort(
    (left, right) =>
      left.at.getTime() - right.at.getTime() || kindRank(left) - kindRank(right),
  );
  return sort === "newest" ? entries.reverse() : entries;
}
