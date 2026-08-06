export const ROLES = ["admin", "contributor", "viewer"] as const;
// Kept for Better Auth session compatibility. Backlog authorization uses permissions.
export type Role = (typeof ROLES)[number];

type SessionLike = { user: { id: string; role: Role } } | null;

/** @deprecated Use evaluatePermission for authorization decisions. */
export function hasRole(role: Role, required: Role): boolean {
  return role === required;
}

/** @deprecated Use evaluatePermission for authorization decisions. */
export function canWriteItems(role: Role): boolean {
  return role === "admin" || role === "contributor";
}

/** @deprecated Use requirePermission for authorization decisions. */
export function requireRole<S extends SessionLike>(session: S, required: Role): NonNullable<S> {
  if (!session) throw new Error("Unauthorized: no session");
  if (!hasRole(session.user.role, required)) {
    throw new Error(`Forbidden: requires role ${required}`);
  }
  return session as NonNullable<S>;
}
