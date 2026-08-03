export type ItemKeyRewrite = {
  id: string;
  oldKey: string;
  newKey: string;
};

const ITEM_KEY_RE = /^[A-Z]{2,6}-(\d+)$/;

export function planItemKeyRewrite(
  rows: Array<{ id: string; key: string }>,
  currentBacklogKey: string,
  newBacklogKey: string,
): ItemKeyRewrite[] {
  if (currentBacklogKey === newBacklogKey) return [];

  return rows.map((row) => {
    const match = ITEM_KEY_RE.exec(row.key);
    if (!match) throw new Error(`Clé d’item invalide: ${row.key}`);
    return {
      id: row.id,
      oldKey: row.key,
      newKey: `${newBacklogKey}-${match[1]}`,
    };
  });
}
