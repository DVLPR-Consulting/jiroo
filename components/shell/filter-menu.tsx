"use client";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChevronDown, X } from "lucide-react";

export type Option = { value: string; label: string };

export function FilterMenu({
  label,
  options,
  selected,
  onChange,
  activeLabel,
  onClear,
}: {
  label: string;
  options: Option[];
  selected: string[];
  onChange: (next: string[]) => void;
  activeLabel?: string;
  onClear?: () => void;
}) {
  const toggle = (value: string) => {
    onChange(
      selected.includes(value)
        ? selected.filter((v) => v !== value)
        : [...selected, value],
    );
  };
  const count = selected.length;
  const active = count > 0;
  return (
    <div className="inline-flex">
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            data-active={active}
            className={
              active
                ? "inline-flex items-center gap-1.5 rounded-l-[var(--radius-sm)] border border-[var(--accent-subtle-fg)] bg-[var(--accent-subtle)] px-2.5 py-1 text-xs font-medium hover:bg-[var(--accent-subtle)]"
                : "inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] border border-dashed border-border px-2.5 py-1 text-xs font-medium hover:bg-[var(--muted)]"
            }
          >
            {active ? (
              <>
                <span>{label}</span>
                {activeLabel && <span className="text-[var(--accent-subtle-fg)]">{activeLabel}</span>}
                <span className="rounded-full bg-[var(--surface)] px-1.5 text-[var(--accent-subtle-fg)]">
                  {count}
                </span>
              </>
            ) : (
              <span>+ {label}</span>
            )}
            <ChevronDown className="size-3.5" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-56 p-1">
          {options.map((o) => (
            <label
              key={o.value}
              className="flex cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 text-sm hover:bg-[var(--muted)]"
            >
              <input
                type="checkbox"
                checked={selected.includes(o.value)}
                onChange={() => toggle(o.value)}
                className="size-3.5"
              />
              {o.label}
            </label>
          ))}
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
          className="inline-flex items-center rounded-r-[var(--radius-sm)] border border-l-0 border-[var(--accent-subtle-fg)] bg-[var(--accent-subtle)] px-1.5 text-[var(--accent-subtle-fg)] hover:bg-[var(--accent-subtle)]"
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}
