/** Longest branch name suggested for an item (Jira-like, readable in a terminal). */
export const BRANCH_NAME_MAX = 60;

const LIGATURES: Record<string, string> = { œ: "oe", æ: "ae", ß: "ss" };

function asciiSlug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[œæß]/g, (letter) => LIGATURES[letter] ?? letter)
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Git branch name for an item, as Jira's « Create branch » suggests it:
 * `<key>-<title-slug>`, lower-case ASCII. A long title is cut on a word
 * boundary so the name stays at most `BRANCH_NAME_MAX` characters.
 */
export function itemBranchName(key: string, title: string): string {
  const prefix = asciiSlug(key);
  const slug = asciiSlug(title);
  if (!slug) return prefix;
  const full = `${prefix}-${slug}`;
  if (full.length <= BRANCH_NAME_MAX) return full;
  const cut = full.slice(0, BRANCH_NAME_MAX);
  if (full[BRANCH_NAME_MAX] === "-") return cut;
  const boundary = cut.lastIndexOf("-");
  // Keep whole words when a boundary exists past the key; otherwise hard-cut.
  return boundary > prefix.length ? cut.slice(0, boundary) : cut.replace(/-+$/, "");
}
