import { TopbarCreateItem } from "@/components/shell/create-item-trigger";
import { loadBacklogCreateDialog } from "@/lib/services/create-dialog";

/**
 * « + Créer » in the top bar of a backlog page that is not one of its views
 * (Roadmap, Releases, Rapports, Paramètres), as in Jira. Render it inside a
 * Suspense boundary: the dialog data streams in after the page.
 */
export async function BacklogTopbarCreate({
  userId,
  backlogKey,
}: {
  userId: string;
  backlogKey: string;
}) {
  const dialog = await loadBacklogCreateDialog({ userId, backlogKey });
  return dialog ? <TopbarCreateItem {...dialog} /> : null;
}
