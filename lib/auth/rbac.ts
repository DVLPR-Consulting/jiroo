export const ROLES = ["admin", "contributor", "viewer"] as const;
export type Role = (typeof ROLES)[number];

type SessionLike = { user: { id: string; role: Role } } | null;

export function hasRole(role: Role, required: Role): boolean {
  return role === required;
}

export function canWriteItems(role: Role): boolean {
  return role === "admin" || role === "contributor";
}

// Throws if there is no session or the user lacks the required role.
export function requireRole<S extends SessionLike>(session: S, required: Role): NonNullable<S> {
  if (!session) throw new Error("Unauthorized: no session");
  if (!hasRole(session.user.role, required)) {
    throw new Error(`Forbidden: requires role ${required}`);
  }
  return session as NonNullable<S>;
}
