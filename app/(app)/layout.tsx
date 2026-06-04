import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { listBacklogs } from "@/lib/services/backlogs";
import { listVisibleViews } from "@/lib/services/views";
import { unreadCount, listRecentNotifications } from "@/lib/services/notifications";
import { Sidebar } from "@/components/shell/sidebar";
import { Topbar } from "@/components/shell/topbar";
import { Toaster } from "@/components/ui/toaster";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");
  const [backlogs, views, notifCount, notifications] = await Promise.all([
    listBacklogs(),
    listVisibleViews(session.user.id),
    unreadCount(session.user.id),
    listRecentNotifications(session.user.id),
  ]);
  const role = (session.user as { role?: string }).role ?? "viewer";
  const twoFactorEnabled = (session.user as { twoFactorEnabled?: boolean }).twoFactorEnabled ?? false;
  return (
    <div className="grid h-screen grid-cols-[248px_1fr] overflow-hidden">
      <Sidebar
        backlogs={backlogs}
        views={views}
        userId={session.user.id}
        user={{ name: session.user.name, email: session.user.email, role }}
      />
      <div className="flex min-w-0 flex-col">
        <Topbar notifications={notifications} unreadCount={notifCount} />
        {!twoFactorEnabled && (
          <a
            href="/2fa/enroll"
            className="block border-b border-border bg-[var(--accent-subtle)] px-4 py-2 text-center text-sm text-[var(--accent-subtle-fg)] hover:underline"
          >
            🔒 Sécurisez votre compte — configurer la double authentification
          </a>
        )}
        <main className="min-h-0 flex-1 overflow-auto bg-background">{children}</main>
      </div>
      <Toaster />
    </div>
  );
}
