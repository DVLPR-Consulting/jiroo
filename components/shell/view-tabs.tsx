import type { ComponentProps, ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

export const ITEM_VIEW_TABS = [
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

const TAB_CLASS =
  "rounded-[var(--radius-sm)] px-2.5 py-1 text-xs font-medium transition-colors";
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

export function ViewTabs({ active, backlogKey, itemViewLink }: ViewTabsProps) {
  const linkFor = itemViewLink ?? ((view: ItemViewTab): ItemViewLink => ({
    href: `/b/${encodeURIComponent(backlogKey ?? "")}?view=${view}`,
  }));

  return (
    <div className="inline-flex shrink-0 rounded-md border border-border p-0.5">
      {ITEM_VIEW_TABS.map(([view, label]) => {
        const { href, onNavigate } = linkFor(view);
        return (
          <Link
            key={view}
            href={href}
            onNavigate={onNavigate}
            className={cn(TAB_CLASS, active === view ? ACTIVE_TAB_CLASS : INACTIVE_TAB_CLASS)}
          >
            {label}
          </Link>
        );
      })}
      {backlogKey ? (
        <>
          <Link
            href={`/b/${encodeURIComponent(backlogKey)}/releases`}
            className={cn(TAB_CLASS, INACTIVE_TAB_CLASS)}
          >
            Releases
          </Link>
          <Link
            href={`/b/${encodeURIComponent(backlogKey)}/reports`}
            className={cn(TAB_CLASS, INACTIVE_TAB_CLASS)}
          >
            Rapports
          </Link>
        </>
      ) : null}
    </div>
  );
}
