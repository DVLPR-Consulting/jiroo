import { randomUUID } from "node:crypto";
import { locales, ZodError, type ZodType } from "zod";
import { describeDomainError } from "@/lib/use-cases/errors";

/** The largest JSON body the API reads (JIR-160); item descriptions stay far below. */
export const MAX_JSON_BODY_BYTES = 64 * 1024;

const problems = {
  validation_error: [400, "Les données de la requête sont invalides."],
  unauthorized: [401, "Un jeton d’accès valide est requis."],
  forbidden: [403, "Vous n’avez pas la permission d’effectuer cette action."],
  insufficient_scope: [403, "Cette action nécessite un jeton avec la portée write."],
  not_found: [404, "Ressource introuvable."],
  method_not_allowed: [405, "Cette méthode HTTP n’est pas autorisée."],
  payload_too_large: [413, "Le corps de la requête est trop volumineux."],
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
export class PayloadTooLargeError extends Error {}

/** Reads at most MAX_JSON_BODY_BYTES, whatever Content-Length claims. */
export async function readBoundedText(request: Request): Promise<string> {
  const declared = Number(request.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > MAX_JSON_BODY_BYTES) throw new PayloadTooLargeError();
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_JSON_BODY_BYTES) {
      await reader.cancel();
      throw new PayloadTooLargeError();
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

export async function parseJson<T>(request: Request, schema: ZodType<T>): Promise<T> {
  const text = await readBoundedText(request);
  let body: unknown;
  try { body = JSON.parse(text); } catch { throw new InvalidJsonError(); }
  return schema.parse(body);
}
export function mapErrorToProblem(error: unknown): Response {
  if (error instanceof ZodError) return problem("validation_error", {
    errors: error.issues.map((issue) => ({ code: issue.code, path: issue.path,
      message: issue.code === "custom" ? issue.message : locales.fr().localeError({ ...issue, input: undefined }) ?? "Valeur invalide.",
    })),
  });
  if (error instanceof PayloadTooLargeError) return problem("payload_too_large");
  if (error instanceof InvalidJsonError || (error instanceof Error && error.name === "InvalidCursorError")) return problem("validation_error");
  if (error instanceof Error && error.name === "ResourceNotFoundError") return problem("not_found");
  if (error instanceof Error && error.name === "PermissionDeniedError") return problem("forbidden");
  const detail = describeDomainError(error);
  if (detail) return problem("domain_error", { detail });
  // Logged without the message, which may carry SQL and its parameters (JIR-160).
  const reference = randomUUID();
  console.error(`[api] internal error ${reference}: ${error instanceof Error ? error.name : typeof error}`);
  return problem("internal_error", { detail: `Référence : ${reference}` });
}
export function methodNotAllowed(allow: string): Response {
  return problem("method_not_allowed", { headers: { Allow: allow } });
}
