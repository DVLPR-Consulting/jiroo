/**
 * An item's development references as the drawer receives them: manual
 * GitHub links (no provider) and references detected from repository
 * webhooks (JIR-95).
 */
export type DevRef = {
  id: string;
  url: string;
  kind: string;
  createdAt: Date | string;
  provider?: "github" | "gitlab" | null;
  title?: string | null;
  authorName?: string | null;
  state?: "open" | "merged" | "closed" | null;
  occurredAt?: Date | string | null;
};

export type GroupedDevRefs = {
  pullRequests: DevRef[];
  branches: DevRef[];
  commits: DevRef[];
  manual: DevRef[];
};

function time(ref: DevRef): number {
  return new Date(ref.occurredAt ?? ref.createdAt).getTime();
}

/**
 * Jira's development panel: pull / merge requests, branches and commits,
 * each most recent first; manual links keep their order of addition.
 */
export function groupDevRefs(refs: readonly DevRef[]): GroupedDevRefs {
  const recentFirst = (a: DevRef, b: DevRef) => time(b) - time(a);
  const detected = refs.filter((ref) => ref.provider);
  return {
    pullRequests: detected.filter((ref) => ref.kind === "pr").sort(recentFirst),
    branches: detected.filter((ref) => ref.kind === "branch").sort(recentFirst),
    commits: detected.filter((ref) => ref.kind === "commit").sort(recentFirst),
    manual: refs.filter((ref) => !ref.provider),
  };
}

/** The short SHA shown for a commit, from its link. */
export function shortCommitSha(url: string): string | null {
  const sha = /\/commit\/([0-9a-f]{7,64})$/i.exec(url)?.[1];
  return sha ? sha.slice(0, 7) : null;
}

/** `#42` for a GitHub pull request, `!7` for a GitLab merge request. */
export function pullRequestNumber(ref: Pick<DevRef, "url" | "provider">): string | null {
  const number = /\/(?:pull|merge_requests)\/(\d+)$/.exec(ref.url)?.[1];
  if (!number) return null;
  return ref.provider === "gitlab" ? `!${number}` : `#${number}`;
}

/** The repository of a webhook reference, from its link. */
export function refRepository(url: string): string | null {
  try {
    const path = new URL(url).pathname;
    const match = /^\/(.+?)(?:\/-)?\/(?:pull|merge_requests|commit|tree)\//.exec(path);
    return match ? decodeURIComponent(match[1]!) : null;
  } catch {
    return null;
  }
}

export const REF_STATE_LABELS = {
  open: "Ouverte",
  merged: "Fusionnée",
  closed: "Fermée",
} as const;
