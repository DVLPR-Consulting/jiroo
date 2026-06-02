import { ThemeToggle } from "@/components/theme/theme-toggle";
import { DensityToggle } from "@/components/theme/density-toggle";
import { StatusDot } from "@/components/icons/status-dot";
import { PrioIcon } from "@/components/icons/prio-icon";
import { TypeIcon } from "@/components/icons/type-icon";
import { ItemKey } from "@/components/jiroo/item-key";
import { LabelPill } from "@/components/jiroo/label-pill";
import { InitialsAvatar } from "@/components/jiroo/avatar";
import { Button } from "@/components/ui/button";
import { STATUS_IDS, STATUS_LABELS, PRIORITIES, PRIORITY_LABELS, ITEM_TYPES, ITEM_TYPE_LABELS } from "@/lib/design/constants";

export default function DesignPage() {
  return (
    <main className="mx-auto max-w-3xl space-y-10 p-10">
      <header className="flex items-center justify-between">
        <h1 className="t-h1">
          Jir<span className="text-[var(--primary)]">oo</span> — Design system
        </h1>
        <div className="flex items-center gap-3">
          <DensityToggle />
          <ThemeToggle />
        </div>
      </header>

      <section className="space-y-3">
        <h2 className="t-meta">Boutons</h2>
        <div className="flex flex-wrap items-center gap-3">
          <Button>Primaire</Button>
          <Button variant="secondary">Secondaire</Button>
          <Button variant="ghost">Ghost</Button>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="t-meta">Statuts</h2>
        <div className="flex flex-wrap items-center gap-4">
          {STATUS_IDS.map((s) => (
            <span key={s} className="flex items-center gap-2 t-sm">
              <StatusDot status={s} /> {STATUS_LABELS[s]}
            </span>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="t-meta">Priorités</h2>
        <div className="flex flex-wrap items-center gap-4">
          {PRIORITIES.map((p) => (
            <span key={p} className="flex items-center gap-2 t-sm">
              <PrioIcon priority={p} /> {PRIORITY_LABELS[p]}
            </span>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="t-meta">Types</h2>
        <div className="flex flex-wrap items-center gap-4">
          {ITEM_TYPES.map((t) => (
            <span key={t} className="flex items-center gap-2 t-sm">
              <TypeIcon type={t} /> {ITEM_TYPE_LABELS[t]}
            </span>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="t-meta">Primitives</h2>
        <div className="flex flex-wrap items-center gap-4">
          <ItemKey value="CASS-42" />
          <LabelPill name="sécurité" hue={1} />
          <LabelPill name="perf" hue={3} />
          <InitialsAvatar name="Marie Dupont" hue={2} />
          <InitialsAvatar name="Jean Martin" hue={5} />
        </div>
      </section>
    </main>
  );
}
