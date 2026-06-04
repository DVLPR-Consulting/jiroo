import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { labels } from "@/lib/db/schema/domain";
import { LABEL_COLOR_VAR } from "@/lib/design/constants";
import { createLabelInput, labelColorVarForName, normalizeLabelName } from "@/lib/items/labels";

/**
 * Creates a label for the given backlog, or returns the existing one if a
 * case-insensitive match already exists (idempotent — no duplicate, no error).
 *
 * The `color` column stores the CSS variable NAME (e.g. "--label-3"), not a hex
 * value. The chip component resolves the var at render time.
 */
export async function createLabel(input: unknown) {
  const parsed = createLabelInput.parse(input);
  const name = normalizeLabelName(parsed.name);

  // Dedup: return the existing row if one exists for this backlog (case-insensitive).
  const [existing] = await db
    .select()
    .from(labels)
    .where(
      and(
        eq(labels.backlogId, parsed.backlogId),
        eq(sql`lower(${labels.name})`, name.toLowerCase()),
      ),
    )
    .limit(1);

  if (existing) return existing;

  // Derive the CSS variable name deterministically from the normalised name.
  const colorVar = LABEL_COLOR_VAR[labelColorVarForName(name)];

  const [inserted] = await db
    .insert(labels)
    .values({
      name,
      backlogId: parsed.backlogId,
      color: colorVar,
    })
    .returning();

  // .returning() on a successful INSERT always yields exactly one row.
  return inserted!;
}
