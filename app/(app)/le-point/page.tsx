import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAppPageSession } from "@/lib/auth/session";
import { listBacklogsWithStarsForUser } from "@/lib/services/backlogs";

/**
 * « Le point » lives in each project (`/b/KEY/le-point`, JIR-107). This
 * address, shared with the pilot's testers, opens it in the reader's starred
 * backlog, or the one `?b=` asks for; an inaccessible one is refused, never
 * swapped for another.
 */
export default async function LePointPage({ searchParams }: { searchParams?: Promise<{ b?: string | string[] }> }) {
  const session = await requireAppPageSession();
  const query = (await searchParams) ?? {};
  const asked = typeof query.b === "string" ? query.b.toUpperCase() : null;
  const backlogs = await listBacklogsWithStarsForUser(session.user.id);
  const chosen = asked ? backlogs.find((backlog) => backlog.key === asked) : backlogs[0];
  if (chosen) redirect(`/b/${encodeURIComponent(chosen.key)}/le-point`);

  return (
    <div className="mx-auto w-full max-w-4xl space-y-2 px-4 py-6 sm:px-6 lg:py-8">
      <h1 className="t-h1">Le point</h1>
      {asked ? (
        <p className="text-sm text-muted-foreground">
          Le backlog {asked} n’existe pas, est archivé ou ne t’est pas accessible.{" "}
          {backlogs.length > 0 ? (
            <Link href="/le-point" className="text-[var(--primary)] underline">Revenir à Le point</Link>
          ) : null}
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">Tu n’as accès à aucun backlog pour le moment.</p>
      )}
    </div>
  );
}
