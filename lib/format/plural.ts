/**
 * French count agreement.
 *
 * French (CLDR "fr") treats a count as singular when its integer part is 0 or
 * 1 — "0 tâche", "1 tâche", "1,5 point" — and plural from 2 — "2 tâches",
 * "2,5 points". Agreement follows the magnitude, so "-1 pt" stays singular.
 * The noun phrase is passed as explicit singular/plural strings so that any
 * following adjective agrees too ("sprint inclus" / "sprints inclus").
 */

const defaultNumber = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });

type NumberFormat = (value: number) => string;

export function isFrenchPlural(count: number): boolean {
  return Math.abs(count) >= 2;
}

/** The singular or plural form agreeing with `count`, without the number. */
export function frenchPlural(count: number, singular: string, plural: string): string {
  return isFrenchPlural(count) ? plural : singular;
}

/**
 * `count` followed by the agreeing noun phrase. `format` only changes how the
 * number is printed; agreement is always decided on the numeric value.
 */
export function countLabel(
  count: number,
  singular: string,
  plural: string,
  format: NumberFormat = String,
): string {
  return `${format(count)} ${frenchPlural(count, singular, plural)}`;
}

/** Abbreviated story points: "1 pt", "1,5 pt", "2 pts". */
export function pointsLabel(points: number, format: NumberFormat = defaultNumber.format): string {
  return countLabel(points, "pt", "pts", format);
}
