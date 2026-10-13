/**
 * Item keys mentioned in webhook texts (JIR-95), like Jira's development
 * panel: `<KEY>-<number>` as a whole word, case-insensitive, for the
 * connected backlog's key only. `CASS-12x`, `xCASS-12` or `CASS-12_fix` are
 * not mentions. Returned upper-cased, unique, in order of appearance.
 */
export function extractItemKeys(texts: readonly string[], backlogKey: string): string[] {
  if (!/^[A-Za-z]{2,6}$/.test(backlogKey)) return [];
  const pattern = new RegExp(`\\b${backlogKey}-(\\d{1,9})\\b`, "gi");
  const keys = new Set<string>();
  for (const text of texts) {
    for (const match of text.matchAll(pattern)) {
      keys.add(`${backlogKey.toUpperCase()}-${match[1]}`);
    }
  }
  return [...keys];
}
