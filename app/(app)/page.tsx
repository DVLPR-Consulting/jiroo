import { requireAppPageSession } from "@/lib/auth/session";
import { listBacklogOverviewForUser } from "@/lib/services/backlogs";
import { BacklogOverview } from "@/components/backlogs/backlog-overview";

/**
 * Home page (JIR-82): every backlog the user can browse, favourites first,
 * like Jira's Projects page. No more redirect to the first backlog.
 */
export default async function AppIndex() {
  const session = await requireAppPageSession();
  const rows = await listBacklogOverviewForUser(session.user.id);
  return <BacklogOverview rows={rows} />;
}
