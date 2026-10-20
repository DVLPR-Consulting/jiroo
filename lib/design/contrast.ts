/**
 * The text color that stays readable on a user-chosen background (a backlog
 * color): white or black, whichever contrasts more (WCAG luminance).
 */
export const DARK_TEXT = "#000000";
export const LIGHT_TEXT = "#ffffff";

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number | null {
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return null;
  const digits = match[1]!.length === 3 ? [...match[1]!].map((d) => d + d).join("") : match[1]!;
  const [r, g, b] = [0, 2, 4].map((at) => parseInt(digits.slice(at, at + 2), 16));
  return 0.2126 * channel(r!) + 0.7152 * channel(g!) + 0.0722 * channel(b!);
}

const contrast = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

/** White on dark colors, black on light ones; white when the color is unreadable. */
export function readableTextOn(background: string): string {
  const bg = luminance(background);
  if (bg === null) return LIGHT_TEXT;
  return contrast(bg, luminance(DARK_TEXT)!) > contrast(bg, 1) ? DARK_TEXT : LIGHT_TEXT;
}
