const ITEM_KEY = /^[A-Z]{2,6}-\d+$/;
const DEFAULT_LIMIT = 8;

export const RECENT_ITEMS_STORAGE_KEY = "jiroo-recent-items";

function boundedKeys(values: readonly unknown[], limit = DEFAULT_LIMIT): string[] {
  const safeLimit = Number.isFinite(limit)
    ? Math.max(0, Math.floor(limit))
    : DEFAULT_LIMIT;
  if (safeLimit === 0) return [];

  const seen = new Set<string>();
  const keys: string[] = [];

  for (const value of values) {
    if (typeof value !== "string" || !ITEM_KEY.test(value) || seen.has(value)) {
      continue;
    }
    seen.add(value);
    keys.push(value);
    if (keys.length === safeLimit) break;
  }

  return keys;
}

export function readRecentKeys(raw: string | null): string[] {
  if (raw === null) return [];

  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? boundedKeys(parsed) : [];
  } catch {
    return [];
  }
}

export function recordRecentKey(
  keys: readonly unknown[],
  key: unknown,
  limit = DEFAULT_LIMIT,
): string[] {
  const current = boundedKeys(keys, limit);
  if (typeof key !== "string" || !ITEM_KEY.test(key)) return current;

  return boundedKeys([key, ...current], limit);
}
