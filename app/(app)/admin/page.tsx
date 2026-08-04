import { redirect } from "next/navigation";
import { requireAppPageSession } from "@/lib/auth/session";
import { listBacklogs } from "@/lib/services/backlogs";
import { listAdminUsers } from "@/lib/services/users";
import { AdminTabs, type AdminTab } from "@/components/admin/admin-tabs";

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  const session = await requireAppPageSession();
  const role = (session.user as { role?: string }).role;
  if (role !== "admin") redirect("/");
  const [{ tab }, backlogs, users] = await Promise.all([
    searchParams,
    listBacklogs({ includeArchived: true }),
    listAdminUsers(),
  ]);
  const activeTab: AdminTab = tab === "users" ? "users" : "backlogs";

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-8">
      <div className="space-y-1">
        <h1 className="t-h1">Administration</h1>
        <p className="text-sm text-muted-foreground">
          Gestion des backlogs, des utilisateurs et de leurs rôles.
        </p>
      </div>
      <AdminTabs
        backlogs={backlogs}
        users={users}
        currentUserId={session.user.id}
        activeTab={activeTab}
      />
    </div>
  );
}
