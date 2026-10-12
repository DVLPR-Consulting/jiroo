/**
 * JSON that keeps `Date` values: a Route Handler answers with
 * `stringifyDatedJson` and the client reads it with `parseDatedJson`, so data
 * typed with `Date` fields (Drizzle rows) arrives with the same shape the
 * Server Components pass to the same client components.
 *
 * A date is encoded as `{ "$date": "<ISO>" }` (null when invalid); only an
 * object with that single key is revived.
 */
const DATE_TAG = "$date";

export function stringifyDatedJson(value: unknown): string {
  return JSON.stringify(value, function replacer(this: unknown, key: string, encoded: unknown) {
    // `encoded` already went through Date#toJSON: read the raw value.
    const raw = (this as Record<string, unknown>)[key];
    if (raw instanceof Date) {
      return { [DATE_TAG]: Number.isNaN(raw.getTime()) ? null : raw.toISOString() };
    }
    return encoded;
  });
}

function isDateTag(value: unknown): value is { [DATE_TAG]: string | null } {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  if (keys.length !== 1 || keys[0] !== DATE_TAG) return false;
  const encoded = (value as Record<string, unknown>)[DATE_TAG];
  return typeof encoded === "string" || encoded === null;
}

export function parseDatedJson<T>(text: string): T {
  return JSON.parse(text, (_key, value: unknown) =>
    isDateTag(value)
      ? new Date(value[DATE_TAG] ?? Number.NaN)
      : value,
  ) as T;
}
