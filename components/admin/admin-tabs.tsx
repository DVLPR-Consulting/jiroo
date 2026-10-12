"use client";

import Link from "next/link";
import {
  BacklogAdmin,
  type Backlog,
  type BacklogLeadOption,
} from "@/components/admin/backlog-admin";
import { GroupAdmin, type GroupAdminProps } from "@/components/admin/group-admin";
import {
  PermissionSchemeAdmin,
  type PermissionSchemeAdminProps,
} from "@/components/admin/permission-scheme-admin";
import {
  ProjectRoleAdmin,
  type ProjectRoleAdminProps,
} from "@/components/admin/project-role-admin";
import { UserAdmin, type UserAdminDto } from "@/components/admin/user-admin";

export type AdminTab = "backlogs" | "users" | "groups" | "roles" | "schemes";

export type AdminTabData =
  | { tab: "backlogs"; backlogs: Backlog[]; leadOptions?: BacklogLeadOption[] }
  | { tab: "users"; users: UserAdminDto[]; currentUserId: string; canRecoverAccounts: boolean }
  | ({ tab: "groups" } & GroupAdminProps)
  | ({ tab: "roles" } & ProjectRoleAdminProps)
  | ({ tab: "schemes" } & PermissionSchemeAdminProps);

export function AdminTabs({
  activeTab,
  data,
}: {
  activeTab: AdminTab;
  data: AdminTabData;
}) {
  const tabs: Array<{ id: AdminTab; label: string; href: string }> = [
    { id: "backlogs", label: "Backlogs", href: "/admin" },
    { id: "users", label: "Utilisateurs", href: "/admin?tab=users" },
    { id: "groups", label: "Groupes", href: "/admin?tab=groups" },
    { id: "roles", label: "Rôles de projet", href: "/admin?tab=roles" },
    { id: "schemes", label: "Schémas de permissions", href: "/admin?tab=schemes" },
  ];

  function moveFocus(event: React.KeyboardEvent<HTMLAnchorElement>, index: number) {
    const keys = ["ArrowLeft", "ArrowRight", "Home", "End"];
    if (!keys.includes(event.key)) return;
    event.preventDefault();
    const tabsInDom = Array.from(
      event.currentTarget.closest('[role="tablist"]')?.querySelectorAll<HTMLElement>('[role="tab"]') ?? [],
    );
    const nextIndex = event.key === "Home"
      ? 0
      : event.key === "End"
        ? tabsInDom.length - 1
        : (index + (event.key === "ArrowRight" ? 1 : -1) + tabsInDom.length) % tabsInDom.length;
    tabsInDom[nextIndex]?.focus();
  }

  return (
    <div className="space-y-5">
      <div role="tablist" aria-label="Sections d’administration" className="flex border-b border-border">
        {tabs.map((tab, index) => {
          const selected = activeTab === tab.id;
          return (
            <Link
              key={tab.id}
              href={tab.href}
              role="tab"
              id={`admin-tab-${tab.id}`}
              aria-selected={selected}
              aria-controls={`admin-panel-${tab.id}`}
              tabIndex={selected ? 0 : -1}
              onKeyDown={(event) => moveFocus(event, index)}
              className={`-mb-px border-b-2 px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                selected
                  ? "border-primary font-medium text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
      <section
        role="tabpanel"
        id={`admin-panel-${activeTab}`}
        aria-labelledby={`admin-tab-${activeTab}`}
      >
        {data.tab === "backlogs" && (
          <BacklogAdmin backlogs={data.backlogs} leadOptions={data.leadOptions} />
        )}
        {data.tab === "users" && (
          <UserAdmin
            users={data.users}
            currentUserId={data.currentUserId}
            canRecoverAccounts={data.canRecoverAccounts}
          />
        )}
        {data.tab === "groups" && <GroupAdmin {...data} />}
        {data.tab === "roles" && <ProjectRoleAdmin {...data} />}
        {data.tab === "schemes" && <PermissionSchemeAdmin {...data} />}
      </section>
    </div>
  );
}
