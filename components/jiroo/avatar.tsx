import { LABEL_COLOR_VAR, type LabelHue } from "@/lib/design/constants";

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
      className="inline-flex flex-none items-center justify-center rounded-full font-semibold text-white"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.45,
        background: `var(${LABEL_COLOR_VAR[hue]})`,
        border: "1.5px solid var(--surface)",
      }}
      title={name}
    >
      {initials(name)}
    </span>
  );
}
