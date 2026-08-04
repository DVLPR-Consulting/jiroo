"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { FilterMenu, type Option } from "@/components/shell/filter-menu";
import { useViewUrlState } from "@/components/shell/view-url-state";
import {
  parseViewState,
  writeViewState,
  isFiltersActive,
  type ViewState,
  type Filters,
} from "@/lib/items/filter";
import {
  ITEM_KIND_LABELS,
  ITEM_KINDS,
  ITEM_TYPE_LABELS,
  ITEM_TYPES,
  PRIORITIES,
  PRIORITY_LABELS,
} from "@/lib/design/constants";

type StatusOpt = { id: string; name: string };
type UserOpt = { id: string; name: string };
type LabelOpt = { id: string; name: string; color: string };
type HierarchyOpt = { id: string; key: string; title: string; type: string };

function activeLabel(options: Option[], selected: string[]): string | undefined {
  return selected.length > 0
    ? options.find((option) => option.value === selected[0])?.label
    : undefined;
}

export function FilterBar({
  state,
  statuses,
  users,
  labels,
  hierarchy,
  resultCount,
}: {
  state: ViewState;
  statuses: StatusOpt[];
  users: UserOpt[];
  labels: LabelOpt[];
  hierarchy: HierarchyOpt[];
  resultCount: number;
}) {
  const viewUrl = useViewUrlState();

  const push = (update: (current: ViewState) => ViewState) =>
    viewUrl.replace((params) => {
      writeViewState(params, update(parseViewState(params)));
    }, { scroll: false });

  const setFilters = (patch: Partial<Filters>) =>
    push((current) => ({
      ...current,
      filters: { ...current.filters, ...patch },
    }));

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
    const scheduledAtRevision = viewUrl.getExternalRevision();
    qTimer.current = setTimeout(() => {
      if (viewUrl.getExternalRevision() === scheduledAtRevision) {
        setFilters({ q: value });
      }
    }, 300);
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
  const labelOpts: Option[] = labels.map((l) => ({ value: l.id, label: l.name }));
  const kindOpts: Option[] = ITEM_KINDS.map((k) => ({
    value: k,
    label: ITEM_KIND_LABELS[k],
  }));
  const hierarchyOpts: Option[] = hierarchy
    .filter((item) => item.type === "composant" || item.type === "epic")
    .map((item) => ({ value: item.id, label: `${item.key} — ${item.title}` }));

  const active = isFiltersActive(state.filters);

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2">
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
        activeLabel={activeLabel(typeOpts, state.filters.types)}
        onClear={() => setFilters({ types: [] })}
      />
      <FilterMenu
        label="Statut"
        options={statusOpts}
        selected={state.filters.statusIds}
        onChange={(v) => setFilters({ statusIds: v })}
        activeLabel={activeLabel(statusOpts, state.filters.statusIds)}
        onClear={() => setFilters({ statusIds: [] })}
      />
      <FilterMenu
        label="Priorité"
        options={prioOpts}
        selected={state.filters.priorities.map(String)}
        onChange={(v) => setFilters({ priorities: v.map(Number) })}
        activeLabel={activeLabel(prioOpts, state.filters.priorities.map(String))}
        onClear={() => setFilters({ priorities: [] })}
      />
      <FilterMenu
        label="Label"
        options={labelOpts}
        selected={state.filters.labels}
        onChange={(v) => setFilters({ labels: v })}
        activeLabel={activeLabel(labelOpts, state.filters.labels)}
        onClear={() => setFilters({ labels: [] })}
      />
      <FilterMenu
        label="Assigné"
        options={assigneeOpts}
        selected={state.filters.assignees}
        onChange={(v) => setFilters({ assignees: v })}
        activeLabel={activeLabel(assigneeOpts, state.filters.assignees)}
        onClear={() => setFilters({ assignees: [] })}
      />
      <FilterMenu
        label="Nature"
        options={kindOpts}
        selected={state.filters.kind}
        onChange={(v) => setFilters({ kind: v as typeof state.filters.kind })}
        activeLabel={activeLabel(kindOpts, state.filters.kind)}
        onClear={() => setFilters({ kind: [] })}
      />
      <FilterMenu
        label="Sous"
        options={hierarchyOpts}
        selected={state.filters.underIds}
        onChange={(v) => setFilters({ underIds: v })}
        activeLabel={activeLabel(hierarchyOpts, state.filters.underIds)}
        onClear={() => setFilters({ underIds: [] })}
      />

      {active && (
        <button
          type="button"
          onClick={() => {
            clearTimeout(qTimer.current);
            setText("");
            push((current) => ({
              ...current,
              filters: {
                q: "",
                types: [],
                statusIds: [],
                priorities: [],
                assignees: [],
                labels: [],
                kind: [],
                underIds: [],
              },
            }));
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
