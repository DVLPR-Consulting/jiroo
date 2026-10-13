"use client";

import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { CalendarDays } from "lucide-react";
import { KindIcon } from "@/components/icons/kind-icon";
import { StatusDot } from "@/components/icons/status-dot";
import { TypeIcon } from "@/components/icons/type-icon";
import {
  FixVersionChips,
  type FixVersionOption,
} from "@/components/items/fix-version-picker";
import {
  InlineAssignee,
  InlineEstimate,
  InlinePriority,
  InlineStatus,
} from "@/components/items/inline-item-field";
import { LabelPill } from "@/components/items/label-pill";
import {
  PRIORITIES,
  type ItemKind,
  type ItemType,
  type Priority,
  type StatusId,
} from "@/lib/design/constants";

type StatusCategory = "todo" | "in_progress" | "done";

type StatusOption = {
  id: string;
  name: string;
  color: string;
  category: StatusCategory;
  order: number;
};

type UserOption = { id: string; name: string };

/**
 * One ticket, as every list display shows it (JIR-93): the Backlog row is the
 * reference. Optional fields render only when present, so each context passes
 * what it knows and what its « Colonnes » choice shows.
 */
export type ItemRowData = {
  id: string;
  key: string;
  title: string;
  /** Unknown for a historical row whose item no longer exists. */
  type: ItemType | null;
  kind?: ItemKind | null;
  blocked?: boolean;
  /** Looked up in `editing.statuses` (inline editing). */
  statusId?: string;
  /** Shown as is without inline editing. */
  status?: { name: string; category: StatusCategory | null } | null;
  priority?: number;
  /**
   * `undefined`: not estimable in this context (an editable row keeps an
   * empty slot so its status column stays aligned).
   */
  estimatePoints?: number | null;
  /** `undefined`: no assignee avatar in this context. */
  assigneeId?: string | null;
  assigneeName?: string | null;
  /** Shown as a pill: the parent epic in the Backlog, any parent in the Liste. */
  parent?: { key: string; title: string; type?: ItemType | null } | null;
  fixVersions?: FixVersionOption[];
  labels?: { id: string; name: string; color: string }[];
  /** ISO date; `undefined` hides the due date pill. */
  dueDate?: string | null;
};

/** Inline editing of the row's fields (Backlog, Liste). */
export type ItemRowEditing = {
  backlogKey: string;
  statuses: StatusOption[];
  users: UserOption[];
  canEdit: boolean;
  canTransition: boolean;
  canAssign: boolean;
};

const ROW_CLASS =
  "group/row flex min-h-[var(--row-h)] flex-wrap items-center gap-x-2.5 gap-y-0.5 border-b border-border py-0.5 pl-2 pr-3 transition-colors last:border-b-0 hover:bg-[var(--muted)]/60 sm:pr-3.5";

/**
 * Editable but empty values (no priority, no estimate) stay out of sight
 * until the row is hovered or the control is focused (« ne rien afficher
 * quand une valeur est vide »), so inline editing is never lost.
 */
const REVEAL_ON_ROW_HOVER =
  "opacity-0 transition-opacity group-hover/row:opacity-100 focus-within:opacity-100";

const dueDateFormatter = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

function asPriority(value: number): Priority {
  return PRIORITIES.includes(value as Priority) ? (value as Priority) : 0;
}

/** The progress circle of a status known only by its category. */
function categoryStatusId(category: StatusCategory): StatusId {
  if (category === "in_progress") return "doing";
  return category;
}

function formatDueDate(value: string): string | null {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : dueDateFormatter.format(date);
}

/** The row checkbox of a list with bulk selection (Backlog, Liste). */
export function RowSelectCheckbox({
  itemKey,
  checked,
  onToggle,
}: {
  itemKey: string;
  checked: boolean;
  onToggle: (extendRange: boolean) => void;
}) {
  return (
    <input
      type="checkbox"
      checked={checked}
      onChange={() => undefined}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        onToggle(event.shiftKey);
      }}
      aria-label={`Sélectionner ${itemKey}`}
      className="mx-1 size-4 cursor-pointer accent-[var(--primary)]"
    />
  );
}

function BugPill() {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[11.5px] font-medium"
      style={{
        color: "color-mix(in oklch, var(--danger) 80%, var(--foreground))",
        background: "color-mix(in oklch, var(--danger) 12%, transparent)",
      }}
    >
      <span aria-hidden className="inline-flex">
        <KindIcon kind="bug" />
      </span>
      Bug
    </span>
  );
}

function DueDatePill({ value }: { value: string }) {
  const label = formatDueDate(value);
  if (!label) return null;
  return (
    <span
      className="inline-flex items-center gap-1 whitespace-nowrap rounded px-1.5 py-0.5 text-xs text-muted-foreground"
      title="Échéance"
    >
      <CalendarDays aria-hidden size={12} />
      <span className="sr-only">Échéance :</span>
      {label}
    </span>
  );
}

function ReadOnlyStatus({ status }: { status: NonNullable<ItemRowData["status"]> }) {
  return (
    <span className="inline-flex min-h-7 max-w-full items-center gap-1.5 px-1.5 py-1 text-xs text-muted-foreground">
      {status.category ? <StatusDot status={categoryStatusId(status.category)} /> : null}
      <span className="truncate">{status.name}</span>
    </span>
  );
}

/**
 * The shared ticket row. It opens the item either through `onOpen` (the
 * whole row is a focusable control, as in the Backlog) or through `href`
 * (the identity is a link stretched over the row); `leading` holds the
 * selection checkbox and the drag handle, `trailing` what only its context
 * shows (a deletion date, a restore button…).
 */
export function ItemRow({
  item,
  editing,
  as = "row",
  onOpen,
  href,
  onNavigate,
  selected = false,
  leading,
  trailing,
  rowRef,
  style,
}: {
  item: ItemRowData;
  editing?: ItemRowEditing;
  /** A `role="row"` in a `role="table"`, or an `<li>` in a list. */
  as?: "row" | "li";
  onOpen?: () => void;
  href?: string;
  onNavigate?: (event: { preventDefault: () => void }) => void;
  selected?: boolean;
  leading?: ReactNode;
  trailing?: ReactNode;
  rowRef?: (node: HTMLElement | null) => void;
  style?: CSSProperties;
}) {
  const cellRole = as === "row" ? "cell" : undefined;
  const priority = item.priority === undefined ? undefined : asPriority(item.priority);
  const fixVersions = item.fixVersions ?? [];
  const labels = item.labels ?? [];
  const backlogKey = editing?.backlogKey ?? "";
  const canEdit = editing?.canEdit ?? false;
  const estimable = item.estimatePoints !== undefined;

  const identity = (
    <>
      {item.type ? <TypeIcon type={item.type} /> : null}
      <span className="shrink-0 font-mono text-[11.5px] font-medium text-muted-foreground">
        {item.key}
      </span>
      <span className="min-w-0 truncate text-sm">{item.title}</span>
    </>
  );

  const content = (
    <>
      {leading !== undefined ? (
        <div role={cellRole} className="flex shrink-0 items-center gap-0.5">
          {leading}
        </div>
      ) : null}
      <div role={cellRole} className="flex min-w-0 flex-1 basis-48 items-center gap-2">
        {href ? (
          <Link
            href={href}
            onNavigate={onNavigate}
            className="flex min-w-0 items-center gap-2 outline-none after:absolute after:inset-0 after:content-[''] focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-[var(--ring)]"
          >
            {identity}
          </Link>
        ) : (
          identity
        )}
        {item.blocked ? (
          <span
            className="inline-flex flex-none items-center rounded px-1.5 py-0.5 text-[11px] font-medium"
            style={{
              color: "color-mix(in oklch, var(--danger) 80%, var(--foreground))",
              background: "color-mix(in oklch, var(--danger) 14%, transparent)",
            }}
          >
            bloqué
          </span>
        ) : null}
      </div>
      <div
        role={cellRole}
        className="ml-auto flex max-w-full shrink-0 flex-wrap items-center justify-end gap-x-2 gap-y-0.5"
      >
        {item.kind === "bug" ? <BugPill /> : null}
        {item.parent ? (
          <span
            className="inline-flex max-w-40 items-center gap-1.5 rounded-[var(--radius-sm)] bg-[var(--accent-subtle)] px-2 py-0.5 text-xs font-medium text-[var(--accent-subtle-fg)]"
            title={`${item.parent.key} — ${item.parent.title}`}
          >
            <TypeIcon type={item.parent.type ?? "epic"} size={11} />
            <span className="truncate">{item.parent.title}</span>
          </span>
        ) : null}
        {labels.length > 0 ? (
          <span className="flex min-w-0 flex-wrap items-center gap-1">
            {labels.map((label) => (
              <LabelPill key={label.id} name={label.name} color={label.color} />
            ))}
          </span>
        ) : null}
        {item.dueDate ? <DueDatePill value={item.dueDate} /> : null}
        {priority === undefined ? null : editing ? (
          priority !== 0 ? (
            <InlinePriority
              itemId={item.id}
              backlogKey={backlogKey}
              priority={priority}
              readOnly={!canEdit}
            />
          ) : canEdit ? (
            <span className={REVEAL_ON_ROW_HOVER}>
              <InlinePriority itemId={item.id} backlogKey={backlogKey} priority={0} />
            </span>
          ) : null
        ) : priority !== 0 ? (
          <InlinePriority itemId={item.id} backlogKey="" priority={priority} readOnly />
        ) : null}
        {fixVersions.length > 0 ? <FixVersionChips versions={fixVersions} /> : null}
        {editing && item.statusId !== undefined ? (
          <span className="inline-flex w-28 min-w-0 justify-start">
            <InlineStatus
              itemId={item.id}
              backlogKey={backlogKey}
              statusId={item.statusId}
              statuses={editing.statuses}
              readOnly={!canEdit || !editing.canTransition}
            />
          </span>
        ) : item.status ? (
          <span className="inline-flex w-28 min-w-0 justify-start">
            <ReadOnlyStatus status={item.status} />
          </span>
        ) : null}
        {editing || estimable ? (
          <span
            className={`inline-flex w-8 justify-center ${
              estimable && item.estimatePoints === null && canEdit ? REVEAL_ON_ROW_HOVER : ""
            }`}
          >
            {estimable ? (
              <InlineEstimate
                itemId={item.id}
                backlogKey={backlogKey}
                estimatePoints={item.estimatePoints ?? null}
                readOnly={!canEdit}
                compact
              />
            ) : null}
          </span>
        ) : null}
        {editing ? (
          <InlineAssignee
            itemId={item.id}
            backlogKey={backlogKey}
            assigneeId={item.assigneeId ?? null}
            assigneeName={item.assigneeName}
            users={editing.users}
            readOnly={!canEdit || !editing.canAssign}
            compact
          />
        ) : item.assigneeId !== undefined ? (
          <InlineAssignee
            itemId={item.id}
            backlogKey={backlogKey}
            assigneeId={item.assigneeId}
            assigneeName={item.assigneeName}
            users={[]}
            readOnly
            compact
          />
        ) : null}
        {trailing !== undefined ? (
          <span className="relative z-[1] flex flex-wrap items-center gap-x-2 gap-y-0.5">
            {trailing}
          </span>
        ) : null}
      </div>
    </>
  );

  const highlight = selected ? "bg-[var(--accent-subtle)]" : "";

  if (onOpen) {
    return (
      <div
        ref={rowRef}
        role={as === "row" ? "row" : "listitem"}
        tabIndex={0}
        data-shortcut-item={item.key}
        aria-label={`${item.key} — ${item.title}`}
        onClick={onOpen}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return;
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onOpen();
          }
        }}
        className={`${ROW_CLASS} cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ring)] ${highlight}`}
        style={style}
      >
        {content}
      </div>
    );
  }

  const className = `${ROW_CLASS} ${href ? "relative" : ""} ${highlight}`;
  if (as === "li") {
    return (
      <li ref={rowRef} className={className} style={style}>
        {content}
      </li>
    );
  }
  return (
    <div
      ref={rowRef}
      role="row"
      aria-label={`${item.key} — ${item.title}`}
      className={className}
      style={style}
    >
      {content}
    </div>
  );
}
