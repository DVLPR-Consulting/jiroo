import { redirect } from "next/navigation";
import { requireAppPageSession } from "@/lib/auth/session";
import { listBacklogsForUser } from "@/lib/services/backlogs";

export default async function AppIndex() {
  const session = await requireAppPageSession();
  const [first] = await listBacklogsForUser(session.user.id);
  if (first) redirect(`/b/${first.key}`);
  return (
    <div className="grid h-full place-items-center p-10 text-center">
      <div className="space-y-2">
        <p className="t-h2">Aucun backlog</p>
        <p className="t-sm text-muted-foreground">Un administrateur peut en créer un dans l’administration.</p>
      </div>
    </div>
  );
}
