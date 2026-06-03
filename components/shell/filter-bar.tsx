"use client";

import { useRouter, usePathname } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { X } from "lucide-react";
import { FilterMenu, type Option } from "@/components/shell/filter-menu";
import {
  writeViewState,
  isFiltersActive,
  type ViewState,
  type Filters,
} from "@/lib/items/filter";
import {
  ITEM_TYPE_LABELS,
  ITEM_TYPES,
  PRIORITIES,
  PRIORITY_LABELS,
} from "@/lib/design/constants";

type StatusOpt = { id: string; name: string };
type UserOpt = { id: string; name: string };

export function FilterBar({
  state,
  currentParams,
  statuses,
  users,
  resultCount,
}: {
  state: ViewState;
  currentParams: Record<string, string>;
  statuses: StatusOpt[];
  users: UserOpt[];
  resultCount: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [, startTransition] = useTransition();

  const push = (next: ViewState) => {
    const sp = new URLSearchParams(currentParams);
    writeViewState(sp, next);
    startTransition(() =>
      router.replace(`${pathname}?${sp.toString()}`, { scroll: false }),
    );
  };

  const setFilters = (patch: Partial<Filters>) =>
    push({ ...state, filters: { ...state.filters, ...patch } });

  // Free-text field is controlled locally and debounced; URL-driven changes
  // (reset, browser Back) flow back in by syncing during render when the prop moves.
  const [text, setText] = useState(state.filters.q);
  const [lastQ, setLastQ] = useState(state.filters.q);
  if (state.filters.q !== lastQ) {
    setLastQ(state.filters.q);
    setText(state.filters.q);
  }

  const qTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const scheduleQ = (value: string) => {
    clearTimeout(qTimer.current);
    qTimer.current = setTimeout(() => setFilters({ q: value }), 300);
  };
  useEffect(() => () => clearTimeout(qTimer.current), []);

  const typeOpts: Option[] = ITEM_TYPES.map((t) => ({
    value: t,
    label: ITEM_TYPE_LABELS[t],
  }));
  const statusOpts: Option[] = statuses.map((s) => ({
    value: s.id,
    label: s.name,
  }));
  const prioOpts: Option[] = PRIORITIES.map((p) => ({
    value: String(p),
    label: PRIORITY_LABELS[p],
  }));
  const assigneeOpts: Option[] = [
    { value: "none", label: "Non assigné" },
    ...users.map((u) => ({ value: u.id, label: u.name })),
  ];

  const active = isFiltersActive(state.filters);

  return (
    <div className="flex items-center gap-2 border-b border-border px-4 py-2">
      <input
        type="search"
        value={text}
        placeholder="Filtrer…"
        onChange={(e) => {
          setText(e.target.value);
          scheduleQ(e.target.value);
        }}
        className="h-7 w-44 rounded-[var(--radius-sm)] border border-border bg-[var(--surface)] px-2 text-xs"
      />
      <FilterMenu
        label="Type"
        options={typeOpts}
        selected={state.filters.types}
        onChange={(v) => setFilters({ types: v as typeof state.filters.types })}
      />
      <FilterMenu
        label="Statut"
        options={statusOpts}
        selected={state.filters.statusIds}
        onChange={(v) => setFilters({ statusIds: v })}
      />
      <FilterMenu
        label="Priorité"
        options={prioOpts}
        selected={state.filters.priorities.map(String)}
        onChange={(v) => setFilters({ priorities: v.map(Number) })}
      />
      <FilterMenu
        label="Assigné"
        options={assigneeOpts}
        selected={state.filters.assignees}
        onChange={(v) => setFilters({ assignees: v })}
      />

      {active && (
        <button
          type="button"
          onClick={() => {
            setText("");
            push({
              ...state,
              filters: {
                q: "",
                types: [],
                statusIds: [],
                priorities: [],
                assignees: [],
              },
            });
          }}
          className="inline-flex items-center gap-1 rounded-[var(--radius-sm)] px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <X className="size-3.5" /> Réinitialiser
        </button>
      )}
      <span className="ml-auto text-xs text-muted-foreground">
        {resultCount} résultat{resultCount > 1 ? "s" : ""}
      </span>
    </div>
  );
}
