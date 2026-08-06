import type { BacklogCapabilities } from "@/lib/auth/accessible-backlogs";

export type ItemCapabilities = {
  create: boolean;
  edit: boolean;
  transition: boolean;
  assign: boolean;
  delete: boolean;
  restore: boolean;
  addComments: boolean;
  editOwnComments: boolean;
  deleteOwnComments: boolean;
  deleteAllComments: boolean;
  link: boolean;
};

export type PlanningCapabilities = {
  rank: boolean;
  reparent: boolean;
  assignSprint: boolean;
  manageSprints: boolean;
};

export type WorkflowCapabilities = {
  manage: boolean;
};

export type BulkItemCapabilities = {
  edit: boolean;
  transition: boolean;
  assign: boolean;
  schedule: boolean;
};

export type ProductCapabilities = {
  items: ItemCapabilities;
  planning: PlanningCapabilities;
  workflow: WorkflowCapabilities;
  bulk: BulkItemCapabilities;
};

export function projectBacklogCapabilities(
  permissions: BacklogCapabilities,
): ProductCapabilities {
  const canBulkChange = permissions.bulkChangeItems;

  return {
    items: {
      create: permissions.createItems,
      edit: permissions.editItems,
      transition: permissions.editItems && permissions.transitionItems,
      assign: permissions.editItems && permissions.assignItems,
      delete: permissions.deleteItems,
      restore: permissions.restoreItems,
      addComments: permissions.addComments,
      editOwnComments: permissions.editOwnComments,
      deleteOwnComments: permissions.deleteOwnComments,
      deleteAllComments: permissions.deleteAllComments,
      link: permissions.linkItems,
    },
    planning: {
      rank: permissions.scheduleItems,
      reparent: permissions.scheduleItems,
      assignSprint: permissions.scheduleItems,
      manageSprints: permissions.manageSprints,
    },
    workflow: { manage: permissions.manageWorkflow },
    bulk: {
      edit: canBulkChange && permissions.editItems,
      transition: canBulkChange && permissions.transitionItems,
      assign: canBulkChange && permissions.assignItems,
      schedule: canBulkChange && permissions.scheduleItems,
    },
  };
}
