"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Search } from "lucide-react";
import { recentItemsAction, searchAction } from "@/app/actions/search";
import type { SearchResult } from "@/lib/services/search";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { TypeIcon } from "@/components/icons/type-icon";
import { StatusDot } from "@/components/icons/status-dot";
import { InitialsAvatar } from "@/components/jiroo/avatar";
import { useBacklogItemNavigation } from "@/components/shell/use-backlog-item-navigation";
import type { ItemType, StatusId } from "@/lib/design/constants";
import {
  readRecentKeys,
  RECENT_ITEMS_STORAGE_KEY,
  recordRecentKey,
} from "@/lib/items/recent";
import { OPEN_SEARCH_EVENT } from "@/lib/shortcuts/navigation";
import {
  shortcutById,
  shortcutKeyParts,
  shortcutText,
} from "@/lib/shortcuts/registry";
import { useShortcutsEnabled } from "@/components/shortcuts/use-shortcuts-enabled";

// ---------------------------------------------------------------------------
// Highlight helper
//
// Splits `value` at positions that match any term in `query` (case- and
// accent-insensitive), wrapping matched substrings in a <mark> element.
// Operates on plain strings and builds React nodes — no dangerouslySetInnerHTML.
// ---------------------------------------------------------------------------

function normalize(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

function highlightMatches(value: string, query: string): React.ReactNode {
  const terms = query
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .sort((a, b) => b.length - a.length); // longest first for greedy matching

  if (terms.length === 0) return value;

  // Build a regex that matches any term (case- and accent-insensitive via
  // normalized comparison). We iterate character-by-character to avoid regex
  // issues with accented characters in character classes.
  const normalizedValue = normalize(value);
  const segments: React.ReactNode[] = [];
  let cursor = 0;

  while (cursor < value.length) {
    let matched = false;
    for (const term of terms) {
      const normTerm = normalize(term);
      if (normTerm.length === 0) continue;
      // Check if the normalized value at cursor starts with normTerm.
      if (normalizedValue.startsWith(normTerm, cursor)) {
        // Push the highlighted segment with its original casing.
        segments.push(
          <mark
            key={cursor}
            className="bg-transparent font-semibold text-foreground"
          >
            {value.slice(cursor, cursor + normTerm.length)}
          </mark>,
        );
        cursor += normTerm.length;
        matched = true;
        break;
      }
    }
    if (!matched) {
      // Accumulate plain text — find the next match start
      let nextMatch = value.length;
      for (const term of terms) {
        const normTerm = normalize(term);
        if (normTerm.length === 0) continue;
        const idx = normalizedValue.indexOf(normTerm, cursor);
        if (idx !== -1 && idx < nextMatch) nextMatch = idx;
      }
      segments.push(value.slice(cursor, nextMatch));
      cursor = nextMatch;
    }
  }

  return <>{segments}</>;
}

function storedRecentKeys(): string[] {
  try {
    return readRecentKeys(localStorage.getItem(RECENT_ITEMS_STORAGE_KEY));
  } catch {
    return [];
  }
}

function recordRecentItem(key: string): void {
  try {
    const keys = recordRecentKey(storedRecentKeys(), key);
    localStorage.setItem(RECENT_ITEMS_STORAGE_KEY, JSON.stringify(keys));
  } catch {
    // Browser storage may be unavailable (privacy mode, policy, or quota).
  }
}

// ---------------------------------------------------------------------------
// SearchModal
// ---------------------------------------------------------------------------

export function SearchModal() {
  // The hint is the registry's « / » while single-key shortcuts are on,
  // its ⌘/Ctrl + K combination otherwise (JIR-70).
  const shortcutsEnabled = useShortcutsEnabled();
  const hint = shortcutById(shortcutsEnabled ? "search" : "searchCombo");
  const openBacklogItem = useBacklogItemNavigation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [response, setResponse] = useState<{
    requestId: number;
    query: string;
    results: SearchResult[];
  }>({ requestId: 0, query: "", results: [] });
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPending, startTransition] = useTransition();

  // Stale-response guard shared by recent and text-search requests.
  const latestRequestRef = useRef(0);

  // Refs for scrolling active row into view
  const rowRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // -------------------------------------------------------------------------
  // Global ⌘K / Ctrl+K shortcut
  // -------------------------------------------------------------------------

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // A focused widget that owns the shortcut (the Markdown editor's
      // "Lien") has already handled it.
      if (e.defaultPrevented) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((current) => !current);
        setQuery("");
        setResponse({ requestId: 0, query: "", results: [] });
        setActiveIndex(0);
        latestRequestRef.current += 1;
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // « / » (keyboard shortcut layer) opens the palette.
  useEffect(() => {
    function handleOpenSearch() {
      setOpen(true);
    }
    window.addEventListener(OPEN_SEARCH_EVENT, handleOpenSearch);
    return () => window.removeEventListener(OPEN_SEARCH_EVENT, handleOpenSearch);
  }, []);

  // -------------------------------------------------------------------------
  // Blank queries resolve recent keys immediately. Text search remains
  // debounced by ~150 ms. A monotonic request id discards responses made stale
  // by typing, clearing, closing, or reopening the dialog.
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (!open) return;

    const trimmed = query.trim();
    const requestId = latestRequestRef.current + 1;
    latestRequestRef.current = requestId;

    if (!trimmed) {
      startTransition(async () => {
        const res = await recentItemsAction(storedRecentKeys());
        if (latestRequestRef.current !== requestId) return;

        setResponse({
          requestId,
          query: "",
          results: res.ok ? res.results : [],
        });
        setActiveIndex(0);
      });
      return;
    }

    const thisQuery = trimmed;

    const timer = setTimeout(() => {
      if (latestRequestRef.current !== requestId) return;

      startTransition(async () => {
        const res = await searchAction(thisQuery);
        if (latestRequestRef.current !== requestId) return;

        setResponse({
          requestId,
          query: thisQuery,
          results: res.ok ? res.results : [],
        });
        setActiveIndex(0);
      });
    }, 150);

    return () => clearTimeout(timer);
  }, [open, query]);

  // Reset row refs array length whenever results change (no setState — safe)
  useEffect(() => {
    rowRefs.current = rowRefs.current.slice(0, response.results.length);
  }, [response.results]);

  // -------------------------------------------------------------------------
  // Derived state
  //
  // Results carry the request generation and query that produced them. Both
  // must match before rows can render or participate in keyboard navigation.
  // -------------------------------------------------------------------------

  const currentQuery = query.trim();
  const isBlank = currentQuery === "";
  const displayResults =
    response.requestId === latestRequestRef.current &&
    response.query === currentQuery
      ? response.results
      : [];

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  function openResult(r: SearchResult) {
    recordRecentItem(r.key);
    openBacklogItem(r.backlogKey, r.key);
    handleClose();
  }

  function handleClose() {
    setOpen(false);
    setQuery("");
    setResponse({ requestId: 0, query: "", results: [] });
    setActiveIndex(0);
    latestRequestRef.current += 1;
  }

  function handleInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    // Operate on `displayResults` (not `results`) so a cleared query can never
    // navigate to or move over stale rows.
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (displayResults.length === 0) return;
      const next = Math.min(activeIndex + 1, displayResults.length - 1);
      setActiveIndex(next);
      rowRefs.current[next]?.scrollIntoView({ block: "nearest" });
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (displayResults.length === 0) return;
      const prev = Math.max(activeIndex - 1, 0);
      setActiveIndex(prev);
      rowRefs.current[prev]?.scrollIntoView({ block: "nearest" });
    } else if (e.key === "Enter") {
      e.preventDefault();
      const r = displayResults[activeIndex];
      if (r) openResult(r);
    }
    // Escape is handled by Dialog (Radix closes on Esc natively)
  }

  return (
    <>
      {/* Topbar search field (JIR-74): always visible, opens the palette. */}
      <button
        type="button"
        aria-label="Rechercher un item"
        aria-keyshortcuts={shortcutsEnabled ? "/ Meta+K Control+K" : "Meta+K Control+K"}
        title={`Rechercher un item (${shortcutText(hint)})`}
        onClick={() => setOpen(true)}
        data-slot="topbar-search"
        className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-[var(--radius)] border border-[var(--border-strong)] bg-[var(--surface-2)] px-3 text-left text-sm text-muted-foreground transition-colors hover:bg-[var(--muted)] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
      >
        <Search className="size-4 shrink-0" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate">Rechercher un item…</span>
        <span className="hidden shrink-0 items-center gap-1 sm:inline-flex" aria-hidden="true">
          {shortcutKeyParts(hint).keys.map((key) => (
            <kbd
              key={key}
              className="rounded-[var(--radius-sm)] border border-[var(--border-strong)] bg-[var(--surface)] px-1.5 font-mono text-[11px] text-muted-foreground"
            >
              {key}
            </kbd>
          ))}
        </span>
      </button>

      <Dialog open={open} onOpenChange={(v) => (v ? setOpen(true) : handleClose())}>
        <DialogContent
          aria-describedby={undefined}
          showCloseButton={false}
          className="top-[20%] -translate-y-0 p-0 sm:max-w-lg gap-0 overflow-hidden"
        >
          {/* Visually-hidden title for screen readers (Radix requires DialogTitle) */}
          <DialogTitle className="sr-only">Rechercher un item</DialogTitle>

          {/* Search input */}
          <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
            <Search className="size-4 shrink-0 text-muted-foreground" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleInputKeyDown}
              placeholder="Rechercher un item… (titre, description, clé)"
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              aria-label="Rechercher"
              aria-autocomplete="list"
              aria-controls="search-results"
              aria-activedescendant={
                displayResults.length > 0
                  ? `search-result-${activeIndex}`
                  : undefined
              }
            />
          </div>

          {/* Results area */}
          <div
            id="search-results"
            role="listbox"
            aria-label="Résultats de recherche"
            className="max-h-[360px] overflow-y-auto"
          >
            {isBlank && (
              <h2 className="px-3 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Récents
              </h2>
            )}

            {/* Pending state */}
            {isPending && displayResults.length === 0 && (
              <p className="px-4 py-4 text-center text-sm text-muted-foreground">
                {isBlank ? "Chargement…" : "Recherche…"}
              </p>
            )}

            {/* No results */}
            {!isPending && displayResults.length === 0 && (
              <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                {isBlank ? "Aucun item récent." : "Aucun résultat."}
              </p>
            )}

            {/* Result rows */}
            {displayResults.length > 0 && (
              <ul>
                {displayResults.map((r, i) => (
                  <li key={r.id} role="none">
                    <button
                      id={`search-result-${i}`}
                      role="option"
                      aria-selected={i === activeIndex}
                      ref={(el) => {
                        rowRefs.current[i] = el;
                      }}
                      onClick={() => openResult(r)}
                      onMouseEnter={() => setActiveIndex(i)}
                      className={`flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors ${
                        i === activeIndex
                          ? "bg-[var(--accent-subtle)]"
                          : "hover:bg-muted/50"
                      }`}
                    >
                      {/* Type icon */}
                      <TypeIcon type={r.type as ItemType} />

                      {/* Item key */}
                      <span className="item-key">
                        {highlightMatches(r.key, query)}
                      </span>

                      {/* Title with highlight */}
                      <span className="min-w-0 flex-1 truncate text-sm">
                        {highlightMatches(r.title, query)}
                      </span>

                      {/* Backlog badge */}
                      <span className="rounded bg-[var(--muted)] px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                        {r.backlogKey}
                      </span>

                      {r.assigneeName && (
                        <InitialsAvatar name={r.assigneeName} hue={3} size={22} />
                      )}

                      {/* Status dot + name */}
                      <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs text-muted-foreground">
                        <StatusDot status={r.statusId as StatusId} />
                        {r.statusName}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
