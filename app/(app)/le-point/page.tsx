import type { Metadata } from "next";
import { cookies } from "next/headers";
import { LePointView } from "@/components/le-point/le-point-view";
import { requireAppPageSession } from "@/lib/auth/session";
import { loadLePoint } from "@/lib/le-point/load";
import { lastVisitBefore, VISIT_COOKIE } from "@/lib/le-point/visit";
import { dayInZone } from "@/lib/roadmap/days";
import { listBacklogsWithStarsForUser } from "@/lib/services/backlogs";

export const metadata: Metadata = { title: "Le point (pilote) — Jiroo" };

/**
 * « Le point » pilot (JIR-107): the reader's backlog, read-only, through the
 * rules validated on the prototype. `?b=KEY` picks the backlog; the reader's
 * starred backlog comes first otherwise.
 */
export default async function LePointPage({ searchParams }: { searchParams?: Promise<{ b?: string | string[] }> }) {
  const session = await requireAppPageSession();
  const [query = {}, jar] = await Promise.all([searchParams, cookies()]);
  const asked = typeof query.b === "string" ? query.b.toUpperCase() : null;
  const backlogs = await listBacklogsWithStarsForUser(session.user.id);
  const chosen = backlogs.find((backlog) => backlog.key === asked) ?? backlogs[0];
  const data = chosen
    ? await loadLePoint({
        userId: session.user.id,
        backlogKey: chosen.key,
        lastVisit: lastVisitBefore(jar.get(VISIT_COOKIE)?.value, dayInZone(new Date())),
      })
    : null;

  if (!data) {
    return (
      <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 lg:py-8">
        <h1 className="t-h1">Le point</h1>
        <p className="mt-2 text-sm text-muted-foreground">Tu n’as accès à aucun backlog pour le moment.</p>
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
