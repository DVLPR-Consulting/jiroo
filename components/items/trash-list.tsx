"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "@/lib/toast";
import { restoreTrashedItemAction, purgeItemAction } from "@/app/actions/trash";
import type { TrashedItem } from "@/lib/services/items";
import { ItemRow } from "@/components/items/item-row";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { canRestore, restoreDeadline } from "@/lib/items/trash";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type BacklogMeta = { id: string; key: string; name: string; color: string };
type Group = { backlog: BacklogMeta; items: TrashedItem[] };

export type TrashListProps = {
  groups: Group[];
  restorableBacklogIds: string[];
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Format a Date as a simple relative label (e.g. "il y a 2 jours"). */
function relativeTime(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "aujourd'hui";
  if (diffDays === 1) return "il y a 1 jour";
  if (diffDays < 30) return `il y a ${diffDays} jours`;
  return date.toLocaleDateString("fr-FR");
}

// ---------------------------------------------------------------------------
// PurgeConfirmDialog
// ---------------------------------------------------------------------------

function PurgeConfirmDialog({
  open,
  onOpenChange,
  itemKey,
  itemTitle,
  pending,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  itemKey: string;
  itemTitle: string;
  pending: boolean;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Supprimer définitivement ?</DialogTitle>
          <DialogDescription>
            L&apos;item <strong>{itemKey}</strong> &mdash;{" "}
            <span className="italic">{itemTitle}</span> sera supprimé
            définitivement. Cette action est irréversible.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => onOpenChange(false)}
          >
            Annuler
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={pending}
            onClick={onConfirm}
          >
            Supprimer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// TrashRow
// ---------------------------------------------------------------------------

function TrashRow({ item, canRestoreItems }: { item: TrashedItem; canRestoreItems: boolean }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [purgeOpen, setPurgeOpen] = useState(false);
  const restorable = canRestore(item.deletedAt!, new Date());

  function handleRestore() {
    startTransition(async () => {
      const res = await restoreTrashedItemAction({ id: item.id });
      if (res.ok) {
        toast.success("Item restauré.");
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  function handlePurgeConfirm() {
    startTransition(async () => {
      const res = await purgeItemAction({ id: item.id });
      if (res.ok) {
        setPurgeOpen(false);
        toast.success("Item supprimé définitivement.");
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <>
      {/* The Backlog row (JIR-93); a deleted item opens nowhere. */}
      <ItemRow
        as="li"
        item={{
          id: item.id,
          key: item.key,
          title: item.title,
          type: item.type,
          kind: item.kind,
          status: { name: item.statusName, category: item.statusCategory },
        }}
        trailing={
          <>
            <span className="whitespace-nowrap text-xs text-muted-foreground">
              supprimé {relativeTime(item.deletedAt!)}
            </span>
            <span className="whitespace-nowrap text-xs text-muted-foreground">
              {restorable
                ? `Restaurable jusqu’au ${restoreDeadline(item.deletedAt!).toLocaleDateString("fr-FR")}`
                : "Délai expiré"}
            </span>
            {canRestoreItems ? (
              <span className="flex shrink-0 items-center gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isPending || !restorable}
                  onClick={handleRestore}
                >
                  Restaurer
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={isPending}
                  onClick={() => setPurgeOpen(true)}
                >
                  Supprimer définitivement
                </Button>
              </span>
            ) : null}
          </>
        }
      />

      {canRestoreItems ? <PurgeConfirmDialog
        open={purgeOpen}
        onOpenChange={setPurgeOpen}
        itemKey={item.key}
        itemTitle={item.title}
        pending={isPending}
        onConfirm={handlePurgeConfirm}
      /> : null}
    </>
  );
}

// ---------------------------------------------------------------------------
// TrashList
// ---------------------------------------------------------------------------

export function TrashList({ groups, restorableBacklogIds }: TrashListProps) {
  if (groups.length === 0) {
    return (
      <div className="grid flex-1 place-items-center p-10">
        <EmptyState
          icon={<Trash2 className="size-5" />}
          title="Corbeille vide"
          description="Les items supprimés apparaîtront ici pendant 30 jours."
          action={
            <Button asChild variant="outline">
              <Link href="/">Voir les backlogs</Link>
            </Button>
          }
        />
      </div>
    );
  }

  const restorableBacklogs = new Set(restorableBacklogIds);

  return (
    <div className="flex-1 overflow-auto">
      {groups.map(({ backlog, items }) => (
        <details key={backlog.key} open className="border-b border-border">
          {/* Backlog section header */}
          <summary className="flex cursor-pointer items-center gap-2 bg-[var(--surface-2)] px-4 py-1.5 text-xs font-medium text-muted-foreground">
            <span
              className="rounded px-1.5 py-0.5 text-[11px] font-medium text-white"
              style={{ background: backlog.color }}
            >
              {backlog.key}
            </span>
            <span>{backlog.name}</span>
            <span className="ml-1">{items.length}</span>
          </summary>

          <ul>
            {items.map((item) => (
              <TrashRow
                key={item.id}
                item={item}
                canRestoreItems={restorableBacklogs.has(backlog.id)}
              />
            ))}
          </ul>
        </details>
      ))}
    </div>
  );
}
