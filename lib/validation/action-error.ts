import { ZodError } from "zod";

export type ItemFieldErrors = Partial<
  Record<"title" | "description", string[]>
>;

export type ValidationActionError = {
  error: string;
  fieldErrors: ItemFieldErrors;
};

export function mapZodActionError(
  error: unknown,
): ValidationActionError | null {
  if (!(error instanceof ZodError)) return null;

  const fieldErrors: ItemFieldErrors = {};
  for (const issue of error.issues) {
    const field = issue.path[0];
    if (field !== "title" && field !== "description") continue;
    (fieldErrors[field] ??= []).push(issue.message);
  }

  const summary =
    fieldErrors.title?.[0] ??
    fieldErrors.description?.[0] ??
    error.issues[0]?.message ??
    "Données invalides.";

  return { error: summary, fieldErrors };
}

/** Fields of the sprint schemas that the sprint dialogs show under an input. */
export const SPRINT_FORM_FIELDS = [
  "name",
  "goal",
  "plannedStartAt",
  "plannedEndAt",
  "startAt",
  "endAt",
  "capacityPoints",
] as const;

export type SprintFormField = (typeof SPRINT_FORM_FIELDS)[number];

export type SprintValidationActionError = {
  error: string;
  fieldErrors: Partial<Record<SprintFormField, string[]>>;
};

/**
 * Sprint counterpart of `mapZodActionError`: keeps only the issues of the
 * sprint form fields as field errors, so the dialogs can show the server's
 * message under the input it concerns (JIR-87).
 */
export function mapSprintZodActionError(
  error: unknown,
): SprintValidationActionError | null {
  if (!(error instanceof ZodError)) return null;

  const fieldErrors: SprintValidationActionError["fieldErrors"] = {};
  for (const issue of error.issues) {
    const field = issue.path[0];
    if (!SPRINT_FORM_FIELDS.includes(field as SprintFormField)) continue;
    (fieldErrors[field as SprintFormField] ??= []).push(issue.message);
  }

  return {
    error: error.issues[0]?.message ?? "Données invalides.",
    fieldErrors,
  };
}
