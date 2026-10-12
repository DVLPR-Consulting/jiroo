"use client";

import { useState } from "react";
import { ChevronDown, X } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type FixVersionOption = {
  id: string;
  name: string;
  released: boolean;
  archived: boolean;
};

export type FixVersionPickerProps = {
  value: string[];
  options: FixVersionOption[];
  disabled?: boolean;
  onChange: (value: string[]) => void;
  /** Full-width trigger styled like the form fields (creation dialog). */
  field?: boolean;
};

function optionLabel(option: FixVersionOption): string {
  if (option.archived) return `${option.name} — Archivée`;
  if (option.released) return `${option.name} — Publiée`;
  return option.name;
}

export function FixVersionChips({
  versions,
  max = 2,
}: {
  versions: FixVersionOption[];
  max?: number;
}) {
  if (versions.length === 0) {
    return <span className="text-muted-foreground">—</span>;
  }
  const visible = versions.slice(0, max);
  const remaining = versions.length - visible.length;
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-1">
      {visible.map((version) => (
        <span
          key={version.id}
          className="max-w-32 truncate rounded bg-[var(--muted)] px-1.5 py-0.5 text-xs"
          title={optionLabel(version)}
        >
          {version.name}
        </span>
      ))}
      {remaining > 0 ? (
        <span className="text-xs text-muted-foreground">+{remaining}</span>
      ) : null}
    </span>
  );
}

export function FixVersionPicker({
  value,
  options,
  disabled = false,
  onChange,
  field = false,
}: FixVersionPickerProps) {
  const [expanded, setExpanded] = useState(false);
  const optionById = new Map(options.map((option) => [option.id, option]));
  const selected = value
    .map((id) => optionById.get(id))
    .filter((option): option is FixVersionOption => option !== undefined);
  const selectable = options.filter((option) => !option.archived);
  const visibleSelected = expanded ? selected : selected.slice(0, 2);
  const hiddenCount = selected.length - visibleSelected.length;

  function toggle(id: string) {
    onChange(value.includes(id) ? value.filter((current) => current !== id) : [...value, id]);
  }

  return (
    <div className={field ? "flex min-w-0 flex-col gap-1.5" : "flex min-w-0 flex-wrap items-center gap-1.5"}>
      {selected.length > 0 ? (
        <span
          role="list"
          aria-label="Versions sélectionnées"
          className="flex min-w-0 flex-wrap items-center gap-1"
        >
          {visibleSelected.map((option) => (
            <span
              role="listitem"
              key={option.id}
              className="inline-flex max-w-44 items-center gap-0.5 rounded bg-[var(--muted)] pl-1.5 text-xs"
            >
              <span className="truncate" title={optionLabel(option)}>
                {optionLabel(option)}
              </span>
              <button
                type="button"
                disabled={disabled}
                aria-label={`Retirer ${option.name}`}
                onClick={() => onChange(value.filter((id) => id !== option.id))}
                className="rounded p-1 text-muted-foreground hover:text-foreground disabled:opacity-50"
              >
                <X aria-hidden className="size-3" />
              </button>
            </span>
          ))}
          {hiddenCount > 0 ? (
            <span role="listitem">
              <button
                type="button"
                aria-label={hiddenCount === 1
                  ? "Afficher 1 version supplémentaire"
                  : `Afficher ${hiddenCount} versions supplémentaires`}
                onClick={() => setExpanded(true)}
                className="rounded px-1 text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
              >
                +{hiddenCount}
              </button>
            </span>
          ) : null}
        </span>
      ) : null}

      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            aria-label="Versions"
            className={
              field
                ? "flex h-8 w-full items-center justify-between gap-1 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 dark:bg-input/30"
                : "inline-flex min-h-8 items-center gap-1 rounded border border-border bg-[var(--surface)] px-2 py-1 text-sm outline-none hover:border-[var(--border-strong)] focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:opacity-50"
            }
          >
            {selected.length === 0 ? "Aucune version" : "Versions"}
            <ChevronDown
              aria-hidden
              className={field ? "size-3.5 text-muted-foreground" : "size-3.5"}
            />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          {selectable.length > 0 ? (
            selectable.map((option) => (
              <DropdownMenuCheckboxItem
                key={option.id}
                checked={value.includes(option.id)}
                disabled={disabled}
                onSelect={(event) => event.preventDefault()}
                onCheckedChange={() => toggle(option.id)}
              >
                {optionLabel(option)}
              </DropdownMenuCheckboxItem>
            ))
          ) : (
            <p className="px-2 py-2 text-xs text-muted-foreground">
              Aucune version disponible
            </p>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
