import { z } from "zod";

// ---------------------------------------------------------------------------
// RefKind
// ---------------------------------------------------------------------------

export type RefKind = "pr" | "commit" | "branch" | "repo" | "other";

// ---------------------------------------------------------------------------
// parseGithubRef
// ---------------------------------------------------------------------------

export type GithubRefMeta = {
  kind: RefKind;
  label: string;
};

/**
 * Parses a raw string and returns structured metadata if it is a valid
 * github.com URL, or null if it is not.
 *
 * Classification by path:
 *   /owner/repo/pull/<n>         → pr
 *   /owner/repo/commit/<sha>     → commit  (label shows first 7 chars)
 *   /owner/repo/tree/<branch>    → branch
 *   /owner/repo (exactly)        → repo
 *   anything else under github.com → other
 */
export function parseGithubRef(raw: string): GithubRefMeta | null {
  // Must be parseable as a URL.
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }

  // Host must be github.com or www.github.com; scheme must be https.
  const host = parsed.hostname.toLowerCase();
  if (parsed.protocol !== "https:" || (host !== "github.com" && host !== "www.github.com")) {
    return null;
  }

  // Normalise the path: strip trailing slash, decode percent-encoding.
  const rawPath = decodeURIComponent(parsed.pathname.replace(/\/+$/, ""));

  // Split into non-empty segments.
  const segments = rawPath.split("/").filter(Boolean);

  // We need at least owner + repo.
  if (segments.length < 2) {
    return null;
  }

  const owner = segments[0]!;
  const repo = segments[1]!;
  const ownerRepo = `${owner}/${repo}`;

  // Exactly /owner/repo → repo
  if (segments.length === 2) {
    return { kind: "repo", label: ownerRepo };
  }

  const section = segments[2];

  // /owner/repo/pull/<n>
  if (section === "pull" && segments.length >= 4) {
    const num = segments[3]!;
    return { kind: "pr", label: `PR #${num} · ${ownerRepo}` };
  }

  // /owner/repo/commit/<sha>
  if (section === "commit" && segments.length >= 4) {
    const sha = segments[3]!;
    const sha7 = sha.slice(0, 7);
    return { kind: "commit", label: `Commit ${sha7} · ${ownerRepo}` };
  }

  // /owner/repo/tree/<branch>
  if (section === "tree" && segments.length >= 4) {
    // Branch name may contain slashes; reassemble remaining segments.
    const branch = segments.slice(3).join("/");
    return { kind: "branch", label: `Branche ${branch} · ${ownerRepo}` };
  }

  // Anything else that lives under a known owner/repo.
  return { kind: "other", label: ownerRepo };
}

// ---------------------------------------------------------------------------
// addRefInput
// ---------------------------------------------------------------------------

export const addRefInput = z
  .object({
    itemId: z.string().uuid(),
    url: z.string().trim().url(),
  })
  .refine((d) => parseGithubRef(d.url) !== null, {
    message: "URL GitHub invalide.",
  });

export type AddRefInput = z.infer<typeof addRefInput>;
