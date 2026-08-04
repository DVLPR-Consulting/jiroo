"use client";

import { useState, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { X } from "lucide-react";
import { TypeIcon } from "@/components/icons/type-icon";
import { StatusDot } from "@/components/icons/status-dot";
import { ItemKey } from "@/components/jiroo/item-key";
import { useViewUrlState } from "@/components/shell/view-url-state";
import { LINK_TYPES, LINK_TYPE_META, groupLinksForDisplay } from "@/lib/items/links";
import { addLinkAction, removeLinkAction } from "@/app/actions/links";
import { toast } from "@/lib/toast";
import type { LinkWithOther } from "@/lib/services/links";
import type { ItemType, StatusId } from "@/lib/design/constants";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Case/accent-insensitive normaliser (mirrors lib/items/filter.ts). */
function normalize(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function LinksSection({
  itemId,
  backlogKey,
  links,
  candidates,
}: {
  itemId: string;
  backlogKey: string;
  links: LinkWithOther[];
  candidates: { id: string; key: string; title: string; type: ItemType }[];
}) {
  const router = useRouter();
  const viewUrl = useViewUrlState();
  const [pending, startTransition] = useTransition();

  // Add-link form state
  const [linkType, setLinkType] = useState<(typeof LINK_TYPES)[number]>("blocks");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Collect ids already linked (any direction) to exclude from the picker
  const linkedIds = new Set(links.map((l) => l.other.id));

  // Filter candidates: exclude self + already linked, match query
  const filtered =
    query.trim() === ""
      ? []
      : candidates
          .filter((c) => c.id !== itemId && !linkedIds.has(c.id))
          .filter((c) =>
            normalize(`${c.key} ${c.title}`).includes(normalize(query)),
          )
          .slice(0, 8);

  // Group existing links for display
  const groups = groupLinksForDisplay(links, itemId);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  function handleSelectCandidate(c: { id: string; key: string; title: string }) {
    setSelectedId(c.id);
    setQuery(`${c.key} — ${c.title}`);
    setOpen(false);
    inputRef.current?.blur();
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    setQuery(val);
    setSelectedId(null);
    setOpen(true);
  }

  function handleAdd() {
    if (!selectedId) return;
    startTransition(async () => {
      const res = await addLinkAction({
        backlogKey,
        sourceId: itemId,
        targetId: selectedId,
        type: linkType,
      });
      if (res.ok) {
        toast.success("Lien ajouté.");
        setQuery("");
        setSelectedId(null);
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
      {groups.length === 0 && (
        <p className="text-xs text-muted-foreground">Aucun lien.</p>
      )}

      {groups.map((group) => (
        <div key={group.label} className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">
            {group.label}
          </span>
          {group.items.map((link) => (
            <div
              key={link.id}
              className="group flex items-center gap-1.5 rounded px-1 py-0.5 hover:bg-[var(--muted)]"
            >
              {/* Status dot */}
              <StatusDot status={link.other.statusId as StatusId} />
              {/* TypeIcon + key + title — whole row links to the item */}
              <Link
                href={viewUrl.href((params) => params.set("item", link.other.key))}
                onNavigate={(event) => {
                  event.preventDefault();
                  viewUrl.push((params) => params.set("item", link.other.key));
                }}
                className="flex min-w-0 flex-1 items-center gap-1 text-sm hover:underline"
              >
                <TypeIcon type={link.other.type} size={13} />
                <ItemKey value={link.other.key} />
                <span className="truncate text-foreground">{link.other.title}</span>
              </Link>
              {/* Remove button */}
              <button
                type="button"
                aria-label={`Supprimer le lien vers ${link.other.key}`}
                disabled={pending}
                onClick={() => handleRemove(link.id)}
                className="hidden size-5 flex-none items-center justify-center rounded text-muted-foreground hover:bg-[var(--muted)] hover:text-foreground group-hover:flex disabled:opacity-40"
              >
                <X className="size-3" />
              </button>
            </div>
          ))}
        </div>
      ))}

      {/* Add-link form */}
      <div className="flex flex-col gap-1.5">
        {/* Relation type select */}
        <select
          value={linkType}
          onChange={(e) => setLinkType(e.target.value as (typeof LINK_TYPES)[number])}
          disabled={pending}
          className="w-full rounded border border-[var(--border-strong)] bg-[var(--surface)] px-2 py-1 text-xs text-foreground outline-none focus:border-[var(--ring)] disabled:opacity-60"
          aria-label="Type de relation"
        >
          {LINK_TYPES.map((t) => (
            <option key={t} value={t}>
              {LINK_TYPE_META[t].forward}
            </option>
          ))}
        </select>

        {/* Item typeahead */}
        <div className="relative">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={handleInputChange}
            onFocus={() => {
              if (query && !selectedId) setOpen(true);
            }}
            onBlur={() => {
              // Delay so mousedown on a candidate fires first
              setTimeout(() => setOpen(false), 150);
            }}
            disabled={pending}
            placeholder="Rechercher un item…"
            aria-label="Rechercher un item à lier"
            className="w-full rounded border border-[var(--border-strong)] bg-[var(--surface)] px-2 py-1 text-xs text-foreground outline-none placeholder:text-muted-foreground focus:border-[var(--ring)] disabled:opacity-60"
          />

          {/* Dropdown */}
          {open && filtered.length > 0 && (
            <ul
              role="listbox"
              aria-label="Items correspondants"
              className="absolute left-0 top-full z-50 mt-0.5 max-h-48 w-full overflow-y-auto rounded border border-[var(--border-strong)] bg-popover py-1 shadow-md"
            >
              {filtered.map((c) => (
                <li key={c.id} role="option" aria-selected={false}>
                  <button
                    type="button"
                    // mousedown fires before blur so we can capture the selection
                    onMouseDown={(e) => {
                      e.preventDefault();
                      handleSelectCandidate(c);
                    }}
                    className="flex w-full items-center gap-1.5 px-2 py-1 text-left text-xs hover:bg-[var(--muted)]"
                  >
                    <TypeIcon type={c.type} size={12} />
                    <span className="item-key">{c.key}</span>
                    <span className="truncate text-foreground">{c.title}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Add button */}
        <button
          type="button"
          disabled={!selectedId || pending}
          onClick={handleAdd}
          className="self-start rounded bg-[var(--primary)] px-2.5 py-1 text-xs font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {pending ? "Ajout…" : "Ajouter le lien"}
        </button>
      </div>
    </div>
  );
}
