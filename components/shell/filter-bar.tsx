"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Plus, UserRound, X } from "lucide-react";
import { FilterMenu, FilterOptions, type Option } from "@/components/shell/filter-menu";
import { InitialsAvatar } from "@/components/jiroo/avatar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  chipValue,
  splitSecondaryFilters,
  toggleValue,
  type SecondaryFilter,
  type SecondaryFilterKey,
} from "@/lib/items/filter-chips";
import { cn } from "@/lib/utils";
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
  LABEL_HUES,
  PRIORITY_LABELS,
  type LabelHue,
} from "@/lib/design/constants";

type StatusOpt = { id: string; name: string };
type UserOpt = { id: string; name: string };
type LabelOpt = { id: string; name: string; color: string };
type ReleaseOpt = {
  id: string;
  name: string;
  released: boolean;
  archived: boolean;
};
type HierarchyOpt = { id: string; key: string; title: string; type: string };

function hueFor(value: string): LabelHue {
  let hash = 0;
  for (let index = 0; index < value.length; index++) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0;
  }
  return LABEL_HUES[Math.abs(hash) % LABEL_HUES.length]!;
}

export function FilterBar({
  state,
  statuses,
  users,
  labels,
  releases,
  hierarchy,
  resultCount,
  actions,
}: {
  state: ViewState;
  statuses: StatusOpt[];
  users: UserOpt[];
  labels: LabelOpt[];
  releases: ReleaseOpt[];
  hierarchy: HierarchyOpt[];
  resultCount: number;
  /** Saved-view actions, shown before the result count. */
  actions?: React.ReactNode;
}) {
  const viewUrl = useViewUrlState();
  const searchId = useId();

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
  const releaseOpts: Option[] = releases.map((release) => ({
    value: release.id,
    label: release.name,
  }));
  const kindOpts: Option[] = ITEM_KINDS.map((k) => ({
    value: k,
    label: ITEM_KIND_LABELS[k],
  }));
  const hierarchyOpts: Option[] = hierarchy
    .filter((item) => item.type === "composant" || item.type === "epic")
    .map((item) => ({ value: item.id, label: `${item.key} — ${item.title}` }));

  const active = isFiltersActive(state.filters);
  const optionsByKey: Record<SecondaryFilterKey, Option[]> = {
    priorities: prioOpts,
    labels: labelOpts,
    releaseIds: releaseOpts,
    kind: kindOpts,
  };
  const selectedByKey: Record<SecondaryFilterKey, string[]> = {
    priorities: state.filters.priorities.map(String),
    labels: state.filters.labels,
    releaseIds: state.filters.releaseIds,
    kind: state.filters.kind,
  };
  const setSecondary = (key: SecondaryFilterKey, values: string[]) => {
    if (key === "priorities") setFilters({ priorities: values.map(Number) });
    else if (key === "kind") setFilters({ kind: values as typeof state.filters.kind });
    else setFilters({ [key]: values });
  };
  const secondary = splitSecondaryFilters(state.filters);

  return (
    <div
      className="flex flex-wrap items-center gap-2 border-b border-border px-4 pb-3 sm:px-6"
      data-slot="filter-bar"
    >
      <label className="sr-only" htmlFor={searchId}>
        Filtrer les items
      </label>
      <input
        id={searchId}
        type="search"
        value={text}
        placeholder="Filtrer…"
        onChange={(e) => {
          setText(e.target.value);
          scheduleQ(e.target.value);
        }}
        className="h-8 w-44 min-w-0 rounded-[var(--radius-sm)] border border-[var(--border-strong)] bg-[var(--surface)] px-2.5 text-[13px] placeholder:text-muted-foreground sm:w-52"
      />
      <div role="group" aria-label="Filtrer par assigné" className="flex flex-wrap items-center">
        {assigneeOpts.map((option, index) => {
          const pressed = state.filters.assignees.includes(option.value);
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={pressed}
              aria-label={option.label}
              title={option.label}
              onClick={() =>
                setFilters({ assignees: toggleValue(state.filters.assignees, option.value) })
              }
              className={cn(
                "relative inline-flex size-8 items-center justify-center rounded-full outline-none transition-transform hover:z-10 hover:-translate-y-0.5 focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
                index > 0 && "-ml-1.5",
                pressed && "z-10 ring-2 ring-[var(--primary)] ring-offset-1 ring-offset-[var(--background)]",
              )}
            >
              {option.value === "none" ? (
                <span
                  aria-hidden="true"
                  className="inline-flex size-7 items-center justify-center rounded-full border-[1.5px] border-[var(--surface)] bg-[var(--muted)] text-muted-foreground"
                >
                  <UserRound className="size-3.5" />
                </span>
              ) : (
                <span aria-hidden="true" className="inline-flex">
                  <InitialsAvatar name={option.label} hue={hueFor(option.value)} size={28} />
                </span>
              )}
            </button>
          );
        })}
      </div>
      <span aria-hidden="true" className="hidden h-5 w-px bg-border sm:block" />
      <FilterMenu
        label="Type"
        options={typeOpts}
        selected={state.filters.types}
        onChange={(v) => setFilters({ types: v as typeof state.filters.types })}
        activeLabel={chipValue(typeOpts, state.filters.types)}
        onClear={() => setFilters({ types: [] })}
      />
      <FilterMenu
        label="Statut"
        options={statusOpts}
        selected={state.filters.statusIds}
        onChange={(v) => setFilters({ statusIds: v })}
        activeLabel={chipValue(statusOpts, state.filters.statusIds)}
        onClear={() => setFilters({ statusIds: [] })}
      />
      <FilterMenu
        label="Parent"
        options={hierarchyOpts}
        selected={state.filters.underIds}
        onChange={(v) => setFilters({ underIds: v })}
        activeLabel={chipValue(hierarchyOpts, state.filters.underIds)}
        onClear={() => setFilters({ underIds: [] })}
      />
      {secondary.active.map((filter) => (
        <FilterMenu
          key={filter.key}
          label={filter.label}
          options={optionsByKey[filter.key]}
          selected={selectedByKey[filter.key]}
          onChange={(v) => setSecondary(filter.key, v)}
          activeLabel={chipValue(optionsByKey[filter.key], selectedByKey[filter.key])}
          onClear={() => setSecondary(filter.key, [])}
        />
      ))}
      {secondary.available.length > 0 && (
        <AddFilterMenu
          filters={secondary.available}
          optionsByKey={optionsByKey}
          selectedByKey={selectedByKey}
          onChange={setSecondary}
        />
      )}

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
                releaseIds: [],
                kind: [],
                underIds: [],
              },
            }));
          }}
          className="inline-flex h-8 items-center gap-1 rounded-[var(--radius-sm)] px-2 text-[13px] text-muted-foreground hover:text-foreground"
        >
          <X className="size-3.5" aria-hidden="true" /> Réinitialiser
        </button>
      )}
      <div className="ml-auto flex items-center gap-3">
        {actions}
        <span className="text-[13px] text-muted-foreground" role="status">
          {resultCount} résultat{resultCount > 1 ? "s" : ""}
        </span>
      </div>
    </div>
  );
}

/**
 * « + Filtre » (JIR-74): Priorité, Label, Version and Nature, one step to
 * pick the facet, one to pick its values. Once a value is picked the facet
 * shows on the bar as a chip.
 */
function AddFilterMenu({
  filters,
  optionsByKey,
  selectedByKey,
  onChange,
}: {
  filters: SecondaryFilter[];
  optionsByKey: Record<SecondaryFilterKey, Option[]>;
  selectedByKey: Record<SecondaryFilterKey, string[]>;
  onChange: (key: SecondaryFilterKey, values: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState<SecondaryFilter | null>(null);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setCurrent(null);
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex h-8 items-center gap-1.5 rounded-[var(--radius-sm)] border border-dashed border-[var(--border-strong)] px-2.5 text-[13px] text-muted-foreground hover:bg-[var(--muted)] hover:text-foreground"
        >
          <Plus className="size-3.5" aria-hidden="true" />
          Filtre
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 p-1">
        {current ? (
          <div role="group" aria-label={`Filtre ${current.label}`}>
            <button
              type="button"
              onClick={() => setCurrent(null)}
              className="flex w-full items-center gap-1 rounded-[var(--radius-sm)] px-2 py-1.5 text-left text-xs font-medium text-muted-foreground hover:bg-[var(--muted)]"
            >
              <ChevronLeft className="size-3.5" aria-hidden="true" />
              {current.label}
            </button>
            <FilterOptions
              options={optionsByKey[current.key]}
              selected={selectedByKey[current.key]}
              onToggle={(value) =>
                onChange(current.key, toggleValue(selectedByKey[current.key], value))
              }
            />
          </div>
        ) : (
          <ul aria-label="Ajouter un filtre">
            {filters.map((filter) => (
              <li key={filter.key}>
                <button
                  type="button"
                  onClick={() => setCurrent(filter)}
                  className="flex w-full items-center justify-between rounded-[var(--radius-sm)] px-2 py-1.5 text-left text-sm hover:bg-[var(--muted)]"
                >
                  {filter.label}
                  <ChevronRight className="size-3.5 text-muted-foreground" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
