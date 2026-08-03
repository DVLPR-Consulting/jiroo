import Link from "next/link";
import { BacklogAdmin, type Backlog } from "@/components/admin/backlog-admin";
import { UserAdmin } from "@/components/admin/user-admin";
import type { AdminUserRow } from "@/lib/services/users";

export type AdminTab = "backlogs" | "users";

export function AdminTabs({
  backlogs,
  users,
  currentUserId,
  activeTab,
}: {
  backlogs: Backlog[];
  users: AdminUserRow[];
  currentUserId: string;
  activeTab: AdminTab;
}) {
  const tabs: Array<{ id: AdminTab; label: string; href: string }> = [
    { id: "backlogs", label: "Backlogs", href: "/admin" },
    { id: "users", label: "Utilisateurs & rôles", href: "/admin?tab=users" },
  ];

  return (
    <div className="space-y-5">
      <div role="tablist" aria-label="Sections d’administration" className="flex border-b border-border">
        {tabs.map((tab) => {
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
        {activeTab === "users" ? (
          <UserAdmin users={users} currentUserId={currentUserId} />
        ) : (
          <BacklogAdmin backlogs={backlogs} />
        )}
      </section>
    </div>
  );
}
