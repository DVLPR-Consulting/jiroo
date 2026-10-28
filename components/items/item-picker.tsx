"use client";

import {
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  useState,
  type KeyboardEvent,
  type Ref,
} from "react";
import { X } from "lucide-react";
import {
  searchBacklogItemsAction,
  type ItemChoice,
  type SearchBacklogItemsInput,
  type SearchBacklogItemsResult,
} from "@/app/actions/item-choices";
import { TypeIcon } from "@/components/icons/type-icon";
import { Input } from "@/components/ui/input";
import type { ItemType } from "@/lib/design/constants";
import { cn } from "@/lib/utils";

export type { ItemChoice };

export type ItemPickerSearch = (input: SearchBacklogItemsInput) => Promise<SearchBacklogItemsResult>;

/** « CASS-12 — Page de connexion »: what the field shows of its value. */
export function itemChoiceLabel(item: ItemChoice): string {
  return `${item.key} — ${item.title}`;
}

export type ItemPickerProps = {
  id?: string;
  backlogKey: string;
  /** The levels offered (a parent's type, for instance); every level otherwise. */
  types?: readonly ItemType[];
  /** A few items left out of the choices (the item itself). */
  excludeIds?: readonly string[];
  /** Leaves out this item and everything it is linked to, however many links. */
  excludeLinksOf?: string;
  value: ItemChoice | null;
  onChange: (next: ItemChoice | null) => void;
  placeholder?: string;
  /** Shown instead of a list when the backlog has nothing to offer. */
  emptyLabel?: string;
  /**
   * Called once the first choices are known (on mount, then whenever the
   * levels change): whether the backlog has nothing of that level at all.
   */
  onEmptyChange?: (empty: boolean) => void;
  disabled?: boolean;
  /** Adds « × » to clear an optional value. */
  clearable?: boolean;
  "aria-label"?: string;
  "aria-describedby"?: string;
  "aria-required"?: boolean;
  "aria-invalid"?: boolean;
  inputRef?: Ref<HTMLInputElement>;
  className?: string;
  /** The search itself: the server action, or a test's stand-in. */
  search?: ItemPickerSearch;
  /** Milliseconds without a keystroke before a typed query is sent. */
  debounceMs?: number;
};

const SEARCH_FAILED = "Recherche impossible.";
const SEARCHING = "Recherche en cours.";
const SEPARATOR = "\u001f";

/** What a search answered, tied to what was asked: only that is shown. */
type Answer = { identity: string; items: ItemChoice[]; limit: number };
type Failure = { identity: string; message: string };

/**
 * A combobox that picks one item of a backlog by searching it on the server
 * (JIR-118): at most a page of choices, loaded when the field opens and
 * narrowed as the user types, so no screen carries the backlog's items for a
 * choice. Keyboard: ↓ ↑ move, Entrée picks, Échap closes the list only.
 */
export function ItemPicker({
  id,
  backlogKey,
  types,
  excludeIds,
  excludeLinksOf,
  value,
  onChange,
  placeholder,
  emptyLabel = "Aucun item dans ce backlog.",
  onEmptyChange,
  disabled,
  clearable,
  "aria-label": ariaLabel,
  "aria-describedby": ariaDescribedBy,
  "aria-required": ariaRequired,
  "aria-invalid": ariaInvalid,
  inputRef,
  className,
  search = searchBacklogItemsAction,
  debounceMs = 150,
}: ItemPickerProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const listId = `${generatedId}-list`;
  const [open, setOpen] = useState(false);
  // The input shows the value's label until the user types their own text.
  const [query, setQuery] = useState(() => (value ? itemChoiceLabel(value) : ""));
  const [typed, setTyped] = useState(false);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [active, setActive] = useState(0);
  const ownInputRef = useRef<HTMLInputElement | null>(null);
  const requestSeq = useRef(0);
  // Callers hand fresh arrays and callbacks on every render: the search
  // depends on their content only, read when it runs (kept in sync before
  // the effects below, which React runs in order).
  const latest = useRef({ types, excludeIds, excludeLinksOf, onEmptyChange });
  useEffect(() => {
    latest.current = { types, excludeIds, excludeLinksOf, onEmptyChange };
  });
  // What a search is asked about: the answers of another scope or text are
  // never shown, whenever they arrive.
  const scopeKey = [
    backlogKey,
    types?.join(SEPARATOR) ?? "",
    excludeIds?.join(SEPARATOR) ?? "",
    excludeLinksOf ?? "",
  ].join(SEPARATOR);
  const effectiveQuery = typed ? query.trim() : "";
  const identity = `${scopeKey}${SEPARATOR}${effectiveQuery}`;

  // The caller's ref sees the input itself (to focus it after an error).
  useImperativeHandle(inputRef, () => ownInputRef.current as HTMLInputElement, []);

  // A value set from outside (a reset, a prefilled parent) shows at once,
  // unless the user is typing their own text.
  const [shownValueId, setShownValueId] = useState(value?.id ?? null);
  if ((value?.id ?? null) !== shownValueId) {
    setShownValueId(value?.id ?? null);
    if (!typed) setQuery(value ? itemChoiceLabel(value) : "");
  }

  const runSearch = useCallback(
    (q: string) => {
      const seq = ++requestSeq.current;
      const asked = `${scopeKey}${SEPARATOR}${q}`;
      const { types: currentTypes, excludeIds: currentExcludes, excludeLinksOf: currentLinksOf } = latest.current;
      search({
        backlogKey,
        q,
        ...(currentTypes && currentTypes.length > 0 ? { types: [...currentTypes] } : {}),
        ...(currentExcludes && currentExcludes.length > 0 ? { excludeIds: [...currentExcludes] } : {}),
        ...(currentLinksOf ? { excludeLinksOf: currentLinksOf } : {}),
      })
        .then((result) => {
          // A later request answers for the field: an earlier one is stale.
          if (seq !== requestSeq.current) return;
          if (result.ok) {
            setAnswer({ identity: asked, items: result.items, limit: result.limit });
            setFailure(null);
            // A new list starts again from its first result.
            setActive(0);
            if (q === "") latest.current.onEmptyChange?.(result.items.length === 0);
          } else {
            setFailure({ identity: asked, message: result.error });
          }
        })
        .catch(() => {
          if (seq !== requestSeq.current) return;
          setFailure({ identity: asked, message: SEARCH_FAILED });
        });
    },
    [backlogKey, scopeKey, search],
  );

  // The field learns at once whether there is anything to pick, when asked to.
  useEffect(() => {
    if (latest.current.onEmptyChange) runSearch("");
  }, [runSearch]);

  // Open: the first choices right away, a typed query once typing pauses.
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => runSearch(effectiveQuery), effectiveQuery === "" ? 0 : debounceMs);
    return () => clearTimeout(timer);
  }, [open, effectiveQuery, runSearch, debounceMs]);

  // Only the answer to what is asked now is shown and selectable; until it
  // arrives, the list says it is searching.
  const answered = open && answer?.identity === identity ? answer : null;
  const failed = open && failure?.identity === identity ? failure.message : null;
  const shown = answered?.items ?? null;
  const pending = open && !answered && !failed;
  const count = shown?.length ?? 0;
  const effectiveActive = count > 0 ? Math.min(active, count - 1) : 0;
  const activeId = count > 0 ? `${listId}-${effectiveActive}` : undefined;

  // The active result stays in view as the keyboard moves through the list.
  useEffect(() => {
    if (!activeId) return;
    document.getElementById(activeId)?.scrollIntoView?.({ block: "nearest" });
  }, [activeId]);

  function select(item: ItemChoice) {
    onChange(item);
    setQuery(itemChoiceLabel(item));
    setTyped(false);
    setOpen(false);
  }

  function clear() {
    onChange(null);
    setQuery("");
    setTyped(false);
    setOpen(false);
    ownInputRef.current?.focus();
  }

  function close() {
    setOpen(false);
    // Text that picked nothing goes back to the value.
    if (typed) {
      setTyped(false);
      setQuery(value ? itemChoiceLabel(value) : "");
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        if (!open) setOpen(true);
        else if (count > 0) setActive(Math.min(effectiveActive + 1, count - 1));
        return;
      case "ArrowUp":
        event.preventDefault();
        if (open && count > 0) setActive(Math.max(effectiveActive - 1, 0));
        return;
      case "Home":
        if (open && count > 0) {
          event.preventDefault();
          setActive(0);
        }
        return;
      case "End":
        if (open && count > 0) {
          event.preventDefault();
          setActive(count - 1);
        }
        return;
      case "Enter":
        if (!open) return;
        // The list is open: Entrée picks, it never submits the form around.
        event.preventDefault();
        if (shown?.[effectiveActive]) select(shown[effectiveActive]);
        return;
      case "Escape":
        if (!open) return;
        // Échap closes the list only: the dialog or drawer around stays.
        event.preventDefault();
        event.stopPropagation();
        close();
        return;
      case "Tab":
        if (open) close();
        return;
      default:
        return;
    }
  }

  const message = !open
    ? null
    : pending
      ? SEARCHING
      : failed
        ? failed
        : count === 0
          ? effectiveQuery === ""
            ? emptyLabel
            : `Aucun résultat pour « ${effectiveQuery} ».`
          : answered !== null && count >= answered.limit
            ? "Affinez la recherche pour voir d’autres items."
            : null;
  const status = !open
    ? ""
    : count > 0
      ? `${count} ${count > 1 ? "résultats" : "résultat"}.`
      : (message ?? "");

  return (
    // While the list is open, Échap is the picker's (the drawer and the
    // dialog read `data-local-escape` before dismissing on Échap).
    <div
      data-slot="item-picker"
      className={cn("relative min-w-0", className)}
      data-local-escape={open ? "" : undefined}
    >
      <div className="relative">
        <Input
          ref={ownInputRef}
          id={inputId}
          type="text"
          role="combobox"
          autoComplete="off"
          spellCheck={false}
          value={query}
          placeholder={placeholder}
          disabled={disabled}
          aria-label={ariaLabel}
          aria-describedby={ariaDescribedBy}
          aria-required={ariaRequired}
          aria-invalid={ariaInvalid}
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          aria-autocomplete="list"
          aria-activedescendant={activeId}
          aria-busy={pending || undefined}
          className={clearable && value ? "pr-8" : undefined}
          onChange={(event) => {
            setQuery(event.target.value);
            setTyped(true);
            setActive(0);
            if (!open) setOpen(true);
          }}
          onFocus={(event) => {
            // The label is selected whole, so typing replaces it.
            if (!typed && value) event.target.select();
            setOpen(true);
          }}
          onClick={() => {
            if (!open) setOpen(true);
          }}
          onBlur={close}
          onKeyDown={handleKeyDown}
        />
        {clearable && value && !disabled ? (
          <button
            type="button"
            aria-label="Effacer"
            onMouseDown={(event) => event.preventDefault()}
            onClick={clear}
            className="absolute top-1/2 right-1.5 inline-flex size-5 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:bg-[var(--muted)] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <X className="size-3.5" aria-hidden />
          </button>
        ) : null}
      </div>
      <span role="status" aria-live="polite" className="sr-only">
        {status}
      </span>
      {open ? (
        <div
          className="absolute top-full right-0 left-0 z-50 mt-1 overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-md"
          // Pressing an option must not blur the input (which closes the list).
          onMouseDown={(event) => event.preventDefault()}
        >
          <ul
            role="listbox"
            id={listId}
            aria-label={ariaLabel ? `${ariaLabel} : choix` : "Choix"}
            className={cn("max-h-64 overflow-y-auto", count > 0 ? "py-1" : "")}
          >
            {(shown ?? []).map((item, index) => (
              <li
                key={item.id}
                id={`${listId}-${index}`}
                role="option"
                aria-label={itemChoiceLabel(item)}
                aria-selected={index === effectiveActive}
                onMouseMove={() => {
                  if (index !== effectiveActive) setActive(index);
                }}
                onClick={() => select(item)}
                className={cn(
                  "flex cursor-default items-center gap-2 px-2.5 py-1.5 text-sm",
                  index === effectiveActive && "bg-[var(--muted)]",
                )}
              >
                <span aria-hidden className="flex shrink-0 items-center">
                  <TypeIcon type={item.type} size={14} />
                </span>
                <span className="shrink-0 font-mono text-xs text-muted-foreground">{item.key}</span>
                <span className="truncate">{item.title}</span>
              </li>
            ))}
          </ul>
          {message ? (
            <p className="border-t border-border px-2.5 py-1.5 text-xs text-muted-foreground first:border-t-0">
              {message}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
