"use client";

import { useState, useTransition } from "react";
import { Check, ChevronDown, Loader2, X } from "lucide-react";
import { bulkUpdateItemsAction } from "@/app/actions/items";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  FixVersionPicker,
  type FixVersionOption,
} from "@/components/items/fix-version-picker";
import {
  PRIORITIES,
  PRIORITY_LABELS,
  type ItemType,
} from "@/lib/design/constants";
import type { BulkItemPatch } from "@/lib/validation/bulk-item";
import type {
  BulkItemCapabilities,
  ReleaseCapabilities,
} from "@/lib/auth/capabilities";
import { toast } from "@/lib/toast";
import { countLabel } from "@/lib/format/plural";

export type BulkStatusOption = {
  id: string;
  name: string;
  color: string;
  category: "todo" | "in_progress" | "done";
  order: number;
};

export type BulkUserOption = { id: string; name: string };
export type BulkSprintOption = {
  id: string;
  name: string;
  state: "planned" | "active";
};

type MutationResult = { changedCount: number; unchangedCount: number };
type PendingFixVersionPatch = Extract<BulkItemPatch, { field: "fixVersionIds" }>;

export type BulkItemToolbarProps = {
  backlogId: string;
  backlogKey: string;
  selectedItems: Array<{ id: string; type: ItemType }>;
  statuses: BulkStatusOption[];
  users: BulkUserOption[];
  sprints?: BulkSprintOption[];
  canEditItems?: boolean;
  canTransitionItems?: boolean;
  canAssignItems?: boolean;
  canScheduleItems?: boolean;
  canBulkChangeItems?: boolean;
  capabilities?: BulkItemCapabilities;
  releaseOptions?: FixVersionOption[];
  releaseCapabilities?: ReleaseCapabilities;
  onClearSelection: () => void;
  onMutationSuccess: (result: MutationResult) => void;
};

function resultMessage({ changedCount, unchangedCount }: MutationResult): string {
  const changed = countLabel(changedCount, "item modifié", "items modifiés");
  const unchanged = countLabel(unchangedCount, "inchangé", "inchangés");
  return `${changed}, ${unchanged}.`;
}

export function BulkItemToolbar({
  backlogId,
  backlogKey,
  selectedItems,
  statuses,
  users,
  sprints,
  canEditItems = true,
  canTransitionItems = true,
  canAssignItems = true,
  canScheduleItems = true,
  canBulkChangeItems = true,
  capabilities,
  releaseOptions = [],
  releaseCapabilities,
  onClearSelection,
  onMutationSuccess,
}: BulkItemToolbarProps) {
  const canEdit = capabilities?.edit ?? (canBulkChangeItems && canEditItems);
  const canTransition = capabilities?.transition ?? (canBulkChangeItems && canTransitionItems);
  const canAssign = capabilities?.assign ?? (canBulkChangeItems && canAssignItems);
  const canSchedule = capabilities?.schedule ?? (canBulkChangeItems && canScheduleItems);
  const canBulkAssignVersions = releaseCapabilities?.bulkAssignItems ?? false;
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [estimateInput, setEstimateInput] = useState("");
  const [selectedFixVersionIds, setSelectedFixVersionIds] = useState<string[]>([]);
  const [pendingFixVersionPatch, setPendingFixVersionPatch] =
    useState<PendingFixVersionPatch | null>(null);
  const ids = selectedItems.map((item) => item.id).sort();
  const tasksOnly = selectedItems.every((item) => item.type === "tache");
  const estimate = estimateInput === "" ? null : Number(estimateInput);
  const estimateValid =
    estimate !== null &&
    Number.isFinite(estimate) &&
    estimate >= 0 &&
    estimate <= 999.99 &&
    Number.isInteger(estimate * 100);

  function applyPatch(patch: BulkItemPatch) {
    setMessage(null);
    setError(null);
    startTransition(async () => {
      try {
        const result = await bulkUpdateItemsAction({
          backlogId,
          backlogKey,
          itemIds: ids,
          patch,
        });
        if (!result.ok) {
          setError(result.error ?? "Modification groupée impossible.");
          return;
        }
        const counts = {
          changedCount: result.changedCount,
          unchangedCount: result.unchangedCount,
        };
        const successMessage = resultMessage(counts);
        setMessage(successMessage);
        toast.success(successMessage);
        onMutationSuccess(counts);
      } catch {
        setError("Modification groupée impossible.");
      }
    });
  }

  const triggerClass = "min-w-28 justify-between";
  const selectedFixVersionNames = pendingFixVersionPatch?.value.map(
    (releaseId) => releaseOptions.find((release) => release.id === releaseId)?.name ?? releaseId,
  ) ?? [];

  function fixVersionSummary(): string {
    if (!pendingFixVersionPatch) return "";
    const names = selectedFixVersionNames.join(", ");
    if (pendingFixVersionPatch.mode === "add") {
      return `${names} seront ajoutées sans retirer les Fix versions existantes.`;
    }
    if (pendingFixVersionPatch.mode === "remove") {
      return `${names} seront retirées. Les autres Fix versions seront conservées.`;
    }
    if (pendingFixVersionPatch.value.length === 0) {
      return "Toutes les Fix versions seront retirées.";
    }
    return `Les Fix versions existantes seront remplacées par ${names}.`;
  }

  return (
    <>
    <div
      role="region"
      aria-label="Actions groupées"
      className="sticky bottom-3 z-30 mx-auto flex w-fit max-w-[calc(100%-1.5rem)] flex-wrap items-center gap-2 rounded-[var(--radius-lg)] border border-border bg-[var(--surface-1)] p-2 shadow-lg"
    >
      <span className="px-1 text-sm font-semibold" aria-live="polite">
        {countLabel(selectedItems.length, "item sélectionné", "items sélectionnés")}
      </span>

      {canTransition ? <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pending}
            className={triggerClass}
            aria-label="Modifier le statut"
          >
            Statut <ChevronDown aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {[...statuses]
            .sort((a, b) => a.order - b.order)
            .map((status) => (
              <DropdownMenuItem
                key={status.id}
                onSelect={() => applyPatch({ field: "statusId", value: status.id })}
              >
                <span
                  aria-hidden
                  className="size-2 rounded-full"
                  style={{ backgroundColor: status.color }}
                />
                {status.name}
              </DropdownMenuItem>
            ))}
        </DropdownMenuContent>
      </DropdownMenu> : null}

      {canEdit ? <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pending}
            className={triggerClass}
            aria-label="Modifier la priorité"
          >
            Priorité <ChevronDown aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {PRIORITIES.map((priority) => (
            <DropdownMenuItem
              key={priority}
              onSelect={() => applyPatch({ field: "priority", value: priority })}
            >
              {PRIORITY_LABELS[priority]}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu> : null}

      {canAssign ? <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pending}
            className={triggerClass}
            aria-label="Modifier l’assigné"
          >
            Assigné <ChevronDown aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem
            onSelect={() => applyPatch({ field: "assigneeId", value: null })}
          >
            Non assigné
          </DropdownMenuItem>
          {users.map((user) => (
            <DropdownMenuItem
              key={user.id}
              onSelect={() => applyPatch({ field: "assigneeId", value: user.id })}
            >
              {user.name}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu> : null}

      {canSchedule && sprints ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pending || !tasksOnly}
              className={triggerClass}
              aria-label="Modifier le sprint"
            >
              Sprint <ChevronDown aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem
              onSelect={() => applyPatch({ field: "sprintId", value: null })}
            >
              Backlog
            </DropdownMenuItem>
            {sprints.map((sprint) => (
              <DropdownMenuItem
                key={sprint.id}
                onSelect={() =>
                  applyPatch({ field: "sprintId", value: sprint.id })
                }
              >
                {sprint.name} — {sprint.state === "active" ? "Actif" : "Planifié"}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}

      {canEdit ? <div className="flex items-center gap-1">
        <Input
          type="number"
          min="0"
          max="999.99"
          step="0.01"
          inputMode="decimal"
          value={estimateInput}
          onChange={(event) => setEstimateInput(event.target.value)}
          disabled={pending || !tasksOnly}
          aria-label="Estimation groupée"
          aria-invalid={estimateInput !== "" && !estimateValid}
          placeholder="Points"
          className="w-24"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pending || !tasksOnly || !estimateValid}
          onClick={() => {
            if (estimate !== null) {
              applyPatch({ field: "estimatePoints", value: estimate });
            }
          }}
          aria-label="Appliquer l’estimation"
        >
          <Check aria-hidden />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={pending || !tasksOnly}
          onClick={() => applyPatch({ field: "estimatePoints", value: null })}
          aria-label="Effacer les estimations"
        >
          Effacer
        </Button>
      </div> : null}

      {canBulkAssignVersions ? (
        <div className="flex items-center gap-1">
          <FixVersionPicker
            value={selectedFixVersionIds}
            options={releaseOptions}
            disabled={pending}
            onChange={setSelectedFixVersionIds}
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={pending}
                aria-label="Appliquer les versions"
              >
                Appliquer <ChevronDown aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem
                disabled={selectedFixVersionIds.length === 0}
                onSelect={() => setPendingFixVersionPatch({
                  field: "fixVersionIds",
                  mode: "add",
                  value: selectedFixVersionIds,
                })}
              >
                Ajouter aux versions
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={selectedFixVersionIds.length === 0}
                onSelect={() => setPendingFixVersionPatch({
                  field: "fixVersionIds",
                  mode: "replace",
                  value: selectedFixVersionIds,
                })}
              >
                Remplacer les versions
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={selectedFixVersionIds.length === 0}
                onSelect={() => setPendingFixVersionPatch({
                  field: "fixVersionIds",
                  mode: "remove",
                  value: selectedFixVersionIds,
                })}
              >
                Retirer des versions
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => setPendingFixVersionPatch({
                  field: "fixVersionIds",
                  mode: "replace",
                  value: [],
                })}
              >
                Effacer toutes les versions
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ) : null}

      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        disabled={pending}
        onClick={onClearSelection}
        aria-label="Effacer la sélection"
      >
        {pending ? <Loader2 aria-hidden className="animate-spin" /> : <X aria-hidden />}
      </Button>

      {canEdit && !tasksOnly ? (
        <span className="basis-full text-xs text-muted-foreground">
          L’estimation groupée est réservée aux tâches.
        </span>
      ) : null}
      {message ? (
        <span className="basis-full text-xs text-muted-foreground" aria-live="polite">
          {message}
        </span>
      ) : null}
      {error ? (
        <span role="alert" className="basis-full text-xs text-[var(--danger)]">
          {error}
        </span>
      ) : null}
    </div>
    <Dialog
      open={pendingFixVersionPatch !== null}
      onOpenChange={(open) => {
        if (!open && !pending) setPendingFixVersionPatch(null);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Confirmer la modification des Fix versions</DialogTitle>
          <DialogDescription>
            Vérifiez cette opération avant de l’appliquer{" "}
            {selectedItems.length === 1
              ? "à l’item sélectionné"
              : `aux ${countLabel(selectedItems.length, "item sélectionné", "items sélectionnés")}`}
            .
          </DialogDescription>
        </DialogHeader>
        <p>{fixVersionSummary()}</p>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => setPendingFixVersionPatch(null)}
          >
            Annuler
          </Button>
          <Button
            type="button"
            disabled={pending || pendingFixVersionPatch === null}
            onClick={() => {
              if (!pendingFixVersionPatch) return;
              const patch = pendingFixVersionPatch;
              setPendingFixVersionPatch(null);
              applyPatch(patch);
            }}
          >
            Appliquer à {countLabel(selectedItems.length, "item", "items")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
