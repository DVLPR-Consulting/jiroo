import { describe, expect, it } from "vitest";
import { parseGithubRef, addRefInput } from "./github-ref";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const ITEM_UUID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const GITHUB_PR = "https://github.com/acme/my-repo/pull/42";
const GITHUB_COMMIT = "https://github.com/acme/my-repo/commit/abc1234567890def";
const GITHUB_BRANCH = "https://github.com/acme/my-repo/tree/feat/my-feature";
const GITHUB_REPO = "https://github.com/acme/my-repo";

// ---------------------------------------------------------------------------
// parseGithubRef — null for non-GitHub input
// ---------------------------------------------------------------------------

describe("parseGithubRef — invalid input", () => {
  it("returns null for a non-URL string", () => {
    expect(parseGithubRef("not-a-url")).toBeNull();
  });

  it("returns null for an empty string", () => {
    expect(parseGithubRef("")).toBeNull();
  });

  it("returns null for a non-GitHub URL", () => {
    expect(parseGithubRef("https://gitlab.com/owner/repo")).toBeNull();
  });

  it("returns null for an http (non-https) GitHub URL", () => {
    expect(parseGithubRef("http://github.com/owner/repo")).toBeNull();
  });

  it("returns null for a URL with only one path segment", () => {
    expect(parseGithubRef("https://github.com/owner")).toBeNull();
  });

  it("returns null for the bare github.com root", () => {
    expect(parseGithubRef("https://github.com/")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// parseGithubRef — PR
// ---------------------------------------------------------------------------

describe("parseGithubRef — PR", () => {
  it("classifies a PR URL correctly", () => {
    const result = parseGithubRef(GITHUB_PR);
    expect(result).not.toBeNull();
    expect(result!.kind).toBe("pr");
    expect(result!.label).toBe("PR #42 · acme/my-repo");
  });

  it("includes PR number in label for different numbers", () => {
    const result = parseGithubRef("https://github.com/octocat/hello-world/pull/1");
    expect(result!.kind).toBe("pr");
    expect(result!.label).toBe("PR #1 · octocat/hello-world");
  });

  it("handles a trailing slash on a PR URL", () => {
    const result = parseGithubRef("https://github.com/acme/my-repo/pull/42/");
    expect(result!.kind).toBe("pr");
    expect(result!.label).toBe("PR #42 · acme/my-repo");
  });
});

// ---------------------------------------------------------------------------
// parseGithubRef — commit
// ---------------------------------------------------------------------------

describe("parseGithubRef — commit", () => {
  it("classifies a commit URL and truncates sha to 7 chars", () => {
    const result = parseGithubRef(GITHUB_COMMIT);
    expect(result).not.toBeNull();
    expect(result!.kind).toBe("commit");
    expect(result!.label).toBe("Commit abc1234 · acme/my-repo");
  });

  it("handles a short SHA (passthrough if < 7 chars)", () => {
    const result = parseGithubRef("https://github.com/acme/my-repo/commit/abc");
    expect(result!.kind).toBe("commit");
    // slice(0, 7) of "abc" is "abc"
    expect(result!.label).toBe("Commit abc · acme/my-repo");
  });

  it("handles a trailing slash on a commit URL", () => {
    const result = parseGithubRef("https://github.com/acme/my-repo/commit/abc1234567890/");
    expect(result!.kind).toBe("commit");
    expect(result!.label).toBe("Commit abc1234 · acme/my-repo");
  });
});

// ---------------------------------------------------------------------------
// parseGithubRef — branch
// ---------------------------------------------------------------------------

describe("parseGithubRef — branch", () => {
  it("classifies a simple branch URL", () => {
    const result = parseGithubRef("https://github.com/acme/my-repo/tree/main");
    expect(result).not.toBeNull();
    expect(result!.kind).toBe("branch");
    expect(result!.label).toBe("Branche main · acme/my-repo");
  });

  it("reassembles a branch name that contains slashes", () => {
    const result = parseGithubRef(GITHUB_BRANCH);
    expect(result!.kind).toBe("branch");
    expect(result!.label).toBe("Branche feat/my-feature · acme/my-repo");
  });
});

// ---------------------------------------------------------------------------
// parseGithubRef — repo
// ---------------------------------------------------------------------------

describe("parseGithubRef — repo", () => {
  it("classifies a bare owner/repo URL", () => {
    const result = parseGithubRef(GITHUB_REPO);
    expect(result).not.toBeNull();
    expect(result!.kind).toBe("repo");
    expect(result!.label).toBe("acme/my-repo");
  });

  it("handles a trailing slash on a repo URL", () => {
    const result = parseGithubRef("https://github.com/acme/my-repo/");
    expect(result!.kind).toBe("repo");
    expect(result!.label).toBe("acme/my-repo");
  });

  it("accepts www.github.com host", () => {
    const result = parseGithubRef("https://www.github.com/acme/my-repo");
    expect(result!.kind).toBe("repo");
    expect(result!.label).toBe("acme/my-repo");
  });
});

// ---------------------------------------------------------------------------
// parseGithubRef — other
// ---------------------------------------------------------------------------

describe("parseGithubRef — other", () => {
  it("classifies an unrecognised github.com path as 'other'", () => {
    const result = parseGithubRef("https://github.com/acme/my-repo/issues/7");
    expect(result).not.toBeNull();
    expect(result!.kind).toBe("other");
    expect(result!.label).toBe("acme/my-repo");
  });

  it("classifies a releases page as 'other'", () => {
    const result = parseGithubRef("https://github.com/acme/my-repo/releases");
    expect(result!.kind).toBe("other");
    expect(result!.label).toBe("acme/my-repo");
  });
});

// ---------------------------------------------------------------------------
// addRefInput — Zod schema
// ---------------------------------------------------------------------------

describe("addRefInput", () => {
  it("accepts a valid GitHub PR URL + uuid itemId", () => {
    const result = addRefInput.safeParse({ itemId: ITEM_UUID, url: GITHUB_PR });
    expect(result.success).toBe(true);
  });

  it("accepts all supported kinds", () => {
    const urls = [GITHUB_PR, GITHUB_COMMIT, GITHUB_BRANCH, GITHUB_REPO];
    for (const url of urls) {
      const result = addRefInput.safeParse({ itemId: ITEM_UUID, url });
      expect(result.success).toBe(true);
    }
  });

  it("rejects a non-GitHub URL with the French error message", () => {
    const result = addRefInput.safeParse({
      itemId: ITEM_UUID,
      url: "https://gitlab.com/owner/repo",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages).toContain("URL GitHub invalide.");
    }
  });

  it("rejects a bare non-URL string with a url validation error", () => {
    const result = addRefInput.safeParse({ itemId: ITEM_UUID, url: "not-a-url" });
    expect(result.success).toBe(false);
  });

  it("rejects a non-uuid itemId", () => {
    const result = addRefInput.safeParse({ itemId: "not-a-uuid", url: GITHUB_PR });
    expect(result.success).toBe(false);
  });

  it("requires both fields", () => {
    expect(addRefInput.safeParse({ itemId: ITEM_UUID }).success).toBe(false);
    expect(addRefInput.safeParse({ url: GITHUB_PR }).success).toBe(false);
  });
});
