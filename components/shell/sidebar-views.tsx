"use client";

import { useParams, usePathname, useSearchParams } from "next/navigation";
import { Plus, User, Users } from "lucide-react";
import { NavLink } from "@/components/shell/nav-link";
import { requestSaveView } from "@/components/shell/save-view-event";
import { useViewUrlState } from "@/components/shell/view-url-state";
import {
  partitionViews,
  columnsToViewState,
  applySavedViewParams,
} from "@/lib/items/views";

// ---------------------------------------------------------------------------
// SidebarViewRow
// ---------------------------------------------------------------------------

/**
 * Structural type covering the columns needed to render a saved-view link.
 * Compatible with the Drizzle `views` table inferred select type.
 */
export type SidebarViewRow = {
  id: string;
  name: string;
  backlogId: string | null;
  ownerId: string;
  shared: boolean;
  displayMode: string;
  groupBy: string | null;
  filters: unknown;
  sort: unknown;
};

type Backlog = { id: string; key: string; name: string; color: string };

// ---------------------------------------------------------------------------
// SidebarViews
// ---------------------------------------------------------------------------

export function SidebarViews({
  views,
  userId,
  backlogs,
  collapsed = false,
}: {
  views: SidebarViewRow[];
  userId: string;
  backlogs: Backlog[];
  collapsed?: boolean;
}) {
  const params = useParams<{ key?: string }>();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  // Derive the active backlog from the route param.
  const activeKey = typeof params.key === "string" ? params.key.toUpperCase() : undefined;
  const activeBacklog = activeKey ? backlogs.find((b) => b.key === activeKey) : undefined;

  // Not on a /b/[key] route — views sections have no context, hide them.
  if (!activeBacklog || collapsed) return null;

  // Filter to the active backlog and partition.
  // SidebarViewRow is a structural superset of ViewRow, so partitionViews
  // preserves every column at runtime — cast back to the richer type.
  const forBacklog = views.filter((v) => v.backlogId === activeBacklog.id);
  const { personal, shared } = partitionViews(forBacklog, userId) as {
    personal: SidebarViewRow[];
    shared: SidebarViewRow[];
  };

  const activeViewId = searchParams.get("v");
  // Only the item views mount the view actions that own the save dialog.
  const onItemViews =
    pathname.replace(/\/$/, "").toUpperCase() ===
    `/B/${encodeURIComponent(activeBacklog.key)}`.toUpperCase();

  return (
    <>
      {personal.length > 0 && (
        <ViewGroup icon={<User className="size-3" />} title="Vues perso">
          {personal.map((v) => (
            <ViewLink key={v.id} view={v} isActive={v.id === activeViewId} />
          ))}
        </ViewGroup>
      )}
      {shared.length > 0 && (
        <ViewGroup icon={<Users className="size-3" />} title="Vues partagées">
          {shared.map((v) => (
            <ViewLink key={v.id} view={v} isActive={v.id === activeViewId} />
          ))}
        </ViewGroup>
      )}
      {onItemViews && (
        <button
          type="button"
          onClick={requestSaveView}
          className="flex items-center gap-2 rounded-[var(--radius)] px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-[var(--muted)] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
        >
          <Plus className="size-4" aria-hidden="true" />
          Enregistrer une vue
        </button>
      )}
    </>
  );
}

function ViewGroup({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <div className="t-meta flex items-center gap-1.5 px-2 pt-2 pb-1 text-muted-foreground">
        {icon}
        {title}
      </div>
      <div className="flex flex-col gap-0.5">{children}</div>
    </>
  );
}

// ---------------------------------------------------------------------------
// ViewLink — single saved-view nav item
// ---------------------------------------------------------------------------

function ViewLink({
  view,
  isActive,
}: {
  view: SidebarViewRow;
  isActive: boolean;
}) {
  const viewUrl = useViewUrlState();
  const { state, displayMode } = columnsToViewState(view);
  const applyView = (params: URLSearchParams) =>
    applySavedViewParams(params, { id: view.id, state, displayMode });
  const href = viewUrl.href(applyView);

  return (
    <NavLink
      href={href}
      active={isActive}
      onNavigate={(event) => {
        event.preventDefault();
        viewUrl.push(applyView, { authoritative: true });
      }}
    >
      <span className="truncate">{view.name}</span>
    </NavLink>
  );
}
