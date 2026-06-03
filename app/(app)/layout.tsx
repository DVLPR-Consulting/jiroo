import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { listBacklogs } from "@/lib/services/backlogs";
import { Sidebar } from "@/components/shell/sidebar";
import { Topbar } from "@/components/shell/topbar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");
  const backlogs = await listBacklogs();
  const role = (session.user as { role?: string }).role ?? "viewer";
  return (
    <div className="grid h-screen grid-cols-[248px_1fr] overflow-hidden">
      <Sidebar
        backlogs={backlogs}
        user={{ name: session.user.name, email: session.user.email, role }}
      />
      <div className="flex min-w-0 flex-col">
        <Topbar />
        <main className="min-h-0 flex-1 overflow-auto bg-background">{children}</main>
      </div>
    </div>
  );
}
