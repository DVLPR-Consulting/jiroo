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
import { Input } from "@/components/ui/input";
import {
  PRIORITIES,
  PRIORITY_LABELS,
  type ItemType,
} from "@/lib/design/constants";
import type { BulkItemPatch } from "@/lib/validation/bulk-item";

export type BulkStatusOption = {
  id: string;
  name: string;
  color: string;
  category: "todo" | "in_progress" | "done";
  order: number;
};

export type BulkUserOption = { id: string; name: string };

type MutationResult = { changedCount: number; unchangedCount: number };

export type BulkItemToolbarProps = {
  backlogId: string;
  backlogKey: string;
  selectedItems: Array<{ id: string; type: ItemType }>;
  statuses: BulkStatusOption[];
  users: BulkUserOption[];
  onClearSelection: () => void;
  onMutationSuccess: (result: MutationResult) => void;
};

function resultMessage({ changedCount, unchangedCount }: MutationResult): string {
  const changed = `${changedCount} ${changedCount === 1 ? "item modifié" : "items modifiés"}`;
  const unchanged = `${unchangedCount} inchangé${unchangedCount > 1 ? "s" : ""}`;
  return `${changed}, ${unchanged}.`;
}

export function BulkItemToolbar({
  backlogId,
  backlogKey,
  selectedItems,
  statuses,
  users,
  onClearSelection,
  onMutationSuccess,
}: BulkItemToolbarProps) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [estimateInput, setEstimateInput] = useState("");
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
        setMessage(resultMessage(counts));
        onMutationSuccess(counts);
      } catch {
        setError("Modification groupée impossible.");
      }
    });
  }

  const triggerClass = "min-w-28 justify-between";

  return (
    <div
      role="region"
      aria-label="Actions groupées"
      className="sticky bottom-3 z-30 mx-auto flex w-fit max-w-[calc(100%-1.5rem)] flex-wrap items-center gap-2 rounded-[var(--radius-lg)] border border-border bg-[var(--surface-1)] p-2 shadow-lg"
    >
      <span className="px-1 text-sm font-semibold" aria-live="polite">
        {selectedItems.length} {selectedItems.length === 1 ? "item sélectionné" : "items sélectionnés"}
      </span>

      <DropdownMenu>
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
      </DropdownMenu>

      <DropdownMenu>
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
      </DropdownMenu>

      <DropdownMenu>
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
      </DropdownMenu>

      <div className="flex items-center gap-1">
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
      </div>

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

      {!tasksOnly ? (
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
  );
}
