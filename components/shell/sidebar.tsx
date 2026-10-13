"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  ChartColumn,
  FolderKanban,
  Layers,
  List,
  ListTree,
  Rows3,
  Settings,
  SquareKanban,
  Tag,
  Trash2,
  User,
  type LucideIcon,
} from "lucide-react";
import { BacklogSelector } from "@/components/shell/backlog-selector";
import { NavLink } from "@/components/shell/nav-link";
import { useSidebarState } from "@/components/shell/sidebar-state";
import { SidebarViews } from "@/components/shell/sidebar-views";
import { useViewUrlState } from "@/components/shell/view-url-state";
import { UserCard } from "@/components/shell/user-card";
import type { SidebarViewRow } from "@/components/shell/sidebar-views";
import {
  activeProjectView,
  deriveShellContext,
  PROJECT_VIEWS,
  projectViewHref,
  type ProjectViewId,
} from "@/lib/items/shell";
import { clearActiveBacklogViewParams } from "@/lib/items/views";
import type { ShellCounts } from "@/lib/services/shell";
import { cn } from "@/lib/utils";

type Backlog = { id: string; key: string; name: string; color: string; starred?: boolean };

const PROJECT_VIEW_ICONS: Record<ProjectViewId, LucideIcon> = {
  backlog: Rows3,
  board: SquareKanban,
  list: List,
  tree: ListTree,
  releases: Tag,
  reports: ChartColumn,
};

export function Sidebar({
  backlogs,
  views,
  userId,
  user,
  canAdminister,
  adminHref = "/admin",
  counts,
}: {
  backlogs: Backlog[];
  views: SidebarViewRow[];
  userId: string;
  user: { name: string; email: string; role: string };
  canAdminister: boolean;
  adminHref?: string;
  counts: ShellCounts;
}) {
  const { collapsed: desktopCollapsed, mobile } = useSidebarState();
  const collapsed = mobile ? false : desktopCollapsed;
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

  const homeHref = context.activeBacklogKey ? `/b/${context.activeBacklogKey}` : "/";
  const activeBacklog = activeKey
    ? backlogs.find((backlog) => backlog.key.toUpperCase() === activeKey)
    : undefined;
  const activeView = activeBacklog
    ? activeProjectView(pathname, new URLSearchParams(searchParams.toString()), activeBacklog.key)
    : null;

  return (
    <div
      className={cn(
        "flex h-full flex-col gap-1 overflow-hidden border-r border-border bg-[var(--surface-2)]",
        collapsed ? "p-2" : "p-3",
      )}
    >
      <div
        className={cn(
          "flex items-center",
          collapsed ? "h-12 justify-center" : "h-10 px-2",
        )}
      >
        {/* The wordmark leads back to the active backlog home (JIR-72). */}
        <Link
          href={homeHref}
          aria-label="Jiroo — accueil"
          className="rounded-md focus-visible:outline-2 focus-visible:outline-ring"
        >
          <div
            role="img"
            aria-label="Jiroo"
            title={collapsed ? "Jiroo" : undefined}
            className="t-h2 overflow-hidden font-semibold"
          >
            {collapsed ? (
              <span aria-hidden="true">J</span>
            ) : (
              <span aria-hidden="true">
                Jir<span className="text-[var(--primary)]">oo</span>
              </span>
            )}
          </div>
        </Link>
      </div>

      <BacklogSelector
        backlogs={backlogs}
        collapsed={collapsed}
        activeKey={context.activeBacklogKey}
      />
      {/* Jira's « Projects » page: every backlog, favourites first (JIR-82). */}
      <NavLink
        href="/"
        active={context.activeNav === "backlogs"}
        ariaLabel={collapsed ? "Tous les backlogs" : undefined}
        collapsed={collapsed}
        title={collapsed ? "Tous les backlogs" : undefined}
      >
        <FolderKanban className="size-4" aria-hidden="true" />
        <span className={collapsed ? "sr-only" : "min-w-0 flex-1 truncate"}>
          Tous les backlogs
        </span>
      </NavLink>

      {activeBacklog && (
        <nav aria-label="Vues du projet" className="mt-2 flex flex-col gap-0.5">
          {PROJECT_VIEWS.map((view) => {
            const Icon = PROJECT_VIEW_ICONS[view.id];
            const itemView = view.kind === "item";
            return (
              <NavLink
                key={view.id}
                href={
                  itemView && onActiveBacklogRoute
                    ? viewUrl.href((params) => params.set("view", view.id))
                    : projectViewHref(activeBacklog.key, view.id)
                }
                active={activeView === view.id}
                ariaLabel={collapsed ? view.label : undefined}
                collapsed={collapsed}
                title={collapsed ? view.label : undefined}
                onNavigate={
                  itemView && onActiveBacklogRoute
                    ? (event) => {
                        event.preventDefault();
                        viewUrl.push((latest) => latest.set("view", view.id));
                      }
                    : undefined
                }
              >
                <Icon className="size-4" aria-hidden="true" />
                <span className={collapsed ? "sr-only" : "min-w-0 flex-1 truncate"}>
                  {view.label}
                </span>
              </NavLink>
            );
          })}
        </nav>
      )}

      <div className="mt-2 flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto">
        <div
          className={cn(
            "t-meta px-2 pb-1 font-medium uppercase tracking-wide text-muted-foreground",
            collapsed && "sr-only",
          )}
        >
          Filtres
        </div>
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
            className={collapsed ? "sr-only" : "min-w-0 flex-1 truncate"}
          >
            Mes items
          </span>
          <Count value={counts.mine} collapsed={collapsed} />
        </NavLink>
        {!collapsed && (
          <SidebarViews
            views={views}
            userId={userId}
            backlogs={backlogs}
          />
        )}
      </div>

      <div className="mt-auto flex flex-col gap-1">
        <NavLink
          href="/trash"
          active={context.activeNav === "trash"}
          ariaLabel={`Corbeille ${counts.trash}`}
          collapsed={collapsed}
          title={collapsed ? "Corbeille" : undefined}
        >
          <Trash2 className="size-4" />
          <span
            className={collapsed ? "sr-only" : "min-w-0 flex-1 truncate"}
          >
            Corbeille
          </span>
          <Count value={counts.trash} collapsed={collapsed} />
        </NavLink>
        {canAdminister && (
          <NavLink
            href={adminHref}
            active={context.activeNav === "admin"}
            ariaLabel="Administration"
            collapsed={collapsed}
            title={collapsed ? "Administration" : undefined}
          >
            <Settings className="size-4" />
            <span
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
      className={cn(
        "ml-auto text-xs tabular-nums text-muted-foreground",
        collapsed && "sr-only",
      )}
    >
      {value}
    </span>
  );
}
