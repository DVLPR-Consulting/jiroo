import { permissionDefinition } from "@/lib/auth/permissions";
import type {
  PermissionDeniedError,
  ResourceNotFoundError,
} from "@/lib/auth/authorization";

export type ActionAuthorizationErrorResult = {
  ok: false;
  error: string;
  fieldErrors?: undefined;
};

function isPermissionDeniedError(error: unknown): error is PermissionDeniedError {
  if (!(error instanceof Error) || error.name !== "PermissionDeniedError") return false;
  const decision = (error as Partial<PermissionDeniedError>).decision;
  return Boolean(
    decision
      && typeof decision.permission === "string"
      && (decision.scope.type === "global" || decision.scope.type === "backlog"),
  );
}

function isResourceNotFoundError(error: unknown): error is ResourceNotFoundError {
  return error instanceof Error && error.name === "ResourceNotFoundError";
}

export function mapActionAuthorizationError(
  error: unknown,
): ActionAuthorizationErrorResult | null {
  if (isPermissionDeniedError(error)) {
    let label: string;
    try {
      label = permissionDefinition(error.decision.permission).label;
    } catch {
      return { ok: false, error: "Action impossible. Réessayez." };
    }
    return {
      ok: false,
      error: error.decision.scope.type === "backlog"
        ? `Vous n’avez pas la permission « ${label} » pour ce backlog.`
        : `Vous n’avez pas la permission « ${label} ».`,
    };
  }
  if (isResourceNotFoundError(error)) {
    return { ok: false, error: "La ressource demandée est introuvable." };
  }
  return null;
}
