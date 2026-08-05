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
