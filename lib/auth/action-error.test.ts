import { describe, expect, it } from "vitest";
import { mapActionAuthorizationError } from "@/lib/auth/action-error";

function permissionDenied(permission: string, scope: { type: "global" } | { type: "backlog"; backlogId: string }) {
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

describe("mapActionAuthorizationError", () => {
  it("returns the exact backlog permission label", () => {
    expect(
      mapActionAuthorizationError(
        permissionDenied("edit_items", { type: "backlog", backlogId: "backlog-1" }),
      ),
    ).toEqual({
      ok: false,
      error: "Vous n’avez pas la permission « Modifier les éléments » pour ce backlog.",
    });
  });

  it("returns the exact global permission label", () => {
    expect(
      mapActionAuthorizationError(permissionDenied("create_backlogs", { type: "global" })),
    ).toEqual({
      ok: false,
      error: "Vous n’avez pas la permission « Créer des backlogs ».",
    });
  });

  it("collapses stored and absent resources to one safe result", () => {
    for (const resourceId of ["existing-hidden", "absent"]) {
      const error = Object.assign(new Error("hidden"), {
        name: "ResourceNotFoundError",
        resourceType: "backlog",
        resourceId,
      });
      expect(mapActionAuthorizationError(error)).toEqual({
        ok: false,
        error: "La ressource demandée est introuvable.",
      });
    }
  });

  it("does not absorb business errors", () => {
    expect(mapActionAuthorizationError(new Error("Cette clé est déjà utilisée."))).toBeNull();
  });
});
