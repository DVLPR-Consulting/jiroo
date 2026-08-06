export function permissionDeniedError(
  permission: string,
  scope: { type: "global" } | { type: "backlog"; backlogId: string },
) {
  return Object.assign(new Error("denied"), {
    name: "PermissionDeniedError",
    decision: {
      allowed: false as const,
      permission,
      scope,
      reasons: [{ type: "no_matching_grant" as const }],
    },
  });
}

export function resourceNotFoundError(resourceType: string, resourceId: string) {
  return Object.assign(new Error("hidden"), {
    name: "ResourceNotFoundError",
    resourceType,
    resourceId,
  });
}
