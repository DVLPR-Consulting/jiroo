import {
  permissionDefinition,
  type PermissionKey,
} from "@/lib/auth/permissions";

export type PermissionScope =
  | { type: "global" }
  | { type: "backlog"; backlogId: string };

export type GrantMatch = {
  type: "user" | "group" | "project_role" | "authenticated_user";
  id: string;
  label: string;
};

export type PermissionReason =
  | { type: "platform_administrator" }
  | { type: "missing_prerequisite"; permission: "browse_backlog" }
  | { type: "no_matching_grant" }
  | {
      type:
        | "user_grant"
        | "group_grant"
        | "project_role_grant"
        | "authenticated_user_grant";
      id: string;
      label: string;
    };

export type PermissionDecision = {
  allowed: boolean;
  permission: PermissionKey;
  scope: PermissionScope;
  reasons: PermissionReason[];
};

export type EvaluatePermissionInput = {
  permission: PermissionKey;
  scope: PermissionScope;
  platformAdministrator: boolean;
  hasBrowse: boolean;
  matches: GrantMatch[];
};

const grantTypeOrder: Record<GrantMatch["type"], number> = {
  user: 0,
  group: 1,
  project_role: 2,
  authenticated_user: 3,
};

function sortedMatches(matches: GrantMatch[]): GrantMatch[] {
  return [...matches].sort((left, right) => {
    const typeOrder = grantTypeOrder[left.type] - grantTypeOrder[right.type];
    if (typeOrder !== 0) return typeOrder;

    const labelOrder = left.label.localeCompare(right.label);
    if (labelOrder !== 0) return labelOrder;

    return left.id.localeCompare(right.id);
  });
}

function grantReason(match: GrantMatch): PermissionReason {
  return {
    type: `${match.type}_grant` as Extract<
      PermissionReason,
      { type: `${string}_grant` }
    >["type"],
    id: match.id,
    label: match.label,
  };
}

export function evaluatePermission(input: EvaluatePermissionInput): PermissionDecision {
  const definition = permissionDefinition(input.permission);

  if (definition.scope !== input.scope.type) {
    throw new Error("La portée de la permission est invalide.");
  }

  if (input.platformAdministrator) {
    return {
      allowed: true,
      permission: input.permission,
      scope: input.scope,
      reasons: [{ type: "platform_administrator" }],
    };
  }

  if (definition.prerequisite && !input.hasBrowse) {
    return {
      allowed: false,
      permission: input.permission,
      scope: input.scope,
      reasons: [{ type: "missing_prerequisite", permission: definition.prerequisite }],
    };
  }

  const matches = sortedMatches(input.matches);
  if (matches.length === 0) {
    return {
      allowed: false,
      permission: input.permission,
      scope: input.scope,
      reasons: [{ type: "no_matching_grant" }],
    };
  }

  return {
    allowed: true,
    permission: input.permission,
    scope: input.scope,
    reasons: matches.map(grantReason),
  };
}
