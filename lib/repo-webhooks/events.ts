import { z } from "zod";

/**
 * GitHub and GitLab webhook payloads reduced to what the development panel
 * needs (JIR-95): pull / merge requests, branches and commits, each with the
 * texts that may mention an item key. Minimal data only: the first line of a
 * commit message, display names, no email, no diff.
 */

export type RepoProvider = "github" | "gitlab";
export type DevRefKind = "pr" | "branch" | "commit";
export type DevRefState = "open" | "merged" | "closed";

export type DevRefCandidate = {
  kind: DevRefKind;
  /** Repository-scoped identity: PR/MR number, branch name or commit SHA. */
  id: string;
  title: string;
  authorName: string | null;
  state: DevRefState | null;
  occurredAt: Date;
  /** Texts scanned for item keys. */
  texts: string[];
};

export type ParsedWebhook =
  | { type: "ping" }
  | { type: "ignored" }
  | { type: "references"; repositoryPath: string; refs: DevRefCandidate[] };

export class WebhookPayloadError extends Error {
  constructor() {
    super("Payload de webhook illisible.");
    this.name = "WebhookPayloadError";
  }
}

const MAX_TITLE = 500;
const MAX_AUTHOR = 200;
/** GitHub and GitLab already cap a push payload at 20 commits. */
const MAX_COMMITS = 100;

const text = z.string();
const optionalText = z.string().nullish();

function clip(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function displayName(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? clip(trimmed, MAX_AUTHOR) : null;
}

/** First line of a commit message, the only part Jiroo keeps. */
export function commitTitle(message: string): string {
  return clip((message.split(/\r?\n/, 1)[0] ?? "").trim(), MAX_TITLE);
}

/** Parses ISO and GitLab's `2026-10-12 12:20:00 UTC` dates; falls back to `now`. */
function parseDate(value: string | null | undefined, now: Date): Date {
  if (!value) return now;
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) return parsed;
  const gitlab = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) UTC$/.exec(value);
  if (gitlab) {
    const iso = new Date(`${gitlab[1]}T${gitlab[2]}Z`);
    if (!Number.isNaN(iso.getTime())) return iso;
  }
  return now;
}

const BRANCH_REF = /^refs\/heads\/(.+)$/;
const ZERO_SHA = /^0+$/;
const SHA = /^[0-9a-f]{7,64}$/i;

function branchCandidate(input: {
  branch: string;
  authorName: string | null;
  occurredAt: Date;
}): DevRefCandidate {
  return {
    kind: "branch",
    id: input.branch,
    title: clip(input.branch, MAX_TITLE),
    authorName: input.authorName,
    state: null,
    occurredAt: input.occurredAt,
    texts: [input.branch],
  };
}

const commitSchema = z.object({
  id: text.regex(SHA),
  message: text,
  timestamp: optionalText,
  author: z.object({ name: optionalText }).nullish(),
});

function commitCandidates(
  commits: z.infer<typeof commitSchema>[],
  now: Date,
): DevRefCandidate[] {
  return commits.slice(0, MAX_COMMITS).map((commit) => {
    const title = commitTitle(commit.message);
    return {
      kind: "commit",
      id: commit.id.toLowerCase(),
      title,
      authorName: displayName(commit.author?.name),
      state: null,
      occurredAt: parseDate(commit.timestamp, now),
      texts: [title],
    };
  });
}

function parseOrThrow<T extends z.ZodType>(schema: T, payload: unknown): z.infer<T> {
  const result = schema.safeParse(payload);
  if (!result.success) throw new WebhookPayloadError();
  return result.data;
}

// ---------------------------------------------------------------------------
// GitHub
// ---------------------------------------------------------------------------

const githubRepository = z.object({ full_name: text.min(3) });

const githubPush = z.object({
  ref: text,
  deleted: z.boolean().nullish(),
  commits: z.array(commitSchema).nullish(),
  head_commit: z.object({ timestamp: optionalText }).nullish(),
  repository: githubRepository,
  pusher: z.object({ name: optionalText }).nullish(),
  sender: z.object({ login: optionalText }).nullish(),
});

const githubCreate = z.object({
  ref: text.min(1),
  ref_type: text,
  repository: githubRepository,
  sender: z.object({ login: optionalText }).nullish(),
});

const GITHUB_PR_ACTIONS = new Set([
  "opened",
  "edited",
  "reopened",
  "synchronize",
  "closed",
  "ready_for_review",
  "converted_to_draft",
]);

const githubPullRequest = z.object({
  action: text,
  pull_request: z.object({
    number: z.number().int().positive(),
    state: text,
    title: text,
    merged: z.boolean().nullish(),
    merged_at: optionalText,
    updated_at: optionalText,
    user: z.object({ login: optionalText }).nullish(),
    head: z.object({ ref: text }),
  }),
  repository: githubRepository,
});

/** GitHub PR state: merged wins over closed. */
export function githubPullRequestState(pr: {
  state: string;
  merged?: boolean | null;
  merged_at?: string | null;
}): DevRefState {
  if (pr.merged || pr.merged_at) return "merged";
  return pr.state === "closed" ? "closed" : "open";
}

/** Parses a GitHub webhook by its `X-GitHub-Event` name. */
export function parseGithubWebhook(
  event: string | null,
  payload: unknown,
  now = new Date(),
): ParsedWebhook {
  switch (event) {
    case "ping":
      return { type: "ping" };
    case "push": {
      const push = parseOrThrow(githubPush, payload);
      const branch = BRANCH_REF.exec(push.ref)?.[1];
      // Tags are not development references.
      if (!branch) return { type: "ignored" };
      const refs: DevRefCandidate[] = [];
      if (!push.deleted) {
        refs.push(branchCandidate({
          branch,
          authorName: displayName(push.pusher?.name ?? push.sender?.login),
          occurredAt: parseDate(push.head_commit?.timestamp, now),
        }));
      }
      refs.push(...commitCandidates(push.commits ?? [], now));
      return { type: "references", repositoryPath: push.repository.full_name.toLowerCase(), refs };
    }
    case "create": {
      const create = parseOrThrow(githubCreate, payload);
      if (create.ref_type !== "branch") return { type: "ignored" };
      return {
        type: "references",
        repositoryPath: create.repository.full_name.toLowerCase(),
        refs: [branchCandidate({
          branch: create.ref,
          authorName: displayName(create.sender?.login),
          occurredAt: now,
        })],
      };
    }
    case "pull_request": {
      const event = parseOrThrow(githubPullRequest, payload);
      if (!GITHUB_PR_ACTIONS.has(event.action)) return { type: "ignored" };
      const pr = event.pull_request;
      return {
        type: "references",
        repositoryPath: event.repository.full_name.toLowerCase(),
        refs: [{
          kind: "pr",
          id: String(pr.number),
          title: clip(pr.title.trim(), MAX_TITLE),
          authorName: displayName(pr.user?.login),
          state: githubPullRequestState(pr),
          occurredAt: parseDate(pr.updated_at, now),
          texts: [pr.title, pr.head.ref],
        }],
      };
    }
    default:
      return { type: "ignored" };
  }
}

// ---------------------------------------------------------------------------
// GitLab
// ---------------------------------------------------------------------------

const gitlabProject = z.object({ path_with_namespace: text.min(3) });

const gitlabPush = z.object({
  ref: text,
  after: optionalText,
  user_name: optionalText,
  project: gitlabProject,
  commits: z.array(commitSchema).nullish(),
});

const gitlabMergeRequest = z.object({
  user: z.object({ name: optionalText }).nullish(),
  project: gitlabProject,
  object_attributes: z.object({
    iid: z.number().int().positive(),
    title: text,
    source_branch: text,
    state: text,
    updated_at: optionalText,
  }),
});

/** GitLab MR state: `opened` and `locked` are still open. */
export function gitlabMergeRequestState(state: string): DevRefState {
  if (state === "merged") return "merged";
  if (state === "closed") return "closed";
  return "open";
}

/** Parses a GitLab webhook by its `X-Gitlab-Event` name. */
export function parseGitlabWebhook(
  event: string | null,
  payload: unknown,
  now = new Date(),
): ParsedWebhook {
  switch (event) {
    case "Push Hook": {
      const push = parseOrThrow(gitlabPush, payload);
      const branch = BRANCH_REF.exec(push.ref)?.[1];
      if (!branch) return { type: "ignored" };
      const commits = commitCandidates(push.commits ?? [], now);
      const refs: DevRefCandidate[] = [];
      if (!(push.after && ZERO_SHA.test(push.after))) {
        const latest = commits.reduce<Date | null>(
          (max, commit) => (max && max > commit.occurredAt ? max : commit.occurredAt),
          null,
        );
        refs.push(branchCandidate({
          branch,
          authorName: displayName(push.user_name),
          occurredAt: latest ?? now,
        }));
      }
      refs.push(...commits);
      return {
        type: "references",
        repositoryPath: push.project.path_with_namespace.toLowerCase(),
        refs,
      };
    }
    case "Merge Request Hook": {
      const event = parseOrThrow(gitlabMergeRequest, payload);
      const mr = event.object_attributes;
      return {
        type: "references",
        repositoryPath: event.project.path_with_namespace.toLowerCase(),
        refs: [{
          kind: "pr",
          id: String(mr.iid),
          title: clip(mr.title.trim(), MAX_TITLE),
          // The hook names who triggered it, not the MR author.
          authorName: displayName(event.user?.name),
          state: gitlabMergeRequestState(mr.state),
          occurredAt: parseDate(mr.updated_at, now),
          texts: [mr.title, mr.source_branch],
        }],
      };
    }
    default:
      return { type: "ignored" };
  }
}
