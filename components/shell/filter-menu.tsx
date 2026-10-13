"use client";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChevronDown, X } from "lucide-react";

/** `group` titles a run of consecutive options (the Sprint facet's states). */
export type Option = { value: string; label: string; group?: string };

export function FilterMenu({
  chipKey,
  label,
  options,
  selected,
  onToggle,
  activeLabel,
  onClear,
}: {
  /** Marks a « + Filtre » facet's trigger so focus can land on it (JIR-79). */
  chipKey?: string;
  label: string;
  options: Option[];
  selected: string[];
  /** Adds or removes one value; the caller applies it to the latest URL. */
  onToggle: (value: string) => void;
  activeLabel?: string;
  onClear?: () => void;
}) {
  const count = selected.length;
  const active = count > 0;
  return (
    <div className="inline-flex">
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            data-active={active}
            data-filter-chip={chipKey}
            className={
              active
                ? "inline-flex h-8 items-center gap-1.5 rounded-l-[var(--radius-sm)] border border-[var(--accent-subtle-fg)] bg-[var(--accent-subtle)] px-2.5 text-[13px] font-medium text-[var(--accent-subtle-fg)] hover:bg-[var(--accent-subtle)]"
                : "inline-flex h-8 items-center gap-1.5 rounded-[var(--radius-sm)] border border-border bg-[var(--surface)] px-2.5 text-[13px] hover:bg-[var(--muted)]"
            }
          >
            {active ? (
              <>
                <span className="font-normal">{label} :</span>{" "}
                <span className="max-w-[12rem] truncate">{activeLabel ?? count}</span>
              </>
            ) : (
              <span>{label}</span>
            )}
            <ChevronDown className="size-3.5" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-56 p-1">
          <FilterOptions options={options} selected={selected} onToggle={onToggle} />
        </PopoverContent>
      </Popover>
      {active && onClear && (
        <button
          type="button"
          aria-label={`Effacer le filtre ${label}`}
          onClick={(event) => {
            event.stopPropagation();
            onClear();
          }}
          className="inline-flex h-8 items-center rounded-r-[var(--radius-sm)] border border-l-0 border-[var(--accent-subtle-fg)] bg-[var(--accent-subtle)] px-1.5 text-[var(--accent-subtle-fg)] hover:bg-[var(--accent-subtle)]"
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}

/** The checkbox list of one facet, shared by the bar and « + Filtre ». */
export function FilterOptions({
  options,
  selected,
  onToggle,
}: {
  options: Option[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  if (options.length === 0) {
    return <p className="px-2 py-1.5 text-sm text-muted-foreground">Aucune valeur.</p>;
  }
  const renderOption = (o: Option) => (
    <label
      key={o.value}
      className="flex cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 text-sm hover:bg-[var(--muted)]"
    >
      <input
        type="checkbox"
        checked={selected.includes(o.value)}
        onChange={() => onToggle(o.value)}
        className="size-3.5"
      />
      {o.label}
    </label>
  );
  // Ungrouped options stay flat; a titled run becomes a labelled group.
  const runs: Array<{ group?: string; options: Option[] }> = [];
  for (const option of options) {
    const last = runs.at(-1);
    if (last && last.group === option.group) last.options.push(option);
    else runs.push({ group: option.group, options: [option] });
  }
  return (
    <div className="max-h-72 overflow-y-auto">
      {runs.map((run, index) =>
        run.group === undefined ? (
          run.options.map(renderOption)
        ) : (
          <div key={`${run.group}-${index}`} role="group" aria-label={run.group}>
            <p
              aria-hidden="true"
              className="px-2 pb-0.5 pt-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
            >
              {run.group}
            </p>
            {run.options.map(renderOption)}
          </div>
        ),
      )}
    </div>
  );
}
