import Link from "next/link";
import { DensityToggle } from "@/components/theme/density-toggle";
import { cn } from "@/lib/utils";

const TABS = [
  ["board", "Board"],
  ["list", "Liste"],
  ["tree", "Arbre"],
] as const;

export function ViewBar({
  view,
  backlogKey,
  itemKey,
  newItemSlot,
}: {
  view: string;
  backlogKey: string;
  itemKey?: string;
  newItemSlot?: React.ReactNode;
}) {
  return (
    <div className="flex h-[46px] items-center gap-3 border-b border-border px-4">
      <div className="inline-flex rounded-md border border-border p-0.5">
        {TABS.map(([v, label]) => {
          const href = `/b/${backlogKey}?${new URLSearchParams({
            view: v,
            ...(itemKey ? { item: itemKey } : {}),
          }).toString()}`;
          const active = view === v;
          return (
            <Link
              key={v}
              href={href}
              className={cn(
                "rounded-[var(--radius-sm)] px-2.5 py-1 text-xs font-medium transition-colors",
                active
                  ? "bg-[var(--accent-subtle)] text-[var(--accent-subtle-fg)]"
                  : "text-[var(--subtle-foreground)] hover:text-foreground",
              )}
            >
              {label}
            </Link>
          );
        })}
      </div>
      <div className="ml-auto flex items-center gap-3">
        <DensityToggle />
        {newItemSlot}
      </div>
    </div>
  );
}
