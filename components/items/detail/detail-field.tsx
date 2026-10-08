"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { Pencil } from "lucide-react";
import { useShortcutHandler } from "@/components/shortcuts/keyboard-shortcuts-provider";
import { FieldStatusContext, type FieldStatus } from "@/components/items/detail/field-status";
import type { SequenceShortcutId } from "@/lib/shortcuts/registry";

const FOCUSABLE = "select, input, textarea, button, [tabindex]:not([tabindex='-1'])";
/** Menus and pickers render in a portal: focus moving there keeps editing. */
const PORTALED = "[data-radix-popper-content-wrapper], [role='menu'], [role='listbox']";

function openControl(control: HTMLElement) {
  control.focus();
  if (control instanceof HTMLSelectElement) {
    try {
      control.showPicker?.();
    } catch {
      // Not allowed or not supported: the focused select opens with the keyboard.
    }
  }
}

/**
 * One row of the drawer's « Détails » panel (Jira): `label : value` in read
 * mode, the existing editor once the value is clicked. Editing ends when
 * focus leaves the row or with Escape (which then stays off the drawer).
 * An empty value reads « Aucun(e) », greyed.
 */
export function DetailField({
  label,
  value,
  emptyText = "Aucun",
  editor,
  shortcut,
  after,
  editTrigger = "value",
}: {
  label: string;
  /** Read rendering; null or undefined when the field is empty. */
  value?: ReactNode;
  emptyText?: string;
  /** The editor shown on click; omitted when the user may not edit. */
  editor?: ReactNode;
  /** Registry shortcut that opens this field's editor (e.g. « a »). */
  shortcut?: SequenceShortcutId;
  /** Extra content under the value (e.g. « M'assigner »). */
  after?: ReactNode;
  /**
   * "icon" keeps the value interactive (e.g. the parent link) and opens the
   * editor from a small « Modifier » button instead of the value itself.
   */
  editTrigger?: "value" | "icon";
}) {
  const labelId = useId();
  const valueId = useId();
  const [editing, setEditing] = useState(false);
  // The editor stays mounted in read mode: its optimistic value, pending
  // lock and error survive leaving the field, and it reports them here.
  const [status, setStatus] = useState<FieldStatus>({ pending: false, error: null });
  const editRef = useRef<HTMLDivElement>(null);
  const readRef = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef(false);
  const editable = editor !== undefined;
  useShortcutHandler(shortcut ?? "item.assign", Boolean(shortcut) && editable && !editing && (() => setEditing(true)));

  useEffect(() => {
    if (editing) {
      const control = editRef.current?.querySelector<HTMLElement>(FOCUSABLE);
      if (control) openControl(control);
    } else if (returnFocus.current) {
      returnFocus.current = false;
      readRef.current?.focus();
    }
  }, [editing]);

  // A control disabled while saving drops focus without a blur event: also
  // close when the user then presses or focuses anywhere outside the row.
  useEffect(() => {
    if (!editing) return;
    const closeOutside = (event: Event) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (editRef.current?.contains(target)) return;
      if (target instanceof Element && target.closest(PORTALED)) return;
      setEditing(false);
    };
    document.addEventListener("pointerdown", closeOutside, true);
    document.addEventListener("focusin", closeOutside, true);
    return () => {
      document.removeEventListener("pointerdown", closeOutside, true);
      document.removeEventListener("focusin", closeOutside, true);
    };
  }, [editing]);

  function onBlur(event: FocusEvent<HTMLDivElement>) {
    const next = event.relatedTarget;
    if (next instanceof Node && event.currentTarget.contains(next)) return;
    if (next instanceof Element && next.closest(PORTALED)) return;
    setEditing(false);
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Escape") return;
    event.preventDefault();
    returnFocus.current = true;
    setEditing(false);
  }

  const isEmpty = value === null || value === undefined || value === "";
  const display = isEmpty ? (
    <span className="text-muted-foreground">{emptyText}</span>
  ) : (
    value
  );

  return (
    <div className="contents" data-testid="item-detail-field">
      <dt id={labelId} className="px-2 py-2 text-muted-foreground">
        {label}
      </dt>
      <dd className="m-0 flex min-w-0 flex-col gap-0.5 px-1 py-1">
        {editable && (
          <div
            ref={editRef}
            hidden={!editing}
            data-local-escape
            onBlur={onBlur}
            onKeyDown={onKeyDown}
            className="px-1"
          >
            <FieldStatusContext.Provider value={setStatus}>{editor}</FieldStatusContext.Provider>
          </div>
        )}
        {editable && editing ? null : editable && editTrigger === "icon" ? (
          <span className="flex min-h-8 min-w-0 items-center gap-2 px-1.5 py-1">
            <span id={valueId} className="flex min-w-0 flex-1 items-center gap-2">
              {display}
            </span>
            <button
              ref={readRef}
              type="button"
              aria-label={`Modifier : ${label}`}
              onClick={() => setEditing(true)}
              className="flex-none rounded-[var(--radius)] p-1 text-muted-foreground outline-none hover:bg-[var(--muted)] hover:text-foreground focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
            >
              <Pencil aria-hidden className="size-3.5" />
            </button>
          </span>
        ) : editable ? (
          <button
            ref={readRef}
            type="button"
            aria-labelledby={`${labelId} ${valueId}`}
            onClick={() => setEditing(true)}
            className="flex min-h-8 w-full min-w-0 items-center gap-2 rounded-[var(--radius)] px-1.5 py-1 text-left outline-none hover:bg-[var(--muted)] focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
          >
            <span id={valueId} className="flex min-w-0 items-center gap-2">
              {display}
            </span>
          </button>
        ) : (
          <span id={valueId} className="flex min-h-8 min-w-0 items-center gap-2 px-1.5 py-1">
            {display}
          </span>
        )}
        {editable && !editing && status.pending && (
          <span className="px-1.5 text-xs text-muted-foreground">Enregistrement…</span>
        )}
        {editable && !editing && status.error && (
          <p role="alert" className="px-1.5 text-xs text-[var(--danger)]">
            {status.error}
          </p>
        )}
        {after}
      </dd>
    </div>
  );
}
