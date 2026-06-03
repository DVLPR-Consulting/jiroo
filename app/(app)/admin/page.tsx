import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { listBacklogs } from "@/lib/services/backlogs";
import { BacklogAdmin } from "@/components/admin/backlog-admin";

export default async function AdminPage() {
  const session = await getSession();
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (role !== "admin") redirect("/");
  const backlogs = await listBacklogs({ includeArchived: true });
  return (
    <div className="mx-auto max-w-3xl space-y-6 p-8">
      <h1 className="t-h1">Administration · Backlogs</h1>
      <BacklogAdmin backlogs={backlogs} />
    </div>
  );
}
