"use client";

import { useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { createItemAction, softDeleteItemAction } from "@/app/actions/items";
import { TypeIcon } from "@/components/icons/type-icon";
import { SelectField } from "@/components/ui/select";
import {
  NewItemButton,
  createdHiddenMessage,
  useCurrentViewFilters,
  useOpenCreatedItem,
  type NewItemButtonProps,
} from "@/components/items/new-item-dialog";
import { isHiddenByFilters } from "@/lib/items/filter";
import { ITEM_TITLE_MAX } from "@/lib/validation/item";
import { toast } from "@/lib/toast";

type ParentOption = { id: string; key: string; title: string };

/**
 * Jira's « + Create issue » at the bottom of a backlog section: type a
 * title, press Entrée. Backlog sections only hold tâches, and a tâche
 * requires a parent epic (JIR-69), so the epic is picked inline too
 * (pre-selected from the last one used, or the only one). « Plus
 * d’options » opens the full creation dialog for the same section.
 */
export function InlineCreateItem({
  backlogId,
  backlogKey,
  sprintId,
  contextLabel,
  parents,
  parentId,
  onParentChange,
  dialogProps,
}: {
  backlogId: string;
  backlogKey: string;
  sprintId: string | null;
  contextLabel: string;
  parents: ParentOption[];
  parentId: string;
  onParentChange: (parentId: string) => void;
  dialogProps?: Pick<NewItemButtonProps, "items" | "statuses" | "canScheduleItems" | "releaseOptions" | "fieldOptions" | "viewFilters">;
}) {
  const router = useRouter();
  const openCreated = useOpenCreatedItem();
  const currentViewFilters = useCurrentViewFilters(dialogProps?.viewFilters);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const openerRef = useRef<HTMLButtonElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const parentRef = useRef<HTMLButtonElement>(null);
  // Set once the full dialog created at least one item: closing it then also
  // closes this form; a cancelled dialog returns to the inline draft.
  const createdFromDialog = useRef(false);
  const errorId = useId();
  const selectedParent = parents.some((parent) => parent.id === parentId) ? parentId : "";

  function close() {
    setOpen(false);
    setTitle("");
    setError(null);
    requestAnimationFrame(() => openerRef.current?.focus());
  }

  function submit(event: React.FormEvent) {
    // The « Plus d’options » dialog is portaled but its submit still bubbles
    // through the React tree: only this form's own submit creates here.
    if (event.target !== event.currentTarget) return;
    event.preventDefault();
    const trimmed = title.trim();
    if (!trimmed || pending) return;
    if (!selectedParent) {
      setError("Choisissez l’epic parent.");
      parentRef.current?.focus();
      return;
    }
    setError(null);
    const sentSprintIds = sprintId ? [sprintId] : [];
    startTransition(async () => {
      try {
        const result = await createItemAction({
          backlogKey,
          backlogId,
          type: "tache",
          kind: "feature",
          parentId: selectedParent,
          title: trimmed,
          sprintId,
        });
        if (!result.ok) {
          const fieldError =
            "fieldErrors" in result ? result.fieldErrors?.title?.[0] : undefined;
          setError(fieldError ?? result.error);
          return;
        }
        const item = result.item;
        // Like Jira, the field stays open for the next item.
        setTitle("");
        titleRef.current?.focus();
        // Left out by the view's filters of now (e.g. no filtered Version):
        // say so, and offer to open it like the full dialog does (JIR-92).
        const hidden = isHiddenByFilters(
          { ...item, sprintIds: sentSprintIds },
          currentViewFilters(),
        );
        toast.success(hidden ? createdHiddenMessage(item.key) : `${item.key} créé.`, {
          ...(hidden
            ? { secondaryAction: { label: "Ouvrir", run: () => openCreated(item.key) } }
            : {}),
          action: {
            label: "Annuler",
            run: async () => {
              const undoResult = await softDeleteItemAction({ id: item.id, backlogKey });
              if (!undoResult.ok) throw new Error(undoResult.error);
              router.refresh();
            },
          },
        });
        router.refresh();
      } catch {
        setError("Création impossible.");
      }
    });
  }

  if (!open) {
    return (
      <button
        ref={openerRef}
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-10 w-full items-center gap-2 rounded-b-[var(--radius-lg)] px-4 text-left text-[13.5px] text-muted-foreground outline-none hover:bg-[var(--muted)] hover:text-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ring)]"
      >
        <Plus aria-hidden className="size-3.5" />
        Créer un item{" "}<span className="sr-only">dans {contextLabel}</span>
      </button>
    );
  }

  return (
    <form
      onSubmit={submit}
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        // Keys from the portaled dialog bubble through React, not through the DOM.
        if (!event.currentTarget.contains(event.target as Node)) return;
        event.preventDefault();
        event.stopPropagation();
        if (!pending) close();
      }}
      className="flex flex-wrap items-center gap-2 border-t border-border px-3 py-2 sm:px-3.5"
      aria-label={`Créer un item dans ${contextLabel}`}
    >
      <TypeIcon type="tache" />
      <input
        ref={titleRef}
        value={title}
        onChange={(event) => {
          setTitle(event.target.value);
          if (error) setError(null);
        }}
        aria-label={`Titre du nouvel item dans ${contextLabel}`}
        aria-describedby={error ? errorId : undefined}
        aria-invalid={error ? true : undefined}
        placeholder="Que faut-il faire ?"
        maxLength={ITEM_TITLE_MAX}
        // Read-only, not disabled, while saving: the field keeps focus for the next item.
        readOnly={pending}
        aria-busy={pending || undefined}
        autoFocus
        className="h-8 min-w-0 flex-1 basis-48 rounded-[var(--radius)] border border-[var(--border-strong)] bg-transparent px-2.5 text-sm outline-none focus-visible:border-[var(--ring)] focus-visible:ring-2 focus-visible:ring-[var(--ring)]/40"
      />
      {parents.length > 0 ? (
        <SelectField
          triggerRef={parentRef}
          value={selectedParent}
          onValueChange={(next) => {
            onParentChange(next);
            if (error) setError(null);
          }}
          aria-label="Epic parent"
          placeholder="Epic parent…"
          disabled={pending}
          className="w-56 max-w-full"
          options={parents.map((parent) => ({
            value: parent.id,
            label: `${parent.key} — ${parent.title}`,
            icon: <TypeIcon type="epic" size={14} />,
          }))}
        />
      ) : (
        // The Backlog shows its « Nouvelle Epic » step instead while the
        // backlog has no Epic (JIR-88); this only covers a caller without it.
        <p className="text-xs text-muted-foreground">
          Aucune Epic dans ce backlog : une Tâche se rattache toujours à une Epic.
        </p>
      )}
      {dialogProps ? (
        <NewItemButton
          backlogId={backlogId}
          backlogKey={backlogKey}
          {...dialogProps}
          sprintId={sprintId}
          contextLabel={contextLabel}
          initialTitle={title}
          initialParentId={selectedParent}
          // A create only clears the inline draft: the dialog host must stay
          // mounted so « Créer un autre » can keep the dialog open.
          onCreated={() => {
            createdFromDialog.current = true;
            setTitle("");
            setError(null);
          }}
          onClosed={() => {
            if (!createdFromDialog.current) return;
            createdFromDialog.current = false;
            close();
          }}
          trigger={
            <button
              type="button"
              // The draft is already being created inline: the full dialog
              // must not be able to send it a second time.
              disabled={pending}
              className="h-8 rounded-[var(--radius)] px-2 text-xs font-medium text-muted-foreground outline-none hover:bg-[var(--muted)] hover:text-foreground focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Plus d’options
            </button>
          }
        />
      ) : null}
      <span className="basis-full text-xs text-muted-foreground">
        Entrée pour créer, Échap pour annuler.
      </span>
      {error ? (
        <p id={errorId} role="alert" className="basis-full text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </form>
  );
}
