import "server-only";

export type PlatformAdministratorUser = { id: string; role: string | null };
export type PlatformAdministratorGrant = {
  id: string;
  principalType: "user" | "group" | "project_role" | "authenticated_user";
  userId: string | null;
  groupId: string | null;
};
export type PlatformAdministratorMembership = { groupId: string; userId: string };

export function isBootstrapPlatformAdministrator(role: string | null): boolean {
  return role === "admin";
}

export function resolvePlatformAdministratorIds(input: {
  users: PlatformAdministratorUser[];
  grants: PlatformAdministratorGrant[];
  memberships: PlatformAdministratorMembership[];
}): Set<string> {
  const activeUserIds = new Set(input.users.map((candidate) => candidate.id));
  const administratorIds = new Set(
    input.users
      .filter((candidate) => isBootstrapPlatformAdministrator(candidate.role))
      .map((candidate) => candidate.id),
  );

  for (const grant of input.grants) {
    if (grant.principalType === "user" && grant.userId && activeUserIds.has(grant.userId)) {
      administratorIds.add(grant.userId);
    }
    if (grant.principalType === "group" && grant.groupId) {
      for (const membership of input.memberships) {
        if (
          membership.groupId === grant.groupId &&
          activeUserIds.has(membership.userId)
        ) {
          administratorIds.add(membership.userId);
        }
      }
    }
  }

  return administratorIds;
}
