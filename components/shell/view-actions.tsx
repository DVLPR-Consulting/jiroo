"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bookmark, ChevronDown } from "lucide-react";
import {
  createViewAction,
  updateViewAction,
  renameViewAction,
  setSharedViewAction,
  deleteViewAction,
} from "@/app/actions/views";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ViewSaveDialog } from "@/components/shell/view-save-dialog";
import { useViewUrlState } from "@/components/shell/view-url-state";
import type { DisplayMode } from "@/lib/items/views";
import type { Filters, GroupKey, SortDir, SortField } from "@/lib/items/filter";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ActiveView = { id: string; name: string; shared: boolean } | null;

export type ViewActionsProps = {
  backlogKey: string;
  backlogId: string;
  activeView: ActiveView;
  isOwner: boolean;
  dirty: boolean;
  // Live state to persist on Save / Save-as:
  displayMode: DisplayMode;
  filters: Filters;
  group: GroupKey | null;
  sort: { field: SortField; dir: SortDir } | null;
};

// ---------------------------------------------------------------------------
// DeleteConfirmDialog — built from Dialog primitives (no AlertDialog primitive)
// ---------------------------------------------------------------------------

function DeleteConfirmDialog({
  open,
  onOpenChange,
  viewName,
  pending,
  error,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  viewName: string;
  pending: boolean;
  error?: string | null;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Supprimer la vue ?</DialogTitle>
          <DialogDescription>
            La vue <strong>&ldquo;{viewName}&rdquo;</strong> sera définitivement supprimée.
            Cette action est irréversible.
          </DialogDescription>
        </DialogHeader>
        {error && <p className="text-sm text-destructive">{error}</p>}
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
// ViewActions
// ---------------------------------------------------------------------------

export function ViewActions({
  backlogKey,
  backlogId,
  activeView,
  isOwner,
  dirty,
  displayMode,
  filters,
  group,
  sort,
}: ViewActionsProps) {
  const router = useRouter();
  const viewUrl = useViewUrlState();
  const [pending, startTransition] = useTransition();

  // Dialog open state
  const [saveAsOpen, setSaveAsOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  // Per-action inline error state
  const [saveAsError, setSaveAsError] = useState<string | null>(null);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [inlineError, setInlineError] = useState<string | null>(null);

  // -------------------------------------------------------------------------
  // Action handlers
  // -------------------------------------------------------------------------

  /** Save in-place — overwrites the active view's state with the live URL state. */
  function handleSave() {
    if (!activeView) return;
    setInlineError(null);
    startTransition(async () => {
      const res = await updateViewAction({
        backlogKey,
        id: activeView.id,
        displayMode,
        filters,
        group,
        sort,
      });
      if (!res.ok) {
        setInlineError(res.error);
        return;
      }
      // URL is unchanged; refresh re-fetches server data so dirty clears.
      router.refresh();
    });
  }

  /** Save-as — creates a new view and navigates to it, preserving other params. */
  function handleSaveAs({ name, shared }: { name: string; shared: boolean }) {
    setSaveAsError(null);
    startTransition(async () => {
      const res = await createViewAction({
        backlogKey,
        backlogId,
        name,
        shared,
        displayMode,
        filters,
        group,
        sort,
      });
      if (!res.ok) {
        setSaveAsError(res.error);
        return;
      }
      setSaveAsOpen(false);
      // Navigate to the new view while preserving existing filter/group/sort params.
      viewUrl.push((params) => params.set("v", res.view.id));
    });
  }

  /** Rename — updates the name of the active view, stays on the same URL. */
  function handleRename({ name }: { name: string }) {
    if (!activeView) return;
    setRenameError(null);
    startTransition(async () => {
      const res = await renameViewAction({
        backlogKey,
        id: activeView.id,
        name,
      });
      if (!res.ok) {
        setRenameError(res.error);
        return;
      }
      setRenameOpen(false);
      router.refresh();
    });
  }

  /** Shared toggle — flips the shared flag on the active view. */
  function handleToggleShared() {
    if (!activeView) return;
    setInlineError(null);
    startTransition(async () => {
      const res = await setSharedViewAction({
        backlogKey,
        id: activeView.id,
        shared: !activeView.shared,
      });
      if (!res.ok) {
        setInlineError(res.error);
        return;
      }
      router.refresh();
    });
  }

  /** Delete — removes the active view and drops the v param from the URL. */
  function handleDelete() {
    if (!activeView) return;
    setDeleteError(null);
    startTransition(async () => {
      const res = await deleteViewAction({
        backlogKey,
        id: activeView.id,
      });
      if (!res.ok) {
        setDeleteError(res.error);
        return;
      }
      setDeleteOpen(false);
      // Drop the v param, preserve everything else.
      viewUrl.push((params) => params.delete("v"));
    });
  }

  // -------------------------------------------------------------------------
  // Trigger label
  // -------------------------------------------------------------------------

  const triggerLabel = activeView ? activeView.name : "Enregistrer la vue";

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            disabled={pending}
            className={cn(
              "flex max-w-[200px] items-center gap-1.5 rounded-[var(--radius-sm)]",
              "border border-border px-2 py-1 text-xs font-medium transition-colors",
              "hover:bg-[var(--muted)] disabled:pointer-events-none disabled:opacity-50",
              activeView
                ? "text-foreground"
                : "text-[var(--subtle-foreground)] hover:text-foreground",
            )}
          >
            <Bookmark className="size-3.5 shrink-0" />
            <span className="truncate">{triggerLabel}</span>
            {activeView && dirty && (
              <span className="shrink-0 text-[var(--subtle-foreground)]">• modifiée</span>
            )}
            <ChevronDown className="size-3 shrink-0 text-[var(--subtle-foreground)]" />
          </button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="start">
          {/* Inline action error — shown at the top of the menu */}
          {inlineError && (
            <p className="px-1.5 py-1 text-xs text-destructive">{inlineError}</p>
          )}

          {activeView && isOwner ? (
            <>
              {/* Save in-place — only when dirty */}
              {dirty && (
                <DropdownMenuItem
                  onSelect={handleSave}
                  disabled={pending}
                >
                  Enregistrer
                </DropdownMenuItem>
              )}

              {/* Save-as */}
              <DropdownMenuItem
                onSelect={() => {
                  setSaveAsError(null);
                  setSaveAsOpen(true);
                }}
                disabled={pending}
              >
                Enregistrer sous…
              </DropdownMenuItem>

              {/* Rename */}
              <DropdownMenuItem
                onSelect={() => {
                  setRenameError(null);
                  setRenameOpen(true);
                }}
                disabled={pending}
              >
                Renommer…
              </DropdownMenuItem>

              {/* Shared toggle */}
              <DropdownMenuCheckboxItem
                checked={activeView.shared}
                onCheckedChange={handleToggleShared}
                disabled={pending}
              >
                Partagée
              </DropdownMenuCheckboxItem>

              <DropdownMenuSeparator />

              {/* Delete */}
              <DropdownMenuItem
                variant="destructive"
                onSelect={() => {
                  setDeleteError(null);
                  setDeleteOpen(true);
                }}
                disabled={pending}
              >
                Supprimer
              </DropdownMenuItem>
            </>
          ) : (
            /* Viewer of someone else's shared view, or no active view */
            <DropdownMenuItem
              onSelect={() => {
                setSaveAsError(null);
                setSaveAsOpen(true);
              }}
              disabled={pending}
            >
              Enregistrer sous…
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Save-as dialog */}
      <ViewSaveDialog
        open={saveAsOpen}
        onOpenChange={setSaveAsOpen}
        mode="create"
        pending={pending}
        error={saveAsError}
        onSubmit={handleSaveAs}
      />

      {/* Rename dialog */}
      <ViewSaveDialog
        open={renameOpen}
        onOpenChange={setRenameOpen}
        mode="rename"
        initialName={activeView?.name ?? ""}
        pending={pending}
        error={renameError}
        onSubmit={handleRename}
      />

      {/* Delete confirm dialog */}
      {activeView && (
        <DeleteConfirmDialog
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
          viewName={activeView.name}
          pending={pending}
          error={deleteError}
          onConfirm={handleDelete}
        />
      )}
    </>
  );
}
