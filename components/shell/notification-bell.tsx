"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { markReadAction, markAllReadAction } from "@/app/actions/notifications";
import type { NotificationRow } from "@/lib/services/notifications";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Compact relative-time label in French. */
function relativeTime(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "À l'instant";
  if (diffMin < 60) return `Il y a ${diffMin} min`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `Il y a ${diffH} h`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7) return `Il y a ${diffD} j`;
  return date.toLocaleDateString("fr-FR");
}

/** Cap the badge count at 9+. */
function badgeLabel(count: number): string {
  return count > 9 ? "9+" : String(count);
}

// ---------------------------------------------------------------------------
// NotificationBell
// ---------------------------------------------------------------------------

export function NotificationBell({
  notifications,
  unreadCount,
}: {
  notifications: NotificationRow[];
  unreadCount: number;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------

  function handleMarkAllRead() {
    startTransition(async () => {
      await markAllReadAction();
      router.refresh();
    });
  }

  function handleSelect(notification: NotificationRow) {
    startTransition(async () => {
      const res = await markReadAction({ id: notification.id });
      if (!res.ok) console.error(res.error);
      if (notification.backlogKey && notification.itemKey) {
        router.push(`/b/${notification.backlogKey}?item=${notification.itemKey}`);
      } else {
        router.refresh();
      }
    });
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {/* `relative` lives on the Button itself so the badge anchors to it.
            The Button is the single asChild target — Radix's Slot clones it
            directly, avoiding an invalid <button>-inside-div nesting. */}
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={
            unreadCount > 0
              ? `Notifications (${unreadCount} non lues)`
              : "Notifications"
          }
        >
          <Bell className="size-4" />
          {unreadCount > 0 && (
            <span
              aria-hidden
              className="pointer-events-none absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-none text-destructive-foreground"
            >
              {badgeLabel(unreadCount)}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-[360px] p-0">
        {/* Header */}
        <DropdownMenuLabel className="px-3 py-2 text-sm font-semibold text-foreground">
          Notifications
        </DropdownMenuLabel>

        {/* Mark-all action — a DropdownMenuItem so it joins the menu's
            roving-tabindex (reachable by arrow keys / screen readers).
            preventDefault keeps the menu open and avoids the close-race. */}
        {unreadCount > 0 && (
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              handleMarkAllRead();
            }}
            disabled={isPending}
            className="justify-center rounded-none px-3 py-1.5 text-xs text-muted-foreground"
          >
            Tout marquer comme lu
          </DropdownMenuItem>
        )}

        <DropdownMenuSeparator className="m-0" />

        {/* Body */}
        {notifications.length === 0 ? (
          <p className="px-3 py-4 text-center text-sm text-muted-foreground">
            Aucune notification.
          </p>
        ) : (
          <div className="max-h-[400px] overflow-y-auto py-1">
            {notifications.map((n) => (
              <DropdownMenuItem
                key={n.id}
                onSelect={() => handleSelect(n)}
                disabled={isPending}
                className={
                  !n.read
                    ? "relative cursor-pointer items-start rounded-none px-3 py-2.5 bg-[var(--accent-subtle)] focus:bg-accent"
                    : "relative cursor-pointer items-start rounded-none px-3 py-2.5 focus:bg-accent"
                }
              >
                {/* Unread dot */}
                {!n.read && (
                  <span
                    aria-hidden
                    className="mr-2 mt-[5px] size-1.5 shrink-0 rounded-full bg-blue-500"
                  />
                )}

                <div className={!n.read ? "" : "ml-3.5"}>
                  {/* Primary label */}
                  <p className="text-sm leading-snug">
                    <span className="font-medium">
                      {n.actorName ?? "Quelqu'un"}
                    </span>{" "}
                    vous a mentionné dans{" "}
                    <span className="font-medium">{n.itemKey ?? "un item"}</span>
                    {n.itemTitle ? ` — ${n.itemTitle}` : ""}
                  </p>

                  {/* Snippet */}
                  {n.snippet && (
                    <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                      {n.snippet}
                    </p>
                  )}

                  {/* Time */}
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {relativeTime(n.createdAt)}
                  </p>
                </div>
              </DropdownMenuItem>
            ))}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
