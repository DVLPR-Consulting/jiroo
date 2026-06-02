import { LABEL_COLOR_VAR, type LabelHue } from "@/lib/design/constants";

export function LabelPill({ name, hue }: { name: string; hue: LabelHue }) {
  return (
    <span
      className="inline-flex h-[19px] items-center gap-1.5 rounded-full border border-border bg-[var(--surface-2)] px-1.5 text-[11px] font-medium text-[var(--subtle-foreground)]"
    >
      <span className="size-[7px] flex-none rounded-full" style={{ background: `var(${LABEL_COLOR_VAR[hue]})` }} />
      {name}
    </span>
  );
}
