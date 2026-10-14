"use client";

import { useMemo, useState } from "react";
import {
  FilteredStartStep,
  InlineStartStep,
  type StartStepDialogProps,
} from "@/components/items/backlog-start-guide";
import { InlineCreateItem } from "@/components/items/inline-create-item";
import type { HierarchyStartStep } from "@/lib/tree/hierarchy";

type ParentOption = { id: string; key: string; title: string };

/**
 * The Epics offered by inline creation and the one picked last, shared by
 * every section of a view; the only Epic stands in until one is picked
 * (e.g. the first one just created).
 */
export function useInlineCreateParent(
  items: StartStepDialogProps["items"] | undefined,
) {
  const epics = useMemo(
    () =>
      (items ?? [])
        .filter((item) => item.type === "epic")
        .map(({ id, key, title }) => ({ id, key, title })),
    [items],
  );
  const [pickedParentId, setParentId] = useState("");
  const parentId = pickedParentId || (epics.length === 1 ? epics[0]!.id : "");
  return { epics, parentId, setParentId };
}

/**
 * « + Créer un item » at the bottom of a section card (Backlog sections,
 * Liste). While the backlog has no Epic yet (JIR-88), it says which level
 * comes first instead, and under active filters it points to clearing them.
 * The caller checks the create and scheduling rights.
 */
export function SectionCreateFooter({
  backlogId,
  backlogKey,
  sprintId,
  contextLabel,
  startStep,
  filtersActive,
  clearFiltersHref,
  dialogProps,
  parents,
  parentId,
  onParentChange,
  bordered,
}: {
  backlogId: string;
  backlogKey: string;
  sprintId: string | null;
  contextLabel: string;
  startStep: HierarchyStartStep | null;
  filtersActive: boolean;
  clearFiltersHref?: string;
  dialogProps?: StartStepDialogProps;
  parents: ParentOption[];
  parentId: string;
  onParentChange: (parentId: string) => void;
  /** A rule above the footer, when rows precede it. */
  bordered: boolean;
}) {
  const className = bordered ? "border-t border-border" : undefined;
  if (startStep && filtersActive) {
    return (
      <div className={className}>
        <FilteredStartStep step={startStep} clearFiltersHref={clearFiltersHref} />
      </div>
    );
  }
  if (startStep && dialogProps) {
    return (
      <div className={className}>
        <InlineStartStep
          step={startStep}
          backlogId={backlogId}
          backlogKey={backlogKey}
          dialogProps={dialogProps}
          contextLabel={contextLabel}
        />
      </div>
    );
  }
  return (
    <div className={className}>
      <InlineCreateItem
        backlogId={backlogId}
        backlogKey={backlogKey}
        sprintId={sprintId}
        contextLabel={contextLabel}
        parents={parents}
        parentId={parentId}
        onParentChange={onParentChange}
        dialogProps={dialogProps}
      />
    </div>
  );
}
