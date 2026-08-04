export type RawSearchParams = Record<string, string | string[] | undefined>;
export type ViewUrlEntry = [string, string];

export function firstSearchParam(
  value: string | string[] | undefined,
): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function orderedSearchParamEntries(
  params: RawSearchParams,
): ViewUrlEntry[] {
  return Object.entries(params).flatMap(([key, value]) => {
    if (value === undefined) return [];
    if (Array.isArray(value)) {
      return value.map((entry): ViewUrlEntry => [key, entry]);
    }
    return [[key, value]];
  });
}
