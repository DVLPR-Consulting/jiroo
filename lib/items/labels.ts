import { z } from "zod";
import { LABEL_HUES, type LabelHue } from "@/lib/design/constants";

// ---------------------------------------------------------------------------
// normalizeLabelName
// ---------------------------------------------------------------------------

/**
 * Trims leading/trailing whitespace and collapses runs of internal whitespace
 * to a single space. Used for dedup and display.
 */
export function normalizeLabelName(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

// ---------------------------------------------------------------------------
// labelColorVarForName
// ---------------------------------------------------------------------------

/**
 * Deterministic djb2-style hash: maps a label name to a stable LabelHue (1..6).
 * Always returns the same hue for the same name; never uses Math.random().
 */
function hashString(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    // h = h * 33 ^ charCode
    h = ((h << 5) + h) ^ s.charCodeAt(i);
    // Keep it in 32-bit signed integer range via bitwise OR 0
    h = h | 0;
  }
  return Math.abs(h);
}

/**
 * Returns a stable LabelHue (1..6) for the given label name.
 * The input is first normalized and lowercased so that casing/whitespace
 * differences never produce a different hue.
 */
export function labelColorVarForName(name: string): LabelHue {
  const normalized = normalizeLabelName(name).toLowerCase();
  const hash = hashString(normalized);
  // LABEL_HUES is [1, 2, 3, 4, 5, 6]; map the hash into the array
  const index = hash % LABEL_HUES.length;
  return LABEL_HUES[index] as LabelHue;
}

// ---------------------------------------------------------------------------
// createLabelInput
// ---------------------------------------------------------------------------

export const createLabelInput = z.object({
  backlogId: z.string().uuid(),
  name: z.string().trim().min(1).max(50),
});

export type CreateLabelInput = z.infer<typeof createLabelInput>;
