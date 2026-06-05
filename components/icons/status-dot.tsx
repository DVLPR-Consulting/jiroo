import { STATUS_LABELS, type StatusId } from "@/lib/design/constants";

// Handoff geometry: viewBox 0 0 14 14, Linear-style progress circles.
// C = circumference of r=3 circle = 2π×3 ≈ 18.85 (used for arc dasharray).
const C = 18.85;

function arc(pct: number, col: string) {
  return (
    <>
      {/* Ghost ring */}
      <circle cx="7" cy="7" r="5.5" fill="none" stroke={col} strokeWidth="1.5" opacity="0.32" />
      {/* Filled arc: r=3, stroke-width=6 creates a thick band; dasharray clips it to pct% */}
      <circle
        cx="7"
        cy="7"
        r="3"
        fill="none"
        stroke={col}
        strokeWidth="6"
        transform="rotate(-90 7 7)"
        strokeDasharray={`${(C * pct).toFixed(2)} ${C}`}
      />
    </>
  );
}

export function StatusDot({
  status,
  size = 14,
  className,
}: {
  status: StatusId;
  size?: number;
  className?: string;
}) {
  const label = STATUS_LABELS[status];

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 14 14"
      fill="none"
      style={{ flex: "none", display: "block" }}
      role="img"
      aria-label={label}
      className={className}
    >
      {status === "todo" && (
        // Dashed circle — "not started"
        <circle
          cx="7"
          cy="7"
          r="5.4"
          fill="none"
          stroke="var(--status-todo)"
          strokeWidth="1.4"
          strokeDasharray="1.8 2"
        />
      )}

      {status === "doing" && arc(0.5, "var(--status-doing)")}

      {status === "review" && arc(0.78, "var(--status-review)")}

      {status === "done" && (
        <>
          {/* Filled disc */}
          <circle cx="7" cy="7" r="6.2" fill="var(--status-done)" />
          {/* White checkmark */}
          <path
            d="M4.3 7.1 6.1 9 9.7 5.1"
            fill="none"
            stroke="white"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      )}
    </svg>
  );
}
