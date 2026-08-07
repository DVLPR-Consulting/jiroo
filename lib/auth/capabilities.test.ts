import { describe, expect, it } from "vitest";
import { projectBacklogCapabilities } from "@/lib/auth/capabilities";
import type { BacklogCapabilities } from "@/lib/auth/accessible-backlogs";

const denied: BacklogCapabilities = {
  createItems: false,
  editItems: false,
  transitionItems: false,
  scheduleItems: false,
  assignItems: false,
  deleteItems: false,
  restoreItems: false,
  addComments: false,
  editOwnComments: false,
  deleteOwnComments: false,
  deleteAllComments: false,
  linkItems: false,
  manageSprints: false,
  manageWorkflow: false,
  manageMembers: false,
  bulkChangeItems: false,
};

describe("projectBacklogCapabilities", () => {
  it("projects a scheduler without granting ordinary item edits", () => {
    expect(
      projectBacklogCapabilities({ ...denied, scheduleItems: true }),
    ).toEqual({
      items: {
        create: false,
        edit: false,
        transition: false,
        assign: false,
        delete: false,
        restore: false,
        addComments: false,
        editOwnComments: false,
        deleteOwnComments: false,
        deleteAllComments: false,
        link: false,
      },
      planning: {
        rank: true,
        reparent: true,
        assignSprint: true,
        manageSprints: false,
      },
      workflow: { manage: false },
      releases: { manage: false, assignItems: false, bulkAssignItems: false },
      bulk: { edit: false, transition: false, assign: false, schedule: false },
    });
  });

  it("combines each bulk action with the global bulk permission", () => {
    const projected = projectBacklogCapabilities({
      ...denied,
      editItems: true,
      transitionItems: true,
      assignItems: true,
      scheduleItems: true,
      bulkChangeItems: true,
    });

    expect(projected.items).toMatchObject({
      edit: true,
      transition: true,
      assign: true,
    });
    expect(projected.bulk).toEqual({
      edit: true,
      transition: true,
      assign: true,
      schedule: true,
    });
    expect(projected.releases).toEqual({
      manage: false,
      assignItems: true,
      bulkAssignItems: true,
    });
  });

  it("projects detail permissions independently from edit_items", () => {
    expect(
      projectBacklogCapabilities({
        ...denied,
        deleteItems: true,
        restoreItems: true,
        addComments: true,
        editOwnComments: true,
        deleteAllComments: true,
        linkItems: true,
      }).items,
    ).toEqual({
      create: false,
      edit: false,
      transition: false,
      assign: false,
      delete: true,
      restore: true,
      addComments: true,
      editOwnComments: true,
      deleteOwnComments: false,
      deleteAllComments: true,
      link: true,
    });
    expect(
      projectBacklogCapabilities({
        ...denied,
        manageReleases: true,
        editItems: false,
        bulkChangeItems: true,
      }).releases,
    ).toEqual({
      manage: true,
      assignItems: false,
      bulkAssignItems: false,
    });
  });

  it("defaults legacy release capability inputs closed", () => {
    expect(projectBacklogCapabilities(denied).releases).toEqual({
      manage: false,
      assignItems: false,
      bulkAssignItems: false,
    });
  });
});
