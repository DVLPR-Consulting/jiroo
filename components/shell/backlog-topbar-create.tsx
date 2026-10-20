import { TopbarCreateItem } from "@/components/shell/create-item-trigger";
import { loadBacklogCreateDialog } from "@/lib/services/create-dialog";

/**
 * « + Créer » in the top bar of a backlog page that is not one of its views
 * (Roadmap, Releases, Rapports, Paramètres), as in Jira. Render it inside a
 * Suspense boundary: the dialog data streams in after the page. A page without
 * an item drawer opens the created item in the backlog view.
 */
export async function BacklogTopbarCreate({
  userId,
  backlogKey,
  hasItemDrawer = false,
}: {
  userId: string;
  backlogKey: string;
  hasItemDrawer?: boolean;
}) {
  const dialog = await loadBacklogCreateDialog({ userId, backlogKey });
  if (!dialog) return null;
  return (
    <TopbarCreateItem
      {...dialog}
      {...(hasItemDrawer ? {} : { openCreatedAt: `/b/${dialog.backlogKey}` })}
    />
  );
}
