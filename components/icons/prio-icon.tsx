import type React from "react";
import { PRIORITY_LABELS, type Priority } from "@/lib/design/constants";

// Handoff geometry: viewBox 0 0 14 14, default size 14.
// Bar levels: low=1 bar lit, medium=2, high=3. Urgent = filled rect + dot.
// Faint fill for unlit bars uses color-mix (supported in all modern browsers).

const FAINT = "color-mix(in oklab, var(--prio-none) 45%, transparent)";

export function PrioIcon({
  priority,
  size = 14,
  className,
}: {
  priority: Priority;
  size?: number;
  className?: string;
}) {
  const label = PRIORITY_LABELS[priority];
  const svgProps = {
    width: size,
    height: size,
    viewBox: "0 0 14 14",
    fill: "none" as const,
    style: { flex: "none", display: "block" } as React.CSSProperties,
    role: "img" as const,
    "aria-label": label,
    className,
  };

  // None: three dots
  if (priority === 0) {
    return (
      <svg {...svgProps}>
        <circle cx="2.5" cy="7" r="1.1" fill="var(--prio-none)" />
        <circle cx="7" cy="7" r="1.1" fill="var(--prio-none)" />
        <circle cx="11.5" cy="7" r="1.1" fill="var(--prio-none)" />
      </svg>
    );
  }

  // Urgent: filled rounded rect + stem rect + dot (no <text> element)
  if (priority === 4) {
    return (
      <svg {...svgProps}>
        <rect x="1.4" y="1.4" width="11.2" height="11.2" rx="2.6" fill="var(--prio-urgent)" />
        <rect x="6.3" y="3.6" width="1.4" height="4.6" rx="0.7" fill="white" />
        <circle cx="7" cy="10.4" r="0.95" fill="white" />
      </svg>
    );
  }

  // Low=1, medium=2, high=3 bars lit
  const n = priority; // 1 | 2 | 3
  const col =
    n === 1 ? "var(--prio-low)" : n === 2 ? "var(--prio-medium)" : "var(--prio-high)";

  // bar(x, y, height, isLit) — handoff coords
  const bars: Array<{ x: number; y: number; h: number }> = [
    { x: 1.3, y: 8, h: 4.7 },
    { x: 5.65, y: 5, h: 7.7 },
    { x: 10, y: 2, h: 10.7 },
  ];

  return (
    <svg {...svgProps}>
      {bars.map((b, i) => {
        const on = i < n;
        return (
          <rect
            key={b.x}
            x={b.x}
            y={b.y}
            width="2.7"
            height={b.h}
            rx="1.1"
            fill={on ? col : FAINT}
            data-on={on}
          />
        );
      })}
    </svg>
  );
}
