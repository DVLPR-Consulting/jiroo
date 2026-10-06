import type { ComponentProps, ReactNode } from "react";
import Link from "next/link";
import { ViewTabsScroller } from "@/components/shell/view-tabs-scroller";
import { cn } from "@/lib/utils";

const ITEM_VIEW_TABS = [
  ["backlog", "Backlog"],
  ["board", "Board"],
  ["list", "Liste"],
  ["tree", "Arbre"],
] as const;

export type ItemViewTab = (typeof ITEM_VIEW_TABS)[number][0];

export type ItemViewLink = {
  href: string;
  onNavigate?: ComponentProps<typeof Link>["onNavigate"];
};

// Inset focus ring: the scrolling row would clip an outer outline.
const TAB_CLASS =
  "shrink-0 whitespace-nowrap rounded-[var(--radius-sm)] px-2.5 py-1 text-xs font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring";
const INACTIVE_TAB_CLASS = "text-[var(--subtle-foreground)] hover:text-foreground";
const ACTIVE_TAB_CLASS = "bg-[var(--accent-subtle)] text-[var(--accent-subtle-fg)]";

/** Shared frame of the backlog view bar: tabs first, optional controls after. */
export function ViewBarFrame({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-[46px] flex-wrap items-center gap-3 border-b border-border px-4 py-2">
      {children}
    </div>
  );
}

/** Project-level tabs that live on their own routes rather than as item views. */
const PAGE_TABS = [
  ["releases", "Releases"],
  ["reports", "Rapports"],
] as const;

export type BacklogTab = ItemViewTab | (typeof PAGE_TABS)[number][0];

type ViewTabsProps = {
  /** The current tab; anything else leaves every tab inactive. */
  active: string;
} & (
  | {
      /** Enables the Releases / Rapports tabs and the default item-view hrefs. */
      backlogKey: string;
      /** Overrides the item-view links, e.g. to preserve the current URL state. */
      itemViewLink?: (view: ItemViewTab) => ItemViewLink;
    }
  | {
      backlogKey?: undefined;
      itemViewLink: (view: ItemViewTab) => ItemViewLink;
    }
);

function backlogPath(backlogKey: string) {
  return `/b/${encodeURIComponent(backlogKey)}`;
}

/** Plain item-view link for pages outside the item views (no URL state to keep). */
function defaultItemViewLink(backlogKey: string) {
  return (view: ItemViewTab): ItemViewLink => ({
    href: `${backlogPath(backlogKey)}?view=${view}`,
  });
}

function tabProps(current: boolean) {
  return {
    "aria-current": current ? ("page" as const) : undefined,
    className: cn(TAB_CLASS, current ? ACTIVE_TAB_CLASS : INACTIVE_TAB_CLASS),
  };
}

export function ViewTabs(props: ViewTabsProps) {
  const { active, backlogKey } = props;
  const linkFor = props.backlogKey === undefined
    ? props.itemViewLink
    : (props.itemViewLink ?? defaultItemViewLink(props.backlogKey));

  return (
    <ViewTabsScroller
      active={active}
      className="inline-flex max-w-full shrink-0 overflow-x-auto rounded-md border border-border p-0.5 [scrollbar-width:none]"
    >
      {ITEM_VIEW_TABS.map(([view, label]) => {
        const { href, onNavigate } = linkFor(view);
        return (
          <Link key={view} href={href} onNavigate={onNavigate} {...tabProps(active === view)}>
            {label}
          </Link>
        );
      })}
      {backlogKey
        ? PAGE_TABS.map(([tab, label]) => (
            <Link
              key={tab}
              href={`${backlogPath(backlogKey)}/${tab}`}
              {...tabProps(active === tab)}
            >
              {label}
            </Link>
          ))
        : null}
    </ViewTabsScroller>
  );
}

/**
 * The view bar reduced to its project tabs, for backlog pages that are not
 * item views (Releases, Rapports): no grouping, saved views, density or
 * creation controls there.
 */
export function BacklogNavBar({
  active,
  backlogKey,
}: {
  active: BacklogTab;
  backlogKey: string;
}) {
  return (
    <ViewBarFrame>
      <ViewTabs active={active} backlogKey={backlogKey} />
    </ViewBarFrame>
  );
}
