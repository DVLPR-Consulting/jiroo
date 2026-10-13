import { z } from "zod";

/** Repository connections (JIR-95): forge, repository and instance. */

export const REPO_PROVIDERS = ["github", "gitlab"] as const;
export type RepoProviderInput = (typeof REPO_PROVIDERS)[number];

export const GITHUB_INSTANCE_URL = "https://github.com";
export const GITLAB_INSTANCE_URL = "https://gitlab.com";

const GITHUB_PATH = /^[a-z0-9](?:[a-z0-9-]{0,38})\/[a-z0-9._-]{1,100}$/;
const GITLAB_SEGMENT = /^[a-z0-9_.][a-z0-9_.-]{0,254}$/;

/**
 * The instance base URL: github.com for GitHub; gitlab.com or a self-hosted
 * GitLab (http or https, no credentials, sub-path kept for an instance
 * served under one, e.g. https://intra.example/gitlab). Null when invalid.
 */
export function normalizeInstanceUrl(
  provider: RepoProviderInput,
  raw: string | undefined,
): string | null {
  if (provider === "github") return GITHUB_INSTANCE_URL;
  const value = raw?.trim();
  if (!value) return GITLAB_INSTANCE_URL;
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.username || url.password || !url.hostname || url.search || url.hash) return null;
  return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
}

/**
 * `owner/repo` (GitHub) or `group/subgroup/project` (GitLab), lower-cased.
 * A pasted repository URL or clone address is accepted. Null when invalid.
 */
export function normalizeRepositoryPath(provider: RepoProviderInput, raw: string): string | null {
  let value = raw.trim();
  const scp = /^[^@/\s]+@[^:/\s]+:(.+)$/.exec(value);
  if (scp) value = scp[1]!;
  else if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) {
    try {
      value = new URL(value).pathname;
    } catch {
      return null;
    }
  }
  value = value
    .replace(/^\/+|\/+$/g, "")
    .replace(/\.git$/i, "")
    .replace(/\/-\/.*$/, "")
    .toLowerCase();
  if (provider === "github") return GITHUB_PATH.test(value) ? value : null;
  const segments = value.split("/");
  if (segments.length < 2 || segments.length > 20 || value.length > 255) return null;
  return segments.every((segment) => GITLAB_SEGMENT.test(segment) && !/^\.+$/.test(segment))
    ? value
    : null;
}

export const createRepoConnectionInput = z
  .object({
    backlogId: z.uuid(),
    provider: z.enum(REPO_PROVIDERS),
    repositoryPath: z.string().max(500),
    instanceUrl: z.string().max(500).optional(),
  })
  .transform((input, ctx) => {
    const repositoryPath = normalizeRepositoryPath(input.provider, input.repositoryPath);
    if (!repositoryPath) {
      ctx.addIssue({
        code: "custom",
        path: ["repositoryPath"],
        message: input.provider === "github"
          ? "Dépôt invalide : saisissez « propriétaire/dépôt »."
          : "Projet invalide : saisissez son chemin, par exemple « groupe/projet ».",
      });
      return z.NEVER;
    }
    const instanceUrl = normalizeInstanceUrl(input.provider, input.instanceUrl);
    if (!instanceUrl) {
      ctx.addIssue({ code: "custom", path: ["instanceUrl"], message: "URL d’instance invalide." });
      return z.NEVER;
    }
    return { backlogId: input.backlogId, provider: input.provider, repositoryPath, instanceUrl };
  });

export const repoConnectionIdInput = z.object({ connectionId: z.uuid() });

export const setRepoConnectionEnabledInput = z.object({
  connectionId: z.uuid(),
  enabled: z.boolean(),
});

export type CreateRepoConnectionInput = z.input<typeof createRepoConnectionInput>;
