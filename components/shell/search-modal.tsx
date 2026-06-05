"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { searchAction } from "@/app/actions/search";
import type { SearchResult } from "@/lib/services/search";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { TypeIcon } from "@/components/icons/type-icon";
import { StatusDot } from "@/components/icons/status-dot";
import { ItemKey } from "@/components/jiroo/item-key";
import type { ItemType, StatusId } from "@/lib/design/constants";

// ---------------------------------------------------------------------------
// Highlight helper
//
// Splits `title` at positions that match any term in `query` (case- and
// accent-insensitive), wrapping matched substrings in a <mark> element.
// Operates on plain strings and builds React nodes — no dangerouslySetInnerHTML.
// ---------------------------------------------------------------------------

function normalize(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

function highlightTitle(title: string, query: string): React.ReactNode {
  const terms = query
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .sort((a, b) => b.length - a.length); // longest first for greedy matching

  if (terms.length === 0) return title;

  // Build a regex that matches any term (case- and accent-insensitive via
  // normalized comparison). We iterate character-by-character to avoid regex
  // issues with accented characters in character classes.
  const normTitle = normalize(title);
  const segments: React.ReactNode[] = [];
  let cursor = 0;

  while (cursor < title.length) {
    let matched = false;
    for (const term of terms) {
      const normTerm = normalize(term);
      if (normTerm.length === 0) continue;
      // Check if normTitle at cursor starts with normTerm
      if (normTitle.startsWith(normTerm, cursor)) {
        // Push the highlighted segment (original casing from title)
        segments.push(
          <mark
            key={cursor}
            className="bg-transparent font-semibold text-foreground"
          >
            {title.slice(cursor, cursor + normTerm.length)}
          </mark>,
        );
        cursor += normTerm.length;
        matched = true;
        break;
      }
    }
    if (!matched) {
      // Accumulate plain text — find the next match start
      let nextMatch = title.length;
      for (const term of terms) {
        const normTerm = normalize(term);
        if (normTerm.length === 0) continue;
        const idx = normTitle.indexOf(normTerm, cursor);
        if (idx !== -1 && idx < nextMatch) nextMatch = idx;
      }
      segments.push(title.slice(cursor, nextMatch));
      cursor = nextMatch;
    }
  }

  return <>{segments}</>;
}

// ---------------------------------------------------------------------------
// SearchModal
// ---------------------------------------------------------------------------

export function SearchModal() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPending, startTransition] = useTransition();

  // Stale-response guard: track the latest query string that was dispatched.
  // When a response arrives, we compare its associated query to the ref value;
  // if they don't match the response is for an older request and is discarded.
  const latestQueryRef = useRef<string>("");

  // Refs for scrolling active row into view
  const rowRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // -------------------------------------------------------------------------
  // Global ⌘K / Ctrl+K shortcut
  // -------------------------------------------------------------------------

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // -------------------------------------------------------------------------
  // Debounced search — fires ~150 ms after the query stabilises.
  //
  // When query is blank we skip the action entirely; `displayResults` below
  // is derived from both `query` and `results` so no setState is needed in
  // the blank-query branch (avoids the react-hooks/set-state-in-effect lint
  // error that fires when setState is called synchronously inside an effect).
  // -------------------------------------------------------------------------

  useEffect(() => {
    const trimmed = query.trim();

    // Blank query: update the stale-guard ref and let the timer expire so
    // any in-flight response is discarded. State is not reset here — instead
    // we derive `displayResults` from `query` in the render path below.
    if (!trimmed) {
      latestQueryRef.current = "";
      return;
    }

    // Capture the query string this effect "owns"
    const thisQuery = trimmed;
    latestQueryRef.current = thisQuery;

    const timer = setTimeout(() => {
      // Bail out if a newer keystroke has already taken over
      if (latestQueryRef.current !== thisQuery) return;

      startTransition(async () => {
        const res = await searchAction(thisQuery);

        // Stale-response guard: discard if the user has typed further
        if (latestQueryRef.current !== thisQuery) return;

        if (res.ok) {
          setResults(res.results);
          setActiveIndex(0);
        } else {
          setResults([]);
          setActiveIndex(0);
        }
      });
    }, 150);

    return () => clearTimeout(timer);
  }, [query]);

  // Reset row refs array length whenever results change (no setState — safe)
  useEffect(() => {
    rowRefs.current = rowRefs.current.slice(0, results.length);
  }, [results]);

  // -------------------------------------------------------------------------
  // Derived state
  //
  // When the query is blank we never call setResults([]) inside the effect
  // (that would trip react-hooks/set-state-in-effect), so the previous
  // `results` state may still hold stale rows. `displayResults` is the single
  // source of truth for what is shown AND for keyboard navigation: blank query
  // → empty list, so Enter/Arrow keys can never act on stale rows.
  // -------------------------------------------------------------------------

  const isBlank = query.trim() === "";
  const displayResults = isBlank ? [] : results;

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  function openResult(r: SearchResult) {
    router.push(`/b/${r.backlogKey}?item=${r.key}`);
    handleClose();
  }

  function handleClose() {
    setOpen(false);
    setQuery("");
    setResults([]);
    setActiveIndex(0);
    latestQueryRef.current = "";
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
      {/* Topbar trigger button */}
      <Button
        variant="ghost"
        size="icon"
        aria-label="Rechercher"
        title="Rechercher (⌘K)"
        onClick={() => setOpen(true)}
      >
        <Search className="size-4" />
      </Button>

      <Dialog open={open} onOpenChange={(v) => (v ? setOpen(true) : handleClose())}>
        <DialogContent
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
            {/* Blank state */}
            {isBlank && (
              <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                Tapez pour rechercher (titre, description, clé).
              </p>
            )}

            {/* Pending state */}
            {!isBlank && isPending && displayResults.length === 0 && (
              <p className="px-4 py-4 text-center text-sm text-muted-foreground">
                Recherche…
              </p>
            )}

            {/* No results */}
            {!isBlank && !isPending && displayResults.length === 0 && (
              <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                Aucun résultat.
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
                      <ItemKey value={r.key} />

                      {/* Title with highlight */}
                      <span className="min-w-0 flex-1 truncate text-sm">
                        {highlightTitle(r.title, query)}
                      </span>

                      {/* Backlog badge */}
                      <span className="rounded bg-[var(--muted)] px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                        {r.backlogKey}
                      </span>

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
