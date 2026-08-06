import { describe, expect, it } from "vitest";
import {
  evaluatePermission,
  type PermissionReason,
} from "@/lib/auth/decision";

describe("evaluatePermission", () => {
  it("allows additive role and group grants and explains both", () => {
    const decision = evaluatePermission({
      permission: "manage_sprints",
      scope: { type: "backlog", backlogId: "b1" },
      platformAdministrator: false,
      hasBrowse: true,
      matches: [
        { type: "group", id: "g1", label: "Scrum Masters" },
        { type: "project_role", id: "r1", label: "Responsable delivery" },
      ],
    });

    expect(decision.allowed).toBe(true);
    expect(decision.reasons.map((reason) => reason.type)).toEqual([
      "group_grant",
      "project_role_grant",
    ]);
  });

  it("fails closed when browse is missing", () => {
    expect(
      evaluatePermission({
        permission: "manage_releases",
        scope: { type: "backlog", backlogId: "b1" },
        platformAdministrator: false,
        hasBrowse: false,
        matches: [{ type: "user", id: "u1", label: "Ada" }],
      }),
    ).toMatchObject({
      allowed: false,
      reasons: [{ type: "missing_prerequisite", permission: "browse_backlog" }],
    });
  });

  it("explains the platform administrator bypass", () => {
    expect(
      evaluatePermission({
        permission: "manage_workflows",
        scope: { type: "backlog", backlogId: "b1" },
        platformAdministrator: true,
        hasBrowse: false,
        matches: [],
      }),
    ).toMatchObject({
      allowed: true,
      reasons: [{ type: "platform_administrator" }],
    });
  });

  it("denies with an explanation when no grant matches", () => {
    expect(
      evaluatePermission({
        permission: "browse_backlog",
        scope: { type: "backlog", backlogId: "b1" },
        platformAdministrator: false,
        hasBrowse: false,
        matches: [],
      }),
    ).toMatchObject({
      allowed: false,
      reasons: [{ type: "no_matching_grant" }],
    });
  });

  it("orders matching grant explanations deterministically", () => {
    const decision = evaluatePermission({
      permission: "browse_backlog",
      scope: { type: "backlog", backlogId: "b1" },
      platformAdministrator: false,
      hasBrowse: false,
      matches: [
        { type: "project_role", id: "r1", label: "Administrateur" },
        { type: "user", id: "u2", label: "Zoé" },
        { type: "user", id: "u1", label: "Ada" },
        { type: "group", id: "g1", label: "Équipe produit" },
        { type: "authenticated_user", id: "all", label: "Tous les utilisateurs" },
      ],
    });

    expect(decision.reasons.map((reason) => reason.type)).toEqual([
      "user_grant",
      "user_grant",
      "group_grant",
      "project_role_grant",
      "authenticated_user_grant",
    ]);
    expect(
      decision.reasons
        .filter(
          (reason): reason is Extract<PermissionReason, { label: string }> =>
            "label" in reason,
        )
        .slice(0, 2)
        .map((reason) => reason.label),
    ).toEqual(["Ada", "Zoé"]);
  });
});
