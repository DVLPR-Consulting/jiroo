"use client";

import { usePathname, useSearchParams } from "next/navigation";
import {
  Layers,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Trash2,
  User,
} from "lucide-react";
import { BacklogSelector } from "@/components/shell/backlog-selector";
import { NavLink } from "@/components/shell/nav-link";
import { useSidebarState } from "@/components/shell/sidebar-state";
import { SidebarViews } from "@/components/shell/sidebar-views";
import { useViewUrlState } from "@/components/shell/view-url-state";
import { UserCard } from "@/components/shell/user-card";
import type { SidebarViewRow } from "@/components/shell/sidebar-views";
import { deriveShellContext } from "@/lib/items/shell";
import { clearActiveBacklogViewParams } from "@/lib/items/views";
import type { ShellCounts } from "@/lib/services/shell";
import { cn } from "@/lib/utils";

type Backlog = { id: string; key: string; name: string; color: string };

export function Sidebar({
  backlogs,
  views,
  userId,
  user,
  counts,
}: {
  backlogs: Backlog[];
  views: SidebarViewRow[];
  userId: string;
  user: { name: string; email: string; role: string };
  counts: ShellCounts;
}) {
  const { collapsed, toggle } = useSidebarState();
  const viewUrl = useViewUrlState();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const backlogKeys = new Map(backlogs.map((backlog) => [backlog.id, backlog.key]));
  const context = deriveShellContext({
    pathname,
    search: new URLSearchParams(searchParams.toString()),
    backlogs,
    views: views.flatMap((view) => {
      const backlogKey = view.backlogId ? backlogKeys.get(view.backlogId) : undefined;
      return backlogKey ? [{ id: view.id, name: view.name, backlogKey }] : [];
    }),
  });
  const activeKey = context.activeBacklogKey?.toUpperCase();
  const allCount = activeKey ? counts.allByBacklog[activeKey] ?? 0 : 0;
  const onActiveBacklogRoute =
    activeKey !== undefined && pathname.toUpperCase() === `/B/${activeKey}`;
  const allItemsHref = onActiveBacklogRoute
    ? viewUrl.href(clearActiveBacklogViewParams)
    : context.allItemsHref;

  return (
    <div
      data-sidebar-shell
      className={cn(
        "flex h-full flex-col gap-1 overflow-hidden border-r border-border bg-[var(--surface-2)]",
        collapsed ? "p-2" : "p-3",
      )}
    >
      <div
        data-sidebar-brand
        className={cn("flex items-center", collapsed ? "justify-between" : "px-2 py-1")}
      >
        <div
          aria-label="Jiroo"
          title={collapsed ? "Jiroo" : undefined}
          className="t-h2 overflow-hidden font-semibold"
        >
          <span data-sidebar-collapsed-only aria-hidden="true">
            J
          </span>
          <span data-sidebar-open-only aria-hidden="true">
            Jir<span className="text-[var(--primary)]">oo</span>
          </span>
        </div>
        <button
          type="button"
          onClick={toggle}
          aria-label={collapsed ? "Déplier la barre latérale" : "Replier la barre latérale"}
          title={collapsed ? "Déplier la barre latérale" : "Replier la barre latérale"}
          className="inline-flex size-7 shrink-0 items-center justify-center rounded-[var(--radius)] text-muted-foreground hover:bg-[var(--muted)] hover:text-foreground"
        >
          <PanelLeftOpen data-sidebar-collapsed-only className="size-4" />
          <PanelLeftClose data-sidebar-open-only className="size-4" />
        </button>
      </div>

      <BacklogSelector
        backlogs={backlogs}
        collapsed={collapsed}
        activeKey={context.activeBacklogKey}
      />

      <div className="mt-2 flex flex-col gap-0.5">
        <NavLink
          href={allItemsHref}
          active={context.activeNav === "all"}
          ariaLabel={`Tous les items ${allCount}`}
          collapsed={collapsed}
          title={collapsed ? "Tous les items" : undefined}
          onNavigate={
            onActiveBacklogRoute
              ? (event) => {
                  event.preventDefault();
                  viewUrl.push(clearActiveBacklogViewParams, {
                    authoritative: true,
                  });
                }
              : undefined
          }
        >
          <Layers className="size-4" />
          <span
            data-sidebar-label
            className={collapsed ? "sr-only" : "min-w-0 flex-1 truncate"}
          >
            Tous les items
          </span>
          <Count value={allCount} collapsed={collapsed} />
        </NavLink>
        <NavLink
          href="/mine"
          active={context.activeNav === "mine"}
          ariaLabel={`Mes items ${counts.mine}`}
          collapsed={collapsed}
          title={collapsed ? "Mes items" : undefined}
        >
          <User className="size-4" />
          <span
            data-sidebar-label
            className={collapsed ? "sr-only" : "min-w-0 flex-1 truncate"}
          >
            Mes items
          </span>
          <Count value={counts.mine} collapsed={collapsed} />
        </NavLink>
      </div>

      <div data-sidebar-open-only className="min-h-0 flex-1 overflow-y-auto">
        <SidebarViews
          views={views}
          userId={userId}
          backlogs={backlogs}
          collapsed={collapsed}
        />
      </div>

      <div className="mt-auto flex flex-col gap-1">
        {user.role === "admin" && (
          <NavLink
            href="/trash"
            active={context.activeNav === "trash"}
            ariaLabel={`Corbeille ${counts.trash}`}
            collapsed={collapsed}
            title={collapsed ? "Corbeille" : undefined}
          >
            <Trash2 className="size-4" />
            <span
              data-sidebar-label
              className={collapsed ? "sr-only" : "min-w-0 flex-1 truncate"}
            >
              Corbeille
            </span>
            <Count value={counts.trash} collapsed={collapsed} />
          </NavLink>
        )}
        {user.role === "admin" && (
          <NavLink
            href="/admin"
            active={context.activeNav === "admin"}
            ariaLabel="Administration"
            collapsed={collapsed}
            title={collapsed ? "Administration" : undefined}
          >
            <Settings className="size-4" />
            <span
              data-sidebar-label
              className={collapsed ? "sr-only" : "min-w-0 flex-1 truncate"}
            >
              Administration
            </span>
          </NavLink>
        )}
        <UserCard user={user} collapsed={collapsed} />
      </div>
    </div>
  );
}

function Count({ value, collapsed }: { value: number; collapsed: boolean }) {
  return (
    <span
      data-sidebar-label
      className={cn(
        "ml-auto text-xs tabular-nums text-muted-foreground",
        collapsed && "sr-only",
      )}
    >
      {value}
    </span>
  );
}
