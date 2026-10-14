"use client";

import { useState, type ComponentProps, type ReactNode, type Ref } from "react";
import { ChevronRight } from "lucide-react";
import type { PointsByStatusCategory } from "@/lib/items/status-points";

/**
 * The Backlog's section « table » (JIR-97): a bordered, rounded card whose
 * header names the section, counts its items and sums its points, above
 * the shared item rows. Every display of items (Backlog sections, Liste,
 * Mes items, Corbeille, release scope, sprint report) is laid out in it.
 */

const points = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });

const PILLS = [
  { key: "todo", label: "À faire", background: "var(--status-todo-bg)" },
  { key: "inProgress", label: "En cours", background: "var(--status-doing-bg)" },
  { key: "done", label: "Terminé", background: "var(--status-done-bg)" },
] as const;

/** Story points per status category, as Jira's backlog header lozenges. */
export function StatusPointsPills({ value }: { value: PointsByStatusCategory }) {
  const summary = PILLS.map((pill) => `${pill.label} ${points.format(value[pill.key])}`).join(", ");
  return (
    <span className="flex items-center gap-1.5 text-xs" data-status-points>
      <span className="sr-only">{`Points par statut : ${summary}`}</span>
      {PILLS.map((pill) => (
        <span
          key={pill.key}
          aria-hidden
          title={pill.label}
          className="min-w-[22px] rounded-full px-1.5 py-0.5 text-center font-semibold tabular-nums text-foreground"
          style={{ background: pill.background }}
        >
          {points.format(value[pill.key])}
        </span>
      ))}
      <span aria-hidden className="ml-0.5 text-muted-foreground">pts</span>
    </span>
  );
}

/** The section's summary, next to its title (see `itemsSummaryLabel`). */
export function ItemSectionSummary({ children }: { children: ReactNode }) {
  return <span className="text-[13px] text-muted-foreground">{children}</span>;
}

/** The select-all checkbox of a section header (indeterminate when partly selected). */
export function SectionSelectAll({
  checked,
  indeterminate,
  onChange,
  label,
}: {
  checked: boolean;
  indeterminate: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <input
      ref={(node) => {
        if (node) node.indeterminate = indeterminate;
      }}
      type="checkbox"
      checked={checked}
      onChange={onChange}
      aria-label={label}
      className="mx-1 size-4 shrink-0 cursor-pointer accent-[var(--primary)]"
    />
  );
}

/** The card itself; `highlighted` marks it as a drop target. */
export function ItemSection({
  ref,
  highlighted = false,
  children,
  ...props
}: ComponentProps<"section"> & { ref?: Ref<HTMLElement>; highlighted?: boolean }) {
  return (
    <section
      ref={ref}
      data-item-section=""
      {...props}
      className={`rounded-[var(--radius-lg)] border bg-[var(--surface)] ${
        highlighted ? "border-[var(--ring)] bg-[var(--accent-subtle)]" : "border-border"
      }`}
    >
      {children}
    </section>
  );
}

export type ItemSectionHeaderProps = {
  /** The section name, also used by the collapse button's name. */
  name: string;
  /** Shown instead of `name` as the heading content (e.g. with a badge). */
  title?: ReactNode;
  headingLevel?: 2 | 3;
  /** Collapse chevron; omitted for a section that cannot collapse. */
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
  /** Select-all checkbox of the section's rows. */
  selectControl?: ReactNode;
  /** Right after the title: the items summary or a state badge. */
  summary?: ReactNode;
  /** More inline details after the summary (dates, goal…). */
  details?: ReactNode;
  /** Right side: points counters, then the section's actions. */
  aside?: ReactNode;
  /** A full-width second line (sprint metrics, sort…). */
  meta?: ReactNode;
  /** Rendered last, e.g. a dialog owned by the header. */
  children?: ReactNode;
};

export function ItemSectionHeader({
  name,
  title,
  headingLevel = 3,
  expanded,
  onExpandedChange,
  selectControl,
  summary,
  details,
  aside,
  meta,
  children,
}: ItemSectionHeaderProps) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return (
    <header className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 border-b border-border px-3 py-2.5 sm:px-3.5">
      {selectControl}
      {expanded !== undefined && onExpandedChange ? (
        <button
          type="button"
          className="inline-flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground outline-none hover:bg-[var(--muted)] hover:text-foreground focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
          aria-label={`${expanded ? "Replier" : "Déplier"} ${name}`}
          aria-expanded={expanded}
          onClick={() => onExpandedChange(!expanded)}
        >
          <ChevronRight
            aria-hidden
            className={`size-4 transition-transform ${expanded ? "rotate-90" : ""}`}
          />
        </button>
      ) : null}
      <Heading className="min-w-0 truncate text-[15px] font-semibold">{title ?? name}</Heading>
      {summary}
      {details}
      {aside ? <div className="ml-auto flex flex-wrap items-center gap-2">{aside}</div> : null}
      {meta ? (
        <div className="flex basis-full flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
          {meta}
        </div>
      ) : null}
      {children}
    </header>
  );
}

/**
 * A whole section that keeps its own collapsed state, for displays without
 * selection (Mes items, Corbeille, release scope, sprint report). The state
 * lives only in this component session, like the Backlog's.
 */
export function CollapsibleItemSection({
  label,
  defaultExpanded = true,
  children,
  footer,
  ...header
}: Omit<ItemSectionHeaderProps, "expanded" | "onExpandedChange" | "children"> & {
  /** The card's accessible name (defaults to `name`). */
  label?: string;
  defaultExpanded?: boolean;
  /** Rows (or an empty state), hidden while collapsed. */
  children: ReactNode;
  /** Below the rows, hidden while collapsed (pagination…). */
  footer?: ReactNode;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  return (
    <ItemSection aria-label={label ?? header.name}>
      <ItemSectionHeader {...header} expanded={expanded} onExpandedChange={setExpanded} />
      {expanded ? children : null}
      {expanded ? footer : null}
    </ItemSection>
  );
}
