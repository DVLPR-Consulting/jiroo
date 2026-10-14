"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createLucideIcon, Link, X } from "lucide-react";
import { addWebLinkAction, removeWebLinkAction } from "@/app/actions/web-links";
import { webLinkKind, webLinkLabel } from "@/lib/items/web-links";
import { toast } from "@/lib/toast";

// The installed lucide-react version no longer exports brand icons.
const Figma = createLucideIcon("Figma", [
  ["path", { d: "M12 3H9a3 3 0 0 0 0 6h3V3Z", key: "top-left" }],
  ["path", { d: "M12 3h3a3 3 0 0 1 0 6h-3V3Z", key: "top-right" }],
  ["path", { d: "M12 9H9a3 3 0 0 0 0 6h3V9Z", key: "middle-left" }],
  ["circle", { cx: "15", cy: "12", r: "3", key: "middle-right" }],
  ["path", { d: "M12 15H9a3 3 0 1 0 3 3v-3Z", key: "bottom-left" }],
]);

export function WebLinksSection({
  itemId,
  backlogKey,
  webLinks,
  canLink,
}: {
  itemId: string;
  backlogKey: string;
  webLinks: { id: string; url: string; title: string | null; createdAt: Date | string }[];
  canLink: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [formOpen, setFormOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (formOpen) inputRef.current?.focus();
  }, [formOpen]);

  function closeForm() {
    setUrl("");
    setTitle("");
    setFormOpen(false);
  }

  function handleAdd() {
    const trimmed = url.trim();
    if (!trimmed || pending) return;
    startTransition(async () => {
      const res = await addWebLinkAction({ backlogKey, itemId, url: trimmed, title: title.trim() });
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
      const res = await removeWebLinkAction({ backlogKey, id });
      if (res.ok) {
        toast.success("Lien supprimé.");
        closeForm();
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  if (!canLink && webLinks.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      {webLinks.length > 0 && (
        <ul className="flex flex-col gap-1">
          {webLinks.map((link) => {
            const label = webLinkLabel(link.url, link.title);
            const Icon = webLinkKind(link.url) === "figma" ? Figma : Link;
            return (
              <li
                key={link.id}
                className="group flex items-center gap-1.5 rounded px-1 py-0.5 hover:bg-[var(--muted)]"
              >
                <Icon className="size-3.5 flex-none text-muted-foreground" aria-hidden />
                <a
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={link.url}
                  className="min-w-0 flex-1 truncate text-xs text-foreground hover:underline"
                >
                  {label}
                </a>
                {canLink && (
                  <button
                    type="button"
                    aria-label={`Supprimer le lien ${label}`}
                    disabled={pending}
                    onClick={() => handleRemove(link.id)}
                    className="pointer-events-none inline-flex size-5 flex-none items-center justify-center rounded text-muted-foreground opacity-0 hover:bg-[var(--muted)] hover:text-foreground group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100 focus-visible:pointer-events-auto focus-visible:opacity-100 disabled:opacity-40"
                  >
                    <X className="size-3" aria-hidden />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {canLink && !formOpen && (
        <button
          type="button"
          onClick={() => setFormOpen(true)}
          className={webLinks.length === 0
            ? "flex h-10 items-center gap-1 rounded-[var(--radius-md)] border border-dashed border-[var(--border-strong)] bg-[var(--surface)] px-3.5 text-left text-[13.5px] text-muted-foreground hover:bg-[var(--muted)] hover:text-foreground"
            : "self-start rounded px-2 py-1 text-xs text-muted-foreground hover:bg-[var(--muted)] hover:text-foreground"}
        >
          {webLinks.length === 0 ? "+ Ajouter un lien web" : "Ajouter un lien web"}
        </button>
      )}

      {canLink && formOpen && (
        <form
          data-local-escape
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            handleAdd();
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              // Close the form without closing the detail drawer.
              event.preventDefault();
              closeForm();
            }
          }}
          className="flex flex-col gap-1.5"
        >
          <input
            ref={inputRef}
            type="url"
            aria-label="URL du lien"
            placeholder="https://… (maquette Figma, spec, document)"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            disabled={pending}
            className="w-full rounded border border-[var(--border-strong)] bg-[var(--surface)] px-2 py-1 text-xs text-foreground outline-none placeholder:text-muted-foreground focus:border-[var(--ring)] disabled:opacity-60"
          />
          <input
            type="text"
            aria-label="Texte affiché"
            placeholder="Texte affiché (facultatif)"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            disabled={pending}
            className="w-full rounded border border-[var(--border-strong)] bg-[var(--surface)] px-2 py-1 text-xs text-foreground outline-none placeholder:text-muted-foreground focus:border-[var(--ring)] disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={!url.trim() || pending}
            className="self-start rounded bg-[var(--primary)] px-2.5 py-1 text-xs font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {pending ? "Ajout…" : "Ajouter"}
          </button>
        </form>
      )}
    </div>
  );
}
