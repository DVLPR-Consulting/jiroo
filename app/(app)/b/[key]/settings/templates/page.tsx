import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { BacklogSettingsNav } from "@/components/admin/backlog-settings-nav";
import { ItemTemplatesAdmin } from "@/components/admin/item-templates-admin";
import { BacklogTopbarCreate } from "@/components/shell/backlog-topbar-create";
import { ShellBreadcrumb } from "@/components/shell/shell-breadcrumb";
import { requireBacklogReadPermissionByKey } from "@/lib/auth/action-authorization";
import { checkPermission, ResourceNotFoundError } from "@/lib/auth/authorization";
import { requireAppPageSession } from "@/lib/auth/session";
import { getBacklogSummary } from "@/lib/services/backlogs";
import { listLabelsForBacklog } from "@/lib/services/items";
import { listItemTemplates } from "@/lib/services/item-templates";

/** Backlog settings → shared ticket templates (JIR-43). */
export default async function TemplateSettingsPage({ params }: { params: Promise<{ key: string }> }) {
  const session = await requireAppPageSession();
  const { key } = await params;
  let resource: Awaited<ReturnType<typeof requireBacklogReadPermissionByKey>>;
  try {
    resource = await requireBacklogReadPermissionByKey({
      actorId: session.user.id,
      backlogKey: key,
      permission: "browse_backlog",
    });
  } catch (error) {
    if (error instanceof ResourceNotFoundError) notFound();
    throw error;
  }
  const [administerDecision, createBacklogsDecision] = await Promise.all([
    checkPermission({ actorId: session.user.id, permission: "administer_backlog", scope: { type: "backlog", backlogId: resource.backlogId } }),
    // Administration → Backlogs opens with create_backlogs: the breadcrumb links it only then (JIR-85).
    checkPermission({ actorId: session.user.id, permission: "create_backlogs", scope: { type: "global" } }),
  ]);
  if (!administerDecision.allowed) redirect(`/b/${resource.backlogKey}`);

  const [backlog, templates, labels] = await Promise.all([
    getBacklogSummary(resource.backlogId),
    listItemTemplates(resource.backlogId),
    listLabelsForBacklog(resource.backlogId),
  ]);
  if (!backlog) notFound();

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-8">
      <Suspense fallback={null}><BacklogTopbarCreate userId={session.user.id} backlogKey={resource.backlogKey} /></Suspense>
      <div className="space-y-1">
        <ShellBreadcrumb canOpenAdmin={createBacklogsDecision.allowed} />
        <h1 className="t-h1">Modèles — {backlog.name}</h1>
        <p className="text-sm text-muted-foreground">
          Partagez des modèles pour préremplir les nouveaux tickets de ce backlog. Les tickets existants ne sont pas modifiés.
        </p>
      </div>
      <BacklogSettingsNav backlogKey={resource.backlogKey} current="templates" canAdministerBacklog />
      <ItemTemplatesAdmin backlogId={resource.backlogId} templates={templates} labels={labels} />
    </div>
  );
}
