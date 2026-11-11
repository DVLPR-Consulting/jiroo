-- JIR-143: the views sort in SQL with the same comparisons as before in
-- JavaScript, both on ICU's root rules:
-- titles as `localeCompare(…, { sensitivity: "base" })` (equal without case
-- or accents, « Œuvre » = « oeuvre », ties kept in hierarchy order),
-- keys as `localeCompare(…, { numeric: true })` (« -9 » before « -10 »).
CREATE COLLATION IF NOT EXISTS "jiroo_base" (provider = icu, locale = 'und-u-ks-level1', deterministic = false);--> statement-breakpoint
CREATE COLLATION IF NOT EXISTS "jiroo_numeric" (provider = icu, locale = 'und-u-kn');
