import { requireAppPageSession } from "@/lib/auth/session";
import { checkPermission } from "@/lib/auth/authorization";
import { listBacklogsForUser } from "@/lib/services/backlogs";
import { listVisibleViews } from "@/lib/services/views";
import { unreadCount, listRecentNotifications } from "@/lib/services/notifications";
import { getShellCounts } from "@/lib/services/shell";
import { AppShell } from "@/components/shell/app-shell";
import { Sidebar } from "@/components/shell/sidebar";
import { Topbar } from "@/components/shell/topbar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireAppPageSession();
  const [backlogs, views, notifCount, notifications, counts, adminDecisions] = await Promise.all([
    listBacklogsForUser(session.user.id),
    listVisibleViews(session.user.id),
    unreadCount(session.user.id),
    listRecentNotifications(session.user.id),
    getShellCounts(session.user.id),
    Promise.all(["administer_jiroo", "manage_users_groups", "create_backlogs"].map((permission) =>
      checkPermission({ actorId: session.user.id, permission, scope: { type: "global" } }),
    )),
  ]);
  const role = (session.user as { role?: string }).role ?? "viewer";
  return (
    <AppShell
      sidebar={
        <Sidebar
          backlogs={backlogs}
          views={views}
          userId={session.user.id}
          user={{ name: session.user.name, email: session.user.email, role }}
          canAdminister={adminDecisions.some((decision) => decision.allowed)}
          adminHref={adminDecisions[0]?.allowed || adminDecisions[2]?.allowed ? "/admin" : "/admin?tab=users"}
          counts={counts}
        />
      }
      topbar={
        <Topbar
          notifications={notifications}
          unreadCount={notifCount}
          backlogs={backlogs}
          views={views}
        />
      }
    >
      {children}
    </AppShell>
  );
}
