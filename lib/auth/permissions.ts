export type PermissionScope = "global" | "backlog";

export type PermissionDefinition = {
  key: string;
  label: string;
  scope: PermissionScope;
  prerequisite?: "browse_backlog";
};

const globalPermissionDefinition = (key: string, label: string) => ({
  key,
  label,
  scope: "global" as const,
});

const backlogPermissionDefinition = (key: string, label: string) => ({
  key,
  label,
  scope: "backlog" as const,
  ...(key === "browse_backlog" ? {} : { prerequisite: "browse_backlog" as const }),
});

export const GLOBAL_PERMISSION_DEFINITIONS = {
  administer_jiroo: globalPermissionDefinition("administer_jiroo", "Administrer Jiroo"),
  manage_users_groups: globalPermissionDefinition(
    "manage_users_groups",
    "Gérer les utilisateurs et les groupes",
  ),
  create_backlogs: globalPermissionDefinition("create_backlogs", "Créer des backlogs"),
  bulk_change_items: globalPermissionDefinition(
    "bulk_change_items",
    "Modifier des éléments en masse",
  ),
  browse_users: globalPermissionDefinition("browse_users", "Parcourir les utilisateurs"),
  share_global_views: globalPermissionDefinition(
    "share_global_views",
    "Partager des vues globales",
  ),
} as const;

export const BACKLOG_PERMISSION_DEFINITIONS = {
  browse_backlog: backlogPermissionDefinition("browse_backlog", "Consulter le backlog"),
  administer_backlog: backlogPermissionDefinition(
    "administer_backlog",
    "Administrer le backlog",
  ),
  manage_members: backlogPermissionDefinition("manage_members", "Gérer les membres"),
  manage_workflows: backlogPermissionDefinition("manage_workflows", "Gérer les workflows"),
  manage_sprints: backlogPermissionDefinition("manage_sprints", "Gérer les sprints"),
  manage_releases: backlogPermissionDefinition("manage_releases", "Gérer les releases"),
  create_items: backlogPermissionDefinition("create_items", "Créer des éléments"),
  edit_items: backlogPermissionDefinition("edit_items", "Modifier les éléments"),
  delete_items: backlogPermissionDefinition("delete_items", "Supprimer les éléments"),
  restore_items: backlogPermissionDefinition("restore_items", "Restaurer les éléments"),
  transition_items: backlogPermissionDefinition(
    "transition_items",
    "Transitionner les éléments",
  ),
  schedule_items: backlogPermissionDefinition("schedule_items", "Planifier les éléments"),
  assign_items: backlogPermissionDefinition("assign_items", "Assigner les éléments"),
  assignable_user: backlogPermissionDefinition("assignable_user", "Être assignable"),
  add_comments: backlogPermissionDefinition("add_comments", "Ajouter des commentaires"),
  edit_own_comments: backlogPermissionDefinition(
    "edit_own_comments",
    "Modifier ses propres commentaires",
  ),
  delete_own_comments: backlogPermissionDefinition(
    "delete_own_comments",
    "Supprimer ses propres commentaires",
  ),
  delete_all_comments: backlogPermissionDefinition(
    "delete_all_comments",
    "Supprimer tous les commentaires",
  ),
  link_items: backlogPermissionDefinition("link_items", "Lier les éléments"),
  manage_shared_views: backlogPermissionDefinition(
    "manage_shared_views",
    "Gérer les vues partagées",
  ),
} as const;

export type GlobalPermissionKey = keyof typeof GLOBAL_PERMISSION_DEFINITIONS;
export type BacklogPermissionKey = keyof typeof BACKLOG_PERMISSION_DEFINITIONS;
export type PermissionKey = GlobalPermissionKey | BacklogPermissionKey;

export const GLOBAL_PERMISSION_KEYS = Object.keys(
  GLOBAL_PERMISSION_DEFINITIONS,
) as GlobalPermissionKey[];
export const BACKLOG_PERMISSION_KEYS = Object.keys(
  BACKLOG_PERMISSION_DEFINITIONS,
) as BacklogPermissionKey[];

export const PROTECTED_ROLE_PERMISSION_KEYS = {
  administrators: BACKLOG_PERMISSION_KEYS,
  members: [
    "browse_backlog",
    "create_items",
    "edit_items",
    "transition_items",
    "schedule_items",
    "assign_items",
    "assignable_user",
    "add_comments",
    "edit_own_comments",
    "delete_own_comments",
    "link_items",
  ],
  viewers: ["browse_backlog"],
} as const satisfies Record<
  "administrators" | "members" | "viewers",
  readonly BacklogPermissionKey[]
>;

export const PERMISSION_DEFINITIONS = {
  ...GLOBAL_PERMISSION_DEFINITIONS,
  ...BACKLOG_PERMISSION_DEFINITIONS,
} as const;

export function permissionDefinition(key: string): PermissionDefinition {
  const definition = PERMISSION_DEFINITIONS[key as PermissionKey];
  if (!definition) throw new Error("Permission inconnue.");
  return definition;
}
