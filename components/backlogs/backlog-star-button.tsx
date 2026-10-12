"use client";

import { useOptimistic, useTransition } from "react";
import { Star } from "lucide-react";
import { setBacklogStarAction } from "@/app/actions/backlogs";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

/**
 * Favourite toggle of a backlog (JIR-82, Jira's starred projects). The star
 * flips at once; the server refresh then reorders the lists.
 */
export function BacklogStarButton({
  backlogId,
  backlogName,
  starred,
  className,
}: {
  backlogId: string;
  backlogName: string;
  starred: boolean;
  className?: string;
}) {
  const [pending, startTransition] = useTransition();
  const [shownStarred, setShownStarred] = useOptimistic(starred);
  // Stable accessible name; the state is carried by aria-pressed, the action by the tooltip.
  const tooltip = shownStarred ? "Retirer des favoris" : "Ajouter aux favoris";

  return (
    <button
      type="button"
      aria-pressed={shownStarred}
      aria-label={`Favori : ${backlogName}`}
      title={tooltip}
      aria-busy={pending || undefined}
      data-starred={shownStarred ? "" : undefined}
      onClick={() => {
        const next = !shownStarred;
        startTransition(async () => {
          setShownStarred(next);
          let result: Awaited<ReturnType<typeof setBacklogStarAction>>;
          try {
            result = await setBacklogStarAction({ backlogId, starred: next });
          } catch {
            toast.error("Favori non enregistré. Réessayez.");
            return;
          }
          if (!result.ok) toast.error(result.error);
        });
      }}
      className={cn(
        "inline-flex size-8 shrink-0 items-center justify-center rounded-[var(--radius)] text-muted-foreground outline-none transition-colors hover:bg-[var(--muted)] hover:text-foreground focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
        shownStarred && "text-[var(--warning)] hover:text-[var(--warning)]",
        className,
      )}
    >
      <Star aria-hidden className={cn("size-4", shownStarred && "fill-current")} />
    </button>
  );
}
