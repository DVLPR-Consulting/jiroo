import type React from "react";
import { ITEM_TYPE_LABELS, type ItemType } from "@/lib/design/constants";

// Handoff geometry: viewBox 0 0 16 16, default size 15.
// Colors reference CSS custom properties defined in app/globals.css.

export function TypeIcon({
  type,
  size = 15,
  className,
}: {
  type: ItemType;
  size?: number;
  className?: string;
}) {
  const label = ITEM_TYPE_LABELS[type];
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 16 16",
    fill: "none" as const,
    style: { flex: "none", display: "block" } as React.CSSProperties,
    role: "img" as const,
    "aria-label": label,
    className,
  };

  switch (type) {
    case "composant":
      return (
        <svg {...common}>
          {/* Hollow rounded square with inner grid lines */}
          <rect
            x="2.2"
            y="2.2"
            width="11.6"
            height="11.6"
            rx="3"
            fill="none"
            stroke="var(--type-composant)"
            strokeWidth="1.7"
          />
          <path
            d="M2.2 8h11.6M8 2.2v11.6"
            stroke="var(--type-composant)"
            strokeWidth="1.1"
            opacity="0.5"
          />
        </svg>
      );

    case "epic":
      return (
        <svg {...common}>
          {/* Solid garnet diamond */}
          <path d="M8 1.6 14.4 8 8 14.4 1.6 8Z" fill="var(--type-epic)" />
        </svg>
      );

    case "tache":
      return (
        <svg {...common}>
          {/* Solid blue rounded square with white checkmark */}
          <rect x="2.2" y="2.2" width="11.6" height="11.6" rx="3" fill="var(--type-info)" />
          <path
            d="M5 8.1 7.1 10.2 11 5.6"
            fill="none"
            stroke="white"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );

    case "soustache":
      return (
        <svg {...common}>
          {/* L-branch + hollow rounded square (sub-task hierarchy indicator) */}
          <path
            d="M3 2.6v4.2a2.4 2.4 0 0 0 2.4 2.4H7.4"
            fill="none"
            stroke="var(--muted-foreground)"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          <rect
            x="7.2"
            y="6.6"
            width="6.4"
            height="6.4"
            rx="2"
            fill="none"
            stroke="var(--muted-foreground)"
            strokeWidth="1.6"
          />
        </svg>
      );
  }
}
