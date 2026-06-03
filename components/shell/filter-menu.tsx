"use client";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChevronDown } from "lucide-react";

export type Option = { value: string; label: string };

export function FilterMenu({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: Option[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const toggle = (value: string) => {
    onChange(
      selected.includes(value)
        ? selected.filter((v) => v !== value)
        : [...selected, value],
    );
  };
  const count = selected.length;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] border border-border px-2.5 py-1 text-xs font-medium hover:bg-[var(--muted)]"
        >
          {label}
          {count > 0 && (
            <span className="rounded-full bg-[var(--accent-subtle)] px-1.5 text-[var(--accent-subtle-fg)]">
              {count}
            </span>
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
  );
}
