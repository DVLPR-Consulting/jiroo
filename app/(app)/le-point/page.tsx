import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { LePointView } from "@/components/le-point/le-point-view";
import { requireAppPageSession } from "@/lib/auth/session";
import { loadLePoint } from "@/lib/le-point/load";
import { lastVisitBefore, VISIT_COOKIE } from "@/lib/le-point/visit";
import { dayInZone } from "@/lib/roadmap/days";
import { listBacklogsWithStarsForUser } from "@/lib/services/backlogs";

export const metadata: Metadata = { title: "Le point (pilote) — Jiroo" };

/**
 * « Le point » pilot (JIR-107): the reader's backlog, read-only, through the
 * rules validated on the prototype. `?b=KEY` picks the backlog, and an
 * inaccessible one is refused; without it, the reader's starred backlog comes first.
 */
export default async function LePointPage({ searchParams }: { searchParams?: Promise<{ b?: string | string[] }> }) {
  const session = await requireAppPageSession();
  const [query = {}, jar] = await Promise.all([searchParams, cookies()]);
  const asked = typeof query.b === "string" ? query.b.toUpperCase() : null;
  const backlogs = await listBacklogsWithStarsForUser(session.user.id);
  // A backlog asked by address is shown or refused, never swapped for another.
  const chosen = asked ? backlogs.find((backlog) => backlog.key === asked) : backlogs[0];
  const data = chosen
    ? await loadLePoint({
        userId: session.user.id,
        backlogKey: chosen.key,
        lastVisit: lastVisitBefore(jar.get(VISIT_COOKIE)?.value, dayInZone(new Date())),
      })
    : null;

  if (!data) {
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
  return (
    <LePointView
      data={data}
      pilot={{ backlogs: backlogs.map(({ key, name }) => ({ key, name })) }}
    />
  );
}
