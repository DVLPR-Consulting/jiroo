"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { TypeIcon } from "@/components/icons/type-icon";
import {
  NewItemButton,
  type NewItemButtonProps,
} from "@/components/items/new-item-dialog";
import type { HierarchyStartStep } from "@/lib/tree/hierarchy";
import { cn } from "@/lib/utils";

/**
 * Guided first steps of a new backlog (JIR-88). The hierarchy is mandatory
 * (Composant → Epic → Tâche), so an empty backlog says where to start, like
 * Jira's empty project with its « Create issue » call to action.
 */

/** The dialog data a start-step button needs (the view's « Nouvel item » data). */
export type StartStepDialogProps = Pick<
  NewItemButtonProps,
  "items" | "statuses" | "canScheduleItems" | "releaseOptions" | "fieldOptions" | "viewFilters"
>;

const STEP_COPY: Record<
  HierarchyStartStep,
  {
    title: string;
    description: string;
    action: string;
    readOnlyTitle: string;
    readOnlyDescription: string;
  }
> = {
  composant: {
    title: "Commencez par créer un Composant (un domaine ou un produit)",
    description:
      "Un Composant regroupe des Epics, et chaque Epic regroupe des tâches. Créez ensuite une Epic, puis vos tâches.",
    action: "Nouveau Composant",
    readOnlyTitle: "Ce backlog est vide",
    readOnlyDescription: "Aucun Composant n’y a encore été créé.",
  },
  epic: {
    title: "Créez une Epic dans un Composant",
    description:
      "Une Tâche se rattache toujours à une Epic : créez une Epic avant d’ajouter vos tâches.",
    action: "Nouvelle Epic",
    readOnlyTitle: "Aucune Epic pour l’instant",
    readOnlyDescription:
      "Les tâches se rattachent à une Epic, et aucune n’a encore été créée dans ce backlog.",
  },
};

/**
 * Whether the user may create the step's item: a Composant needs the create
 * right; an Epic has a parent, which needs the scheduling right too (the
 * « Nouvel item » dialog offers parented types only then).
 */
export function canCreateStartStep(
  step: HierarchyStartStep,
  canCreateItems: boolean,
  dialogProps: StartStepDialogProps | undefined,
): boolean {
  if (!canCreateItems || !dialogProps) return false;
  return step === "composant" || (dialogProps.canScheduleItems ?? true);
}

/**
 * Opens « Nouvel item » preset to the step's type; a new Epic starts under
 * the Composant when there is only one.
 */
export function StartStepButton({
  step,
  backlogId,
  backlogKey,
  dialogProps,
  contextLabel,
  variant = "default",
}: {
  step: HierarchyStartStep;
  backlogId: string;
  backlogKey: string;
  dialogProps: StartStepDialogProps;
  /** Names the place of the button for screen readers (e.g. a sprint). */
  contextLabel?: string;
  variant?: "default" | "outline";
}) {
  const composants = dialogProps.items.filter((item) => item.type === "composant");
  const initialParentId =
    step === "epic" && composants.length === 1 ? composants[0]!.id : undefined;
  return (
    <NewItemButton
      // The dialog keeps its draft type between openings: a new step (the
      // Composant just created) needs a fresh one, preset to the next level.
      key={step}
      backlogId={backlogId}
      backlogKey={backlogKey}
      {...dialogProps}
      initialType={step}
      initialParentId={initialParentId}
      trigger={
        <Button type="button" variant={variant}>
          <span aria-hidden>
            <TypeIcon type={step} size={14} />
          </span>
          {STEP_COPY[step].action}
          {contextLabel ? (
            <>
              {" "}
              <span className="sr-only">({contextLabel})</span>
            </>
          ) : null}
        </Button>
      }
    />
  );
}

/**
 * The step's explanation: a centered empty state in place of « Aucun item »,
 * or a compact callout above existing rows. Without the right to create the
 * step's item, it only states what is missing.
 */
export function BacklogStartGuide({
  step,
  canCreate,
  action,
  variant,
  className,
}: {
  step: HierarchyStartStep;
  canCreate: boolean;
  /** The call to action, shown only with `canCreate`. */
  action?: ReactNode;
  variant: "empty" | "callout";
  className?: string;
}) {
  const copy = STEP_COPY[step];
  const title = canCreate ? copy.title : copy.readOnlyTitle;
  const description = canCreate ? copy.description : copy.readOnlyDescription;
  const shownAction = canCreate ? action : null;
  if (variant === "empty") {
    return (
      <EmptyState
        className={className}
        icon={<TypeIcon type={step} size={18} />}
        title={title}
        description={description}
        action={shownAction}
      />
    );
  }
  return (
    <div
      role="note"
      aria-label={title}
      className={cn(
        "flex flex-wrap items-center gap-3 rounded-[var(--radius-md)] border border-border bg-[var(--surface-2)] px-3.5 py-3",
        className,
      )}
    >
      <span aria-hidden className="flex size-8 flex-none items-center justify-center rounded-full bg-[var(--surface)]">
        <TypeIcon type={step} size={16} />
      </span>
      <div className="min-w-0 flex-1 basis-56">
        <p className="text-sm font-medium">{title}</p>
        <p className="t-sm text-muted-foreground">{description}</p>
      </div>
      {shownAction ? <div className="flex-none">{shownAction}</div> : null}
    </div>
  );
}

/**
 * The guide of a whole view (Liste, Arbre): the explanation with its « Nouvel
 * item » button preset to the step, when the user may create that item.
 */
export function ViewStartGuide({
  step,
  backlogKey,
  dialogProps,
  canCreateItems,
  showAction = true,
  variant,
  className,
}: {
  step: HierarchyStartStep;
  backlogKey: string;
  dialogProps: StartStepDialogProps & { backlogId: string };
  canCreateItems: boolean;
  /** False when the same button already sits elsewhere in the view. */
  showAction?: boolean;
  variant: "empty" | "callout";
  className?: string;
}) {
  const canCreate = canCreateStartStep(step, canCreateItems, dialogProps);
  return (
    <BacklogStartGuide
      step={step}
      canCreate={canCreate}
      variant={variant}
      className={className}
      action={showAction && (
        <StartStepButton
          step={step}
          backlogId={dialogProps.backlogId}
          backlogKey={backlogKey}
          dialogProps={dialogProps}
          variant={variant === "callout" ? "outline" : "default"}
        />
      )}
    />
  );
}

/**
 * Stands in for the Backlog's « Créer un item » while no Epic exists: the
 * inline field creates a task, which could not be attached to anything.
 */
export function InlineStartStep({
  step,
  backlogId,
  backlogKey,
  dialogProps,
  contextLabel,
}: {
  step: HierarchyStartStep;
  backlogId: string;
  backlogKey: string;
  dialogProps: StartStepDialogProps;
  contextLabel: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2 sm:px-3.5">
      <p className="min-w-0 flex-1 basis-48 text-[13.5px] text-muted-foreground">
        {step === "composant"
          ? "Pour créer un item, commencez par un Composant, puis une Epic."
          : "Pour créer un item, créez d’abord une Epic."}
      </p>
      <StartStepButton
        step={step}
        backlogId={backlogId}
        backlogKey={backlogKey}
        dialogProps={dialogProps}
        contextLabel={contextLabel}
        variant="outline"
      />
    </div>
  );
}

/**
 * The same place under active filters: the hierarchy is set up from the
 * unfiltered view, where the new Composant or Epic shows (a filter such as a
 * Version would hide it), so it points there instead of opening the dialog.
 */
export function FilteredStartStep({
  step,
  clearFiltersHref,
}: {
  step: HierarchyStartStep;
  clearFiltersHref?: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2 sm:px-3.5">
      <p className="min-w-0 flex-1 basis-48 text-[13.5px] text-muted-foreground">
        {step === "composant"
          ? "Pour créer un item, il faut d’abord un Composant, puis une Epic : effacez les filtres pour commencer."
          : "Pour créer un item, il faut d’abord une Epic : effacez les filtres pour la créer."}
      </p>
      {clearFiltersHref ? (
        <Link
          href={clearFiltersHref}
          className="text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          Effacer les filtres
        </Link>
      ) : null}
    </div>
  );
}
