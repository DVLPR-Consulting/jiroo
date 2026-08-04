"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X, GitFork, GitPullRequest, GitCommitHorizontal, GitBranch, Link } from "lucide-react";
import { parseGithubRef } from "@/lib/items/github-ref";
import { addRefAction, removeRefAction } from "@/app/actions/refs";
import { toast } from "@/lib/toast";
import type { RefKind } from "@/lib/items/github-ref";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns the appropriate lucide icon component for a ref kind. */
function RefIcon({ kind }: { kind: RefKind | string }) {
  const cls = "size-3.5 flex-none text-muted-foreground";
  switch (kind) {
    case "pr":
      return <GitPullRequest className={cls} />;
    case "commit":
      return <GitCommitHorizontal className={cls} />;
    case "branch":
      return <GitBranch className={cls} />;
    case "repo":
      return <GitFork className={cls} />;
    default:
      return <Link className={cls} />;
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DevRefsSection({
  itemId,
  backlogKey,
  refs,
  canWrite = true,
}: {
  itemId: string;
  backlogKey: string;
  refs: { id: string; url: string; kind: string; createdAt: Date | string }[];
  canWrite?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [url, setUrl] = useState("");

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  function handleAdd() {
    const trimmed = url.trim();
    if (!trimmed) return;
    startTransition(async () => {
      const res = await addRefAction({ backlogKey, itemId, url: trimmed });
      if (res.ok) {
        toast.success("Lien ajouté.");
        setUrl("");
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  function handleRemove(id: string) {
    startTransition(async () => {
      const res = await removeRefAction({ backlogKey, id });
      if (res.ok) {
        toast.success("Lien supprimé.");
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") handleAdd();
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="flex flex-col gap-3">
      {/* Existing refs list */}
      {refs.length === 0 ? (
        <p className="text-xs text-muted-foreground">Aucun lien de développement.</p>
      ) : (
        <div className="flex flex-col gap-1">
          {refs.map((ref) => {
            const meta = parseGithubRef(ref.url);
            const label = meta?.label ?? ref.url;
            const kind = meta?.kind ?? "other";
            return (
              <div
                key={ref.id}
                className="group flex items-center gap-1.5 rounded px-1 py-0.5 hover:bg-[var(--muted)]"
              >
                <RefIcon kind={kind} />
                <a
                  href={ref.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-w-0 flex-1 truncate text-xs text-foreground hover:underline"
                  title={ref.url}
                >
                  {label}
                </a>
                {canWrite && (
                  <button
                    type="button"
                    aria-label={`Supprimer le lien ${label}`}
                    disabled={pending}
                    onClick={() => handleRemove(ref.id)}
                    className="hidden size-5 flex-none items-center justify-center rounded text-muted-foreground hover:bg-[var(--muted)] hover:text-foreground group-hover:flex disabled:opacity-40"
                  >
                    <X className="size-3" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add control */}
      {canWrite && <div className="flex flex-col gap-1.5">
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={pending}
          placeholder="Coller une URL GitHub (PR, commit, branche)…"
          aria-label="URL GitHub à ajouter"
          className="w-full rounded border border-[var(--border-strong)] bg-[var(--surface)] px-2 py-1 text-xs text-foreground outline-none placeholder:text-muted-foreground focus:border-[var(--ring)] disabled:opacity-60"
        />
        <button
          type="button"
          disabled={!url.trim() || pending}
          onClick={handleAdd}
          className="self-start rounded bg-[var(--primary)] px-2.5 py-1 text-xs font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {pending ? "Ajout…" : "Ajouter"}
        </button>
      </div>}
    </div>
  );
}
