"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X, GitFork, GitPullRequest, GitCommitHorizontal, GitBranch, GitPullRequestArrow, Link } from "lucide-react";
import { ForgeIcon } from "@/components/icons/forge-icon";
import { parseGithubRef } from "@/lib/items/github-ref";
import {
  groupDevRefs,
  pullRequestNumber,
  REF_STATE_LABELS,
  refRepository,
  shortCommitSha,
  type DevRef,
} from "@/lib/items/dev-refs";
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

/** Commits shown before « Voir tout ». */
export const COMMITS_SHOWN = 5;

const refDateFmt = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" });

const STATE_STYLES = {
  open: "bg-[var(--status-done-bg)] text-[var(--status-done)]",
  merged: "bg-[var(--status-review-bg)] text-[var(--status-review)]",
  closed: "bg-[var(--muted)] text-[var(--danger)]",
} as const;

function RefGroup({ label, children }: { label: string; children: React.ReactNode }) {
  const id = useId();
  return (
    <div role="group" aria-labelledby={id} className="flex flex-col gap-0.5">
      <p id={id} className="px-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <ul className="flex flex-col gap-0.5">{children}</ul>
    </div>
  );
}

function RefMeta({ refData }: { refData: DevRef }) {
  const parts = [
    refRepository(refData.url),
    refData.authorName,
    refData.occurredAt ? refDateFmt.format(new Date(refData.occurredAt)) : null,
  ].filter(Boolean);
  return parts.length > 0 ? (
    <span className="block truncate pl-[22px] text-[11px] text-muted-foreground">{parts.join(" · ")}</span>
  ) : null;
}

type RemoveRef = { label: (ref: DevRef) => string; onRemove: (id: string) => void; pending: boolean };

function DetectedRef({ refData, icon, label, remove }: {
  refData: DevRef;
  icon: React.ReactNode;
  label: React.ReactNode;
  remove?: RemoveRef;
}) {
  // A reference outlives its deleted connection; it can then be removed.
  const removable = remove && refData.connectionId === null;
  return (
    <li className="group rounded px-1 py-0.5 hover:bg-[var(--muted)]">
      <div className="flex min-w-0 items-center gap-1.5">
        {refData.provider && <ForgeIcon provider={refData.provider} className="text-muted-foreground" />}
        <a
          href={refData.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex min-w-0 flex-1 items-center gap-1.5 text-xs text-foreground hover:underline"
          title={refData.url}
        >
          {icon}
          <span className="min-w-0 truncate">{label}</span>
        </a>
        {refData.state && (
          <span className={`flex-none rounded-full px-1.5 py-px text-[10.5px] font-medium ${STATE_STYLES[refData.state]}`}>
            {REF_STATE_LABELS[refData.state]}
          </span>
        )}
        {removable && (
          <button
            type="button"
            aria-label={`Supprimer le lien ${remove.label(refData)}`}
            disabled={remove.pending}
            onClick={() => remove.onRemove(refData.id)}
            className="pointer-events-none inline-flex size-5 flex-none items-center justify-center rounded text-muted-foreground opacity-0 hover:bg-[var(--muted)] hover:text-foreground group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100 focus-visible:pointer-events-auto focus-visible:opacity-100 disabled:opacity-40"
          >
            <X className="size-3" />
          </button>
        )}
      </div>
      <RefMeta refData={refData} />
    </li>
  );
}

/** References detected from connected repositories (JIR-95), grouped like Jira. */
function DetectedRefs({ refs, remove }: { refs: DevRef[]; remove?: RemoveRef }) {
  const [showAllCommits, setShowAllCommits] = useState(false);
  const { pullRequests, branches, commits } = groupDevRefs(refs);
  const iconClass = "size-3.5 flex-none text-muted-foreground";
  const providers = new Set(pullRequests.map((ref) => ref.provider));
  const pullRequestLabel = providers.size === 1 && providers.has("gitlab")
    ? "Merge requests"
    : providers.has("gitlab") ? "Pull / merge requests" : "Pull requests";
  const shownCommits = showAllCommits ? commits : commits.slice(0, COMMITS_SHOWN);
  return (
    <>
      {pullRequests.length > 0 && (
        <RefGroup label={pullRequestLabel}>
          {pullRequests.map((ref) => (
            <DetectedRef
              key={ref.id}
              refData={ref}
              remove={remove}
              icon={<GitPullRequest className={iconClass} aria-hidden />}
              label={<><span className="text-muted-foreground">{pullRequestNumber(ref)}</span> {ref.title}</>}
            />
          ))}
        </RefGroup>
      )}
      {branches.length > 0 && (
        <RefGroup label="Branches">
          {branches.map((ref) => (
            <DetectedRef
              key={ref.id}
              refData={ref}
              remove={remove}
              icon={<GitBranch className={iconClass} aria-hidden />}
              label={<span className="font-mono text-[11.5px]">{ref.title}</span>}
            />
          ))}
        </RefGroup>
      )}
      {commits.length > 0 && (
        <RefGroup label={`Commits (${commits.length})`}>
          {shownCommits.map((ref) => (
            <DetectedRef
              key={ref.id}
              refData={ref}
              remove={remove}
              icon={<GitCommitHorizontal className={iconClass} aria-hidden />}
              label={<><span className="font-mono text-[11.5px] text-muted-foreground">{shortCommitSha(ref.url)}</span> {ref.title}</>}
            />
          ))}
          {commits.length > COMMITS_SHOWN && (
            <li>
              <button
                type="button"
                aria-expanded={showAllCommits}
                onClick={() => setShowAllCommits((value) => !value)}
                className="px-1 text-xs text-[var(--primary)] hover:underline"
              >
                {showAllCommits ? "Réduire" : `Voir tout (${commits.length})`}
              </button>
            </li>
          )}
        </RefGroup>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DevRefsSection({
  itemId,
  backlogKey,
  refs,
  canLink = true,
}: {
  itemId: string;
  backlogKey: string;
  refs: DevRef[];
  canLink?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const manualRefs = refs.filter((ref) => !ref.provider);
  const [url, setUrl] = useState("");
  // The URL form stays behind « Lier une PR ou un commit » until asked for.
  const [formOpen, setFormOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (formOpen) inputRef.current?.focus();
  }, [formOpen]);

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
        setFormOpen(false);
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
    if (e.key === "Escape") {
      // Close the form, not the drawer.
      e.preventDefault();
      setUrl("");
      setFormOpen(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="flex flex-col gap-3">
      {/* References detected from connected repositories (JIR-95) */}
      {refs.length > manualRefs.length && (
        <DetectedRefs
          refs={refs}
          remove={canLink ? {
            label: (ref) => ref.title ?? ref.url,
            onRemove: handleRemove,
            pending,
          } : undefined}
        />
      )}

      {/* Links added by hand */}
      {refs.length === 0 ? (
        canLink ? null : (
          <p className="text-xs text-muted-foreground">Aucun lien de développement.</p>
        )
      ) : manualRefs.length === 0 ? null : (
        <div className="flex flex-col gap-1">
          {manualRefs.map((ref) => {
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
                {canLink && (
                  <button
                    type="button"
                    aria-label={`Supprimer le lien ${label}`}
                    disabled={pending}
                    onClick={() => handleRemove(ref.id)}
                    className="pointer-events-none inline-flex size-5 flex-none items-center justify-center rounded text-muted-foreground opacity-0 hover:bg-[var(--muted)] hover:text-foreground group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100 focus-visible:pointer-events-auto focus-visible:opacity-100 disabled:opacity-40"
                  >
                    <X className="size-3" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {canLink && !formOpen && (
        <button
          type="button"
          onClick={() => setFormOpen(true)}
          className="flex h-9 items-center gap-2.5 rounded-[var(--radius)] px-2 text-left text-[13.5px] text-foreground hover:bg-[var(--muted)]"
        >
          <GitPullRequestArrow className="size-4 flex-none" aria-hidden />
          Lier une PR ou un commit
        </button>
      )}

      {/* Add control */}
      {canLink && formOpen && <div data-local-escape className="flex flex-col gap-1.5">
        <input
          ref={inputRef}
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
