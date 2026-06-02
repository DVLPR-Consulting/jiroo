"use client";

import { useDensity } from "@/components/theme/density-provider";
import { cn } from "@/lib/utils";

const OPTIONS = [
  { value: "comfy", label: "Confort" },
  { value: "compact", label: "Compact" },
] as const;

export function DensityToggle() {
  const { density, setDensity } = useDensity();
  return (
    <div className="inline-flex rounded-md border border-[var(--border-strong)] p-0.5">
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => setDensity(o.value)}
          className={cn(
            "rounded-[var(--radius-sm)] px-2.5 py-1 text-xs font-medium transition-colors",
            density === o.value
              ? "bg-[var(--accent-subtle)] text-[var(--accent-subtle-fg)]"
              : "text-[var(--subtle-foreground)] hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
