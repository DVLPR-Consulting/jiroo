import { cn } from "@/lib/utils";

/**
 * Presentational chip displaying a label's name in its hue.
 * `color` is a CSS var name like "--label-3".
 */
export function LabelPill({
  name,
  color,
  className,
}: {
  name: string;
  color: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium",
        className
      )}
      style={{
        color: `var(${color})`,
        background: `color-mix(in oklch, var(${color}) 14%, transparent)`,
      }}
    >
      {name}
    </span>
  );
}
