import { isFiltersActive, type Filters, type ViewState } from "@/lib/items/filter";

export type FilterOption = { value: string; label: string };

/**
 * Facets kept behind « + Filtre » (JIR-74); Assigné, Type, Statut and Parent
 * stay on the bar. An active one shows as a chip with its value and a ×.
 */
export const SECONDARY_FILTERS = [
  { key: "priorities", label: "Priorité" },
  { key: "labels", label: "Label" },
  { key: "releaseIds", label: "Version" },
  { key: "kind", label: "Nature" },
] as const satisfies readonly { key: keyof Filters; label: string }[];

export type SecondaryFilter = (typeof SECONDARY_FILTERS)[number];
export type SecondaryFilterKey = SecondaryFilter["key"];

export function splitSecondaryFilters(filters: Filters): {
  active: SecondaryFilter[];
  available: SecondaryFilter[];
} {
  const active: SecondaryFilter[] = [];
  const available: SecondaryFilter[] = [];
  for (const filter of SECONDARY_FILTERS) {
    (filters[filter.key].length > 0 ? active : available).push(filter);
  }
  return { active, available };
}

/** A chip's value: the first selection's label, « +N » for the others. */
export function chipValue(options: FilterOption[], selected: string[]): string | undefined {
  if (selected.length === 0) return undefined;
  const first = options.find((option) => option.value === selected[0])?.label;
  if (!first) return String(selected.length);
  return selected.length > 1 ? `${first} +${selected.length - 1}` : first;
}

export function toggleValue(selected: string[], value: string): string[] {
  return selected.includes(value)
    ? selected.filter((candidate) => candidate !== value)
    : [...selected, value];
}

/** « Enregistrer la vue » only shows once the view differs from the defaults. */
export function hasSavableViewState(state: ViewState): boolean {
  return isFiltersActive(state.filters) || state.group !== null || state.sort !== null;
}
