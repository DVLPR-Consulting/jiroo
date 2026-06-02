import { STATUS_COLOR_VAR, STATUS_LABELS, type StatusId } from "@/lib/design/constants";

// Cercle de progression façon Linear. r=6, circonférence ≈ 37.7.
const C = 2 * Math.PI * 6;
const PROGRESS: Record<StatusId, number> = { todo: 0, doing: 0.5, review: 0.78, done: 1 };

export function StatusDot({ status, size = 14 }: { status: StatusId; size?: number }) {
  const color = `var(${STATUS_COLOR_VAR[status]})`;
  const label = STATUS_LABELS[status];
  const dash = PROGRESS[status] * C;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 14 14"
      role="img"
      aria-label={label}
      className="inline-block flex-none"
    >
      {status === "todo" ? (
        <circle cx="7" cy="7" r="6" fill="none" stroke={color} strokeWidth="1.5" strokeDasharray="2 2" />
      ) : status === "done" ? (
        <>
          <circle cx="7" cy="7" r="6.5" fill={color} />
          <polyline
            points="4,7.2 6.2,9.2 10,5"
            fill="none"
            stroke="white"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      ) : (
        <>
          <circle cx="7" cy="7" r="6" fill="none" stroke="var(--border-strong)" strokeWidth="1.5" />
          <circle
            cx="7"
            cy="7"
            r="6"
            fill="none"
            stroke={color}
            strokeWidth="1.5"
            strokeDasharray={`${dash} ${C}`}
            transform="rotate(-90 7 7)"
            strokeLinecap="round"
          />
        </>
      )}
    </svg>
  );
}
