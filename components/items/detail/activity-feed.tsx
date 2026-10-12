"use client";

import { useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { ArrowDown, ArrowRight, ArrowUp } from "lucide-react";
import { InitialsAvatar } from "@/components/jiroo/avatar";
import { CommentComposer } from "@/components/items/detail/comment-composer";
import { CommentItem } from "@/components/items/detail/comment-thread";
import { useShortcutsEnabled } from "@/components/shortcuts/use-shortcuts-enabled";
import {
  ACTIVITY_FILTERS,
  ACTIVITY_FILTER_LABELS,
  ACTIVITY_SORT_LABELS,
  buildActivityFeed,
  type ActivityFilter,
  type ActivitySort,
} from "@/lib/items/activity-feed";
import { describeHistory, type HistoryLookup } from "@/lib/items/activity-history";
import type { CommentRow } from "@/lib/services/comments";
import type { activities as activitiesTable } from "@/lib/db/schema/domain";
import { cn } from "@/lib/utils";

type ActivityRow = typeof activitiesTable.$inferSelect;
type Named = { id: string; name: string };

const dateFormat = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" });

function Avatar({ name }: { name: string }) {
  return (
    <span aria-hidden className="flex-none pt-0.5">
      <InitialsAvatar name={name} hue={3} size={32} />
    </span>
  );
}

function HistoryEntry({
  activity,
  actorName,
  lookup,
}: {
  activity: ActivityRow;
  actorName: string;
  lookup: HistoryLookup;
}) {
  const description = describeHistory(activity, lookup);
  const at = new Date(activity.at);
  return (
    <div className="flex min-w-0 flex-col gap-1 pt-1.5">
      <p className="text-[13.5px]">
        <span className="font-semibold">{actorName}</span> {description.text}{" "}
        <time dateTime={at.toISOString()} className="text-muted-foreground">
          · {dateFormat.format(at)}
        </time>
      </p>
      {description.from !== undefined && description.to !== undefined && (
        <p className="flex min-w-0 flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
          <span className="min-w-0 break-words">
            {description.from}
          </span>
          <ArrowRight aria-label="devient" className="size-3.5 flex-none" />
          <span className="min-w-0 break-words text-foreground">{description.to}</span>
        </p>
      )}
      {description.added && description.removed && (
        <p className="flex flex-wrap gap-x-3 text-[13px] text-muted-foreground">
          {description.added.length > 0 && (
            <span>Ajouté : <span className="text-foreground">{description.added.join(", ")}</span></span>
          )}
          {description.removed.length > 0 && (
            <span>Retiré : <span className="text-foreground">{description.removed.join(", ")}</span></span>
          )}
        </p>
      )}
    </div>
  );
}

/**
 * The drawer's unified « Activité » (Jira): comment composer on top, then
 * comments and history in one feed, filtered « Tout / Commentaires /
 * Historique » and sorted « Plus récents / Plus anciens ». The filter is
 * controlled so « m » can bring the comments back into view.
 */
export function ActivityFeed({
  itemId,
  backlogKey,
  comments,
  activities,
  users,
  currentUserId,
  capabilities,
  lookup,
  filter,
  onFilterChange,
}: {
  itemId: string;
  backlogKey: string;
  comments: CommentRow[];
  activities: ActivityRow[];
  users: Named[];
  currentUserId: string;
  capabilities: { add: boolean; editOwn: boolean; deleteOwn: boolean; deleteAll: boolean };
  lookup: HistoryLookup;
  filter: ActivityFilter;
  onFilterChange: (filter: ActivityFilter) => void;
}) {
  const [sort, setSort] = useState<ActivitySort>("newest");
  const [editingId, setEditingId] = useState<string | null>(null);
  const shortcutsEnabled = useShortcutsEnabled();
  const headingId = useId();
  const panelId = useId();
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const entries = useMemo(
    () => buildActivityFeed({ comments, activities }, { filter, sort }),
    [activities, comments, filter, sort],
  );
  const userName = (id: string) => users.find((user) => user.id === id)?.name ?? "Utilisateur inconnu";
  const currentUserName = users.find((user) => user.id === currentUserId)?.name ?? "Vous";

  // Tabs pattern: arrows move between the filters, as in a tablist.
  function onTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const last = ACTIVITY_FILTERS.length - 1;
    const target =
      event.key === "ArrowRight" ? (index === last ? 0 : index + 1)
        : event.key === "ArrowLeft" ? (index === 0 ? last : index - 1)
          : event.key === "Home" ? 0
            : event.key === "End" ? last
              : null;
    if (target === null) return;
    event.preventDefault();
    onFilterChange(ACTIVITY_FILTERS[target]!);
    tabRefs.current[target]?.focus();
  }

  const emptyText =
    filter === "comments" ? "Aucun commentaire." : filter === "history" ? "Aucun historique." : "Aucune activité.";

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id={headingId} className="text-sm font-semibold">
          Activité
        </h2>
        <div className="flex flex-wrap items-center gap-2.5">
          <div
            role="tablist"
            aria-label="Filtrer l’activité"
            className="flex rounded-[7px] bg-[var(--muted)] p-[3px]"
          >
            {ACTIVITY_FILTERS.map((option, index) => (
              <button
                key={option}
                ref={(element) => {
                  tabRefs.current[index] = element;
                }}
                type="button"
                role="tab"
                aria-selected={filter === option}
                aria-controls={panelId}
                tabIndex={filter === option ? 0 : -1}
                onClick={() => onFilterChange(option)}
                onKeyDown={(event) => onTabKeyDown(event, index)}
                className={cn(
                  "h-7 rounded-[5px] px-3 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
                  filter === option
                    ? "bg-[var(--surface)] font-semibold text-foreground shadow-[var(--shadow-xs)]"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {ACTIVITY_FILTER_LABELS[option]}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setSort(sort === "newest" ? "oldest" : "newest")}
            aria-label={`Trier : ${ACTIVITY_SORT_LABELS[sort]}`}
            className="flex h-[30px] items-center gap-1 rounded-[var(--radius)] px-2 text-[13px] text-muted-foreground hover:bg-[var(--muted)] hover:text-foreground"
          >
            {ACTIVITY_SORT_LABELS[sort]}
            {sort === "newest" ? (
              <ArrowDown aria-hidden className="size-3.5" />
            ) : (
              <ArrowUp aria-hidden className="size-3.5" />
            )}
          </button>
        </div>
      </div>

      <div id={panelId} role="tabpanel" aria-labelledby={headingId} className="flex flex-col gap-4">
        {capabilities.add && filter !== "history" && (
          <div className="flex gap-3">
            <Avatar name={currentUserName} />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <CommentComposer itemId={itemId} backlogKey={backlogKey} users={users} mode="create" />
              {shortcutsEnabled && (
                <p className="text-right text-xs text-muted-foreground">
                  Astuce : touche{" "}
                  <kbd className="rounded-[var(--radius-sm)] border border-b-2 border-[var(--border-strong)] bg-[var(--surface)] px-1.5 font-mono text-foreground">
                    M
                  </kbd>{" "}
                  pour commenter
                </p>
              )}
            </div>
          </div>
        )}

        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">{emptyText}</p>
        ) : (
          <ol className="flex flex-col gap-[18px]">
            {entries.map((entry) => {
              if (entry.kind === "comment") {
                const comment = entry.comment;
                const isOwn = comment.authorId === currentUserId;
                return (
                  <li key={`comment-${entry.id}`} className="flex gap-3">
                    <Avatar name={comment.authorName} />
                    <div className="min-w-0 flex-1 pt-1">
                      <CommentItem
                        comment={comment}
                        itemId={itemId}
                        backlogKey={backlogKey}
                        users={users}
                        isEditing={editingId === comment.id}
                        canEdit={isOwn && capabilities.editOwn}
                        canDelete={isOwn ? capabilities.deleteOwn : capabilities.deleteAll}
                        onEditStart={() => setEditingId(comment.id)}
                        onEditDone={() => setEditingId(null)}
                      />
                    </div>
                  </li>
                );
              }
              const actorName = userName(entry.activity.actorId);
              return (
                <li key={`history-${entry.id}`} className="flex gap-3">
                  <Avatar name={actorName} />
                  <HistoryEntry activity={entry.activity} actorName={actorName} lookup={lookup} />
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </section>
  );
}
