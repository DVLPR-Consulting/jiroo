"use client";

import { useParams, useSearchParams } from "next/navigation";
import { User, Users } from "lucide-react";
import { NavLink } from "@/components/shell/nav-link";
import { partitionViews, columnsToViewState, buildViewUrl } from "@/lib/items/views";

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

  return (
    <>
      {/* Personal views */}
      <div className="t-meta flex items-center gap-1.5 px-2 pt-3 pb-1 text-muted-foreground">
        <User className="size-3" />
        Vues perso
      </div>
      <div className="flex flex-col gap-0.5">
        {personal.length === 0 ? (
          <div className="px-2 py-1 text-sm text-muted-foreground">Aucune vue</div>
        ) : (
          personal.map((v) => (
            <ViewLink
              key={v.id}
              view={v}
              basePath={`/b/${activeBacklog.key}`}
              isActive={v.id === activeViewId}
            />
          ))
        )}
      </div>

      {/* Shared views */}
      <div className="t-meta flex items-center gap-1.5 px-2 pt-3 pb-1 text-muted-foreground">
        <Users className="size-3" />
        Vues partagées
      </div>
      <div className="flex flex-col gap-0.5">
        {shared.length === 0 ? (
          <div className="px-2 py-1 text-sm text-muted-foreground">Aucune vue</div>
        ) : (
          shared.map((v) => (
            <ViewLink
              key={v.id}
              view={v}
              basePath={`/b/${activeBacklog.key}`}
              isActive={v.id === activeViewId}
            />
          ))
        )}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// ViewLink — single saved-view nav item
// ---------------------------------------------------------------------------

function ViewLink({
  view,
  basePath,
  isActive,
}: {
  view: SidebarViewRow;
  basePath: string;
  isActive: boolean;
}) {
  const { state, displayMode } = columnsToViewState(view);
  const href = buildViewUrl({ id: view.id, state, displayMode }, basePath);

  return (
    <NavLink
      href={href}
      active={isActive}
    >
      <span className="truncate">{view.name}</span>
    </NavLink>
  );
}
