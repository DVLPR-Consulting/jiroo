import { LABEL_COLOR_VAR, type LabelHue } from "@/lib/design/constants";
import "./avatar.css";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
  }
  return name.trim().slice(0, 2).toUpperCase();
}

export function InitialsAvatar({
  name,
  hue,
  size = 22,
}: {
  name: string;
  hue: LabelHue;
  size?: number;
}) {
  return (
    <span
      role="img"
      aria-label={name}
      className="ji-avatar"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.45,
        background: `var(${LABEL_COLOR_VAR[hue]})`,
      }}
      title={name}
    >
      {initials(name)}
    </span>
  );
}
