import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PresencesView } from "@/components/presence/presences-view";
import { requireAppPageSession } from "@/lib/auth/session";
import { firstSearchParam, type RawSearchParams } from "@/lib/items/view-url-params";
import { loadPresencePage } from "@/lib/presence/load";
import type { View } from "@/lib/presence/view";
import { isDay } from "@/lib/roadmap/days";

export const metadata: Metadata = { title: "Calendrier d’équipe — Jiroo" };

const VIEWS: Record<string, View> = { mois: "month", sprint: "sprint", annee: "year" };

/**
 * « Calendrier d’équipe » (JIR-124, lot B2): the team's page, outside any
 * backlog. The URL says what is shown (`backlog`, `vue`, `date`, `sprint`, `affichage`);
 * the server reads that period with the reader's rights.
 */
export default async function PresencesPage({ searchParams }: { searchParams?: Promise<RawSearchParams> }) {
  const query = (await searchParams) ?? {};
  const session = await requireAppPageSession();
  const date = firstSearchParam(query.date);
  const page = await loadPresencePage({
    userId: session.user.id,
    scopeKey: firstSearchParam(query.backlog) ?? null,
    view: VIEWS[firstSearchParam(query.vue) ?? "mois"] ?? "month",
    anchor: isDay(date) ? date : null,
    sprintId: firstSearchParam(query.sprint) ?? null,
    display: firstSearchParam(query.affichage) === "absences" ? "absences" : "all",
  });
  if (!page) notFound();
  return <PresencesView page={page} />;
}
