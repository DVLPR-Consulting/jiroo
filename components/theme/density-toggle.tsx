"use client";

import { useId } from "react";
import { useDensity } from "@/components/theme/density-provider";
import { cn } from "@/lib/utils";

const OPTIONS = [
  { value: "comfy", label: "Confort" },
  { value: "compact", label: "Compact" },
] as const;

export function DensityToggle() {
  const { density, setDensity } = useDensity();
  const name = useId();
  return (
    <fieldset
      aria-label="Densité d’affichage"
      className="inline-flex rounded-md border border-[var(--border-strong)] p-0.5"
    >
      {OPTIONS.map((o) => (
        <label key={o.value} className="cursor-pointer">
          <input
            type="radio"
            name={name}
            value={o.value}
            checked={density === o.value}
            onChange={() => setDensity(o.value)}
            className="sr-only"
          />
          <span
            className={cn(
              "block rounded-[var(--radius-sm)] px-2.5 py-1 text-xs font-medium transition-colors",
              density === o.value
                ? "bg-[var(--accent-subtle)] text-[var(--accent-subtle-fg)]"
                : "text-[var(--subtle-foreground)] hover:text-foreground",
            )}
          >
            {o.label}
          </span>
        </label>
      ))}
    </fieldset>
  );
}
