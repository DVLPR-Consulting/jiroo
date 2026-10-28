"use client";

import { useEffect, useState, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { ItemPicker, type ItemChoice } from "@/components/items/item-picker";
import { ItemRow } from "@/components/items/item-row";
import { useViewUrlState } from "@/components/shell/view-url-state";
import { LINK_TYPES, LINK_TYPE_META, groupLinksForDisplay } from "@/lib/items/links";
import { addLinkAction, removeLinkAction } from "@/app/actions/links";
import { toast } from "@/lib/toast";
import type { LinkWithOther } from "@/lib/services/links";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function LinksSection({
  itemId,
  backlogKey,
  links,
  canLink = true,
  openRequest = 0,
}: {
  itemId: string;
  backlogKey: string;
  links: LinkWithOther[];
  canLink?: boolean;
  /** Incremented by the drawer's « Lier un item » action to open the form. */
  openRequest?: number;
}) {
  const router = useRouter();
  const viewUrl = useViewUrlState();
  const [pending, startTransition] = useTransition();

  // Add-link form state
  const [linkType, setLinkType] = useState<(typeof LINK_TYPES)[number]>("blocks");
  // Picked by searching the backlog on demand (JIR-118).
  const [selected, setSelected] = useState<ItemChoice | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // The add form stays behind « + Lier un item » until asked for (Jira).
  const [formOpen, setFormOpen] = useState(false);
  const [handledRequest, setHandledRequest] = useState(openRequest);
  const [focusRequest, setFocusRequest] = useState(0);
  if (openRequest !== handledRequest) {
    setHandledRequest(openRequest);
    setFormOpen(true);
    setFocusRequest((request) => request + 1);
  }
  useEffect(() => {
    if (focusRequest > 0) inputRef.current?.focus();
  }, [focusRequest]);

  function openForm() {
    setFormOpen(true);
    setFocusRequest((request) => request + 1);
  }

  function closeForm() {
    setFormOpen(false);
    setSelected(null);
  }

  // The item itself and what it is already linked to (any direction) are
  // left out of the choices.
  const excludeIds = [itemId, ...links.map((l) => l.other.id)];

  // Group existing links for display
  const groups = groupLinksForDisplay(links, itemId);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  function handleAdd() {
    if (!selected) return;
    startTransition(async () => {
      const res = await addLinkAction({
        backlogKey,
        sourceId: itemId,
        targetId: selected.id,
        type: linkType,
      });
      if (res.ok) {
        toast.success("Lien ajouté.");
        closeForm();
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  function handleRemove(id: string) {
    startTransition(async () => {
      const res = await removeLinkAction({ backlogKey, id });
      if (res.ok) {
        toast.success("Lien supprimé.");
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="flex flex-col gap-3">
      {/* Existing links grouped by label */}
      {groups.length === 0 && !canLink && (
        <p className="text-sm text-muted-foreground">Aucun item lié.</p>
      )}

      {groups.map((group) => (
        <div key={group.label} className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">
            {group.label}
          </span>
          {/* The Backlog row (JIR-93), with the removal at its end. */}
          <ul className="overflow-hidden rounded-[var(--radius-md)] border border-border bg-card">
            {group.items.map((link) => (
              <ItemRow
                key={link.id}
                as="li"
                href={viewUrl.href((params) => params.set("item", link.other.key))}
                onNavigate={(event) => {
                  event.preventDefault();
                  viewUrl.push((params) => params.set("item", link.other.key));
                }}
                item={{
                  id: link.other.id,
                  key: link.other.key,
                  title: link.other.title,
                  type: link.other.type,
                  status: { name: link.other.statusName, category: link.other.statusCategory },
                }}
                trailing={
                  canLink ? (
                    <button
                      type="button"
                      aria-label={`Supprimer le lien vers ${link.other.key}`}
                      disabled={pending}
                      onClick={() => handleRemove(link.id)}
                      className="pointer-events-none inline-flex size-5 flex-none items-center justify-center rounded text-muted-foreground opacity-0 hover:bg-[var(--muted)] hover:text-foreground group-hover/row:pointer-events-auto group-hover/row:opacity-100 group-focus-within/row:pointer-events-auto group-focus-within/row:opacity-100 focus-visible:pointer-events-auto focus-visible:opacity-100 disabled:opacity-40"
                    >
                      <X className="size-3" />
                    </button>
                  ) : undefined
                }
              />
            ))}
          </ul>
        </div>
      ))}

      {canLink && !formOpen && (
        <button
          type="button"
          onClick={openForm}
          className="flex h-10 items-center gap-1 rounded-[var(--radius-md)] border border-dashed border-[var(--border-strong)] bg-[var(--surface)] px-3.5 text-left text-[13.5px] text-muted-foreground hover:bg-[var(--muted)] hover:text-foreground"
        >
          + Lier un item
          <span className="text-[var(--subtle-foreground)]">· Bloque, Lié à, Duplique</span>
        </button>
      )}

      {/* Add-link form */}
      {canLink && formOpen && <div
        data-local-escape
        className="flex flex-col gap-1.5"
        onKeyDown={(event) => {
          // Escape closes the form, not the drawer (the picker's open list
          // takes it first and stops it here).
          if (event.key === "Escape") {
            event.preventDefault();
            closeForm();
          }
        }}
      >
        {/* Relation type select */}
        <select
          value={linkType}
          onChange={(e) => setLinkType(e.target.value as (typeof LINK_TYPES)[number])}
          disabled={pending}
          className="w-full rounded border border-[var(--border-strong)] bg-card px-2 py-1 text-xs text-foreground outline-none focus:border-[var(--ring)] disabled:opacity-60"
          aria-label="Type de relation"
        >
          {LINK_TYPES.map((t) => (
            <option key={t} value={t}>
              {LINK_TYPE_META[t].forward}
            </option>
          ))}
        </select>

        {/* The item to link, searched in the backlog (JIR-118). */}
        <ItemPicker
          inputRef={inputRef}
          backlogKey={backlogKey}
          excludeIds={excludeIds}
          value={selected}
          onChange={setSelected}
          disabled={pending}
          placeholder="Rechercher un item…"
          aria-label="Rechercher un item à lier"
        />

        <div className="flex gap-2">
          <button
            type="button"
            disabled={!selected || pending}
            onClick={handleAdd}
            className="rounded-[var(--radius)] bg-[var(--primary)] px-2.5 py-1 text-xs font-medium text-[var(--primary-foreground)] hover:bg-[var(--primary-hover)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {pending ? "Ajout…" : "Ajouter le lien"}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={closeForm}
            className="rounded-[var(--radius)] px-2.5 py-1 text-xs text-muted-foreground hover:bg-[var(--muted)]"
          >
            Annuler
          </button>
        </div>
      </div>}
    </div>
  );
}
