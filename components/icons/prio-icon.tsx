import { PRIORITY_COLOR_VAR, PRIORITY_LABELS, type Priority } from "@/lib/design/constants";

export function PrioIcon({ priority, size = 14 }: { priority: Priority; size?: number }) {
  const label = PRIORITY_LABELS[priority];
  const color = `var(${PRIORITY_COLOR_VAR[priority]})`;

  if (priority === 0) {
    return (
      <svg width={size} height={size} viewBox="0 0 14 14" role="img" aria-label={label} className="inline-block flex-none">
        {[3, 7, 11].map((cx) => (
          <circle key={cx} cx={cx} cy="7" r="1.1" fill="var(--prio-none)" />
        ))}
      </svg>
    );
  }

  if (priority === 4) {
    return (
      <svg width={size} height={size} viewBox="0 0 14 14" role="img" aria-label={label} className="inline-block flex-none">
        <rect x="1" y="1" width="12" height="12" rx="3" fill={color} />
        <text x="7" y="10.5" textAnchor="middle" fontSize="9" fontWeight="700" fill="white">
          !
        </text>
      </svg>
    );
  }

  // low=1, medium=2, high=3 → nombre de barres colorées
  const onCount = priority;
  const bars = [
    { x: 1.5, h: 5, y: 7.5 },
    { x: 5.5, h: 8, y: 4.5 },
    { x: 9.5, h: 11, y: 1.5 },
  ];
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" role="img" aria-label={label} className="inline-block flex-none">
      {bars.map((b, i) => {
        const on = i < onCount;
        return (
          <rect
            key={b.x}
            data-on={on}
            x={b.x}
            y={b.y}
            width="3"
            height={b.h}
            rx="1"
            fill={on ? color : "var(--border-strong)"}
          />
        );
      })}
    </svg>
  );
}
