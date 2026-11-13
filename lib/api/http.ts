import { locales, ZodError, type ZodType } from "zod";
import { describeDomainError } from "@/lib/use-cases/errors";

const problems = {
  validation_error: [400, "Les données de la requête sont invalides."],
  unauthorized: [401, "Un jeton d’accès valide est requis."],
  forbidden: [403, "Vous n’avez pas la permission d’effectuer cette action."],
  insufficient_scope: [403, "Cette action nécessite un jeton avec la portée write."],
  not_found: [404, "Ressource introuvable."],
  method_not_allowed: [405, "Cette méthode HTTP n’est pas autorisée."],
  domain_error: [409, "Cette action ne respecte pas une règle du projet."],
  rate_limited: [429, "La limite de requêtes est atteinte. Réessayez plus tard."],
  internal_error: [500, "Une erreur interne est survenue."],
} as const;
export type ProblemCode = keyof typeof problems;

function headersFor(mediaType: string, supplied?: HeadersInit): Headers {
  const headers = new Headers(supplied);
  headers.set("Content-Type", `${mediaType}; charset=utf-8`);
  headers.set("Cache-Control", "private, no-store");
  return headers;
}
export function jsonOk(data: unknown, status = 200, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(data), { status, headers: headersFor("application/json", headers) });
}
export function problem(code: ProblemCode, options: { detail?: string; errors?: unknown; headers?: HeadersInit } = {}): Response {
  const [status, title] = problems[code];
  return new Response(JSON.stringify({ type: `https://jiroo.dev/problems/${code}`, title, status,
    ...(options.detail !== undefined ? { detail: options.detail } : {}),
    ...(options.errors !== undefined ? { errors: options.errors } : {}),
  }), { status, headers: headersFor("application/problem+json", options.headers) });
}
class InvalidJsonError extends Error {}
export async function parseJson<T>(request: Request, schema: ZodType<T>): Promise<T> {
  let body: unknown;
  try { body = await request.json(); } catch { throw new InvalidJsonError(); }
  return schema.parse(body);
}
export function mapErrorToProblem(error: unknown): Response {
  if (error instanceof ZodError) return problem("validation_error", {
    errors: error.issues.map((issue) => ({ code: issue.code, path: issue.path,
      message: issue.code === "custom" ? issue.message : locales.fr().localeError({ ...issue, input: undefined }) ?? "Valeur invalide.",
    })),
  });
  if (error instanceof InvalidJsonError || (error instanceof Error && error.name === "InvalidCursorError")) return problem("validation_error");
  if (error instanceof Error && error.name === "ResourceNotFoundError") return problem("not_found");
  if (error instanceof Error && error.name === "PermissionDeniedError") return problem("forbidden");
  const detail = describeDomainError(error);
  return detail ? problem("domain_error", { detail }) : problem("internal_error");
}
export function methodNotAllowed(allow: string): Response {
  return problem("method_not_allowed", { headers: { Allow: allow } });
}
