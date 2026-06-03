import { DensityToggle } from "@/components/theme/density-toggle";

export function ViewBar({ newItemSlot }: { newItemSlot?: React.ReactNode }) {
  return (
    <div className="flex h-[46px] items-center gap-3 border-b border-border px-4">
      <div className="inline-flex rounded-md border border-border p-0.5">
        <button
          type="button"
          className="rounded-[var(--radius-sm)] bg-[var(--accent-subtle)] px-2.5 py-1 text-xs font-medium text-[var(--accent-subtle-fg)]"
        >
          Board
        </button>
        <button
          type="button"
          disabled
          title="bientôt"
          className="rounded-[var(--radius-sm)] px-2.5 py-1 text-xs font-medium text-muted-foreground"
        >
          Liste
        </button>
        <button
          type="button"
          disabled
          title="bientôt"
          className="rounded-[var(--radius-sm)] px-2.5 py-1 text-xs font-medium text-muted-foreground"
        >
          Arbre
        </button>
      </div>
      <div className="ml-auto flex items-center gap-3">
        <DensityToggle />
        {newItemSlot}
      </div>
    </div>
  );
}
