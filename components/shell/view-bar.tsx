"use client";

import { DensityToggle } from "@/components/theme/density-toggle";
import { useViewUrlState } from "@/components/shell/view-url-state";
import { ViewBarFrame, ViewTabs } from "@/components/shell/view-tabs";

export function ViewBar({
  view,
  backlogKey,
  groupControlSlot,
  viewActionsSlot,
  workflowSlot,
}: {
  view: string;
  backlogKey?: string;
  /** Rendered right after the tabs group, before saved-view actions. */
  groupControlSlot?: React.ReactNode;
  /** Rendered after grouping, before the ml-auto cluster. */
  viewActionsSlot?: React.ReactNode;
  /** Backlog workflow management, shown only when the caller authorizes it. */
  workflowSlot?: React.ReactNode;
}) {
  const viewUrl = useViewUrlState();

  return (
    <ViewBarFrame>
      <ViewTabs
        active={view}
        backlogKey={backlogKey}
        itemViewLink={(v) => ({
          href: viewUrl.href((params) => params.set("view", v)),
          onNavigate: (event) => {
            event.preventDefault();
            viewUrl.push((latest) => latest.set("view", v));
          },
        })}
      />
      <div className="flex min-w-0 flex-wrap items-center gap-3">
        {groupControlSlot}
        {viewActionsSlot}
      </div>
      <div
        data-slot="primary-actions"
        className="ml-auto flex shrink-0 items-center gap-3"
      >
        {workflowSlot}
        <DensityToggle />
      </div>
    </ViewBarFrame>
  );
}
