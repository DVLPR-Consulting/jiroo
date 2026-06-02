import { ITEM_TYPE_LABELS, type ItemType } from "@/lib/design/constants";

export function TypeIcon({ type, size = 15 }: { type: ItemType; size?: number }) {
  const label = ITEM_TYPE_LABELS[type];
  const common = { width: size, height: size, viewBox: "0 0 15 15", role: "img" as const, "aria-label": label, className: "inline-block flex-none" };

  switch (type) {
    case "composant":
      return (
        <svg {...common}>
          <rect x="2.5" y="2.5" width="10" height="10" rx="2.5" fill="none" stroke="var(--status-todo)" strokeWidth="1.5" />
          <line x1="7.5" y1="4.5" x2="7.5" y2="10.5" stroke="var(--status-todo)" strokeWidth="1.5" />
          <line x1="4.5" y1="7.5" x2="10.5" y2="7.5" stroke="var(--status-todo)" strokeWidth="1.5" />
        </svg>
      );
    case "epic":
      return (
        <svg {...common}>
          <rect x="3.8" y="3.8" width="7.4" height="7.4" rx="1.5" transform="rotate(45 7.5 7.5)" fill="var(--primary)" />
        </svg>
      );
    case "tache":
      return (
        <svg {...common}>
          <rect x="2.5" y="2.5" width="10" height="10" rx="2.5" fill="var(--info)" />
          <polyline points="5,7.6 6.8,9.4 10,5.6" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "soustache":
      return (
        <svg {...common}>
          <path d="M4 3.5 V8 a1.5 1.5 0 0 0 1.5 1.5 H7" fill="none" stroke="var(--muted-foreground)" strokeWidth="1.3" strokeLinecap="round" />
          <rect x="7" y="7.5" width="5" height="5" rx="1.5" fill="none" stroke="var(--muted-foreground)" strokeWidth="1.3" />
        </svg>
      );
  }
}
