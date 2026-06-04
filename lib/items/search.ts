// ---------------------------------------------------------------------------
// Pure query-builder helpers for full-text search.
// No DB access — all functions are side-effect-free and unit-tested.
// ---------------------------------------------------------------------------

/**
 * Returns true when the raw query string is blank (empty or whitespace only).
 * Use this as an early-exit guard before building a tsquery or hitting the DB.
 */
export function isBlankQuery(raw: string): boolean {
  return raw.trim() === "";
}

/**
 * Converts a free-text user input string into a safe prefix tsquery expression
 * suitable for `to_tsquery('french', <result>)`.
 *
 * Algorithm:
 *  1. Split on whitespace.
 *  2. Strip every tsquery-special / dangerous character from each token,
 *     keeping only Unicode letters (including accented), digits, and hyphens.
 *  3. Drop tokens that become empty after stripping.
 *  4. Append `:*` to each surviving token (prefix / starts-with match).
 *  5. Join with ` & ` (AND semantics across terms).
 *
 * Returns `""` when nothing survives (blank input, punctuation-only, etc.).
 *
 * Examples:
 *   "réc proc"  → "réc:* & proc:*"
 *   "a|b (c)"   → "ab:* & c:*"
 *   "  "        → ""
 *   "***"       → ""
 *
 * Safety guarantee: the output, when non-empty, can never cause
 * `to_tsquery('french', …)` to throw a syntax error or inject arbitrary SQL,
 * because:
 *  - Every tsquery operator (`& | ! : * ( ) ' \ " <>`…) is stripped from tokens.
 *  - The only structural characters introduced are `:*` (suffix) and ` & ` (join),
 *    which are always syntactically valid in tsquery.
 *  - The result is passed as a BOUND parameter via the `sql` template tag —
 *    never string-concatenated into raw SQL.
 */
export function toPrefixTsQuery(raw: string): string {
  // Split on any run of whitespace
  const tokens = raw.split(/\s+/);

  const terms = tokens
    .map((token) =>
      // Keep only Unicode letters (incl. accented), digits, and hyphens.
      // Everything else (& | ! : * ( ) ' " \ < >, etc.) is removed.
      token.replace(/[^\p{L}\p{N}\-]/gu, ""),
    )
    .filter((t) => t.length > 0)
    // Append :* for prefix matching
    .map((t) => `${t}:*`);

  return terms.join(" & ");
}

/**
 * Returns true when the trimmed input looks like an item key (e.g. CASS-39).
 * Case-insensitive: both "CASS-39" and "cass-39" match.
 * Used to short-circuit or supplement full-text search with a direct key lookup.
 */
export function looksLikeItemKey(raw: string): boolean {
  return /^[A-Za-z]+-\d+$/.test(raw.trim());
}
