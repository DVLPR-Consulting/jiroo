import { describe, expect, it } from "vitest";
import {
  commitTitle,
  githubPullRequestState,
  gitlabMergeRequestState,
  parseGithubWebhook,
  parseGitlabWebhook,
  WebhookPayloadError,
} from "@/lib/repo-webhooks/events";
import githubCreate from "@/lib/repo-webhooks/fixtures/github-create.json";
import githubPing from "@/lib/repo-webhooks/fixtures/github-ping.json";
import githubPrMerged from "@/lib/repo-webhooks/fixtures/github-pull-request-merged.json";
import githubPrOpened from "@/lib/repo-webhooks/fixtures/github-pull-request-opened.json";
import githubPush from "@/lib/repo-webhooks/fixtures/github-push.json";
import gitlabMergeRequest from "@/lib/repo-webhooks/fixtures/gitlab-merge-request.json";
import gitlabPush from "@/lib/repo-webhooks/fixtures/gitlab-push.json";

const NOW = new Date("2026-10-13T12:00:00.000Z");

describe("parseGithubWebhook", () => {
  it("answers ping", () => {
    expect(parseGithubWebhook("ping", githubPing, NOW)).toEqual({ type: "ping" });
  });

  it("turns a push into the branch and its commits, keeping only first lines and names", () => {
    const parsed = parseGithubWebhook("push", githubPush, NOW);
    expect(parsed).toEqual({
      type: "references",
      repositoryPath: "example-org/example-repo",
      refs: [
        {
          kind: "branch",
          id: "feature/CASS-12-login-form",
          title: "feature/CASS-12-login-form",
          authorName: "alex-m",
          state: null,
          occurredAt: new Date("2026-10-13T07:20:00.000Z"),
          texts: ["feature/CASS-12-login-form"],
        },
        {
          kind: "commit",
          id: "1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b",
          title: "CASS-12 add the login form",
          authorName: "Alex Martin",
          state: null,
          occurredAt: new Date("2026-10-13T07:15:00.000Z"),
          texts: ["CASS-12 add the login form"],
        },
        {
          kind: "commit",
          id: "9f1c2b7e4d3a5f6b8c0d1e2f3a4b5c6d7e8f9a0b",
          title: "Fix typo in README",
          authorName: "Alex Martin",
          state: null,
          occurredAt: new Date("2026-10-13T07:20:00.000Z"),
          texts: ["Fix typo in README"],
        },
      ],
    });
    expect(JSON.stringify(parsed)).not.toContain("example.invalid");
    expect(JSON.stringify(parsed)).not.toContain("CASS-99");
  });

  it("keeps the commits but not the branch of a deleted branch, and ignores tags", () => {
    const deleted = parseGithubWebhook("push", { ...githubPush, deleted: true, commits: [] }, NOW);
    expect(deleted).toEqual({ type: "references", repositoryPath: "example-org/example-repo", refs: [] });
    expect(parseGithubWebhook("push", { ...githubPush, ref: "refs/tags/v1.0.0" }, NOW)).toEqual({ type: "ignored" });
  });

  it("turns a branch creation into a branch, and ignores tag creation", () => {
    expect(parseGithubWebhook("create", githubCreate, NOW)).toEqual({
      type: "references",
      repositoryPath: "example-org/example-repo",
      refs: [{
        kind: "branch",
        id: "cass-7-export-pdf",
        title: "cass-7-export-pdf",
        authorName: "sam-d",
        state: null,
        occurredAt: NOW,
        texts: ["cass-7-export-pdf"],
      }],
    });
    expect(parseGithubWebhook("create", { ...githubCreate, ref_type: "tag" }, NOW)).toEqual({ type: "ignored" });
  });

  it("reads a pull request's title, source branch, author and state", () => {
    expect(parseGithubWebhook("pull_request", githubPrOpened, NOW)).toEqual({
      type: "references",
      repositoryPath: "example-org/example-repo",
      refs: [{
        kind: "pr",
        id: "42",
        title: "Login form",
        authorName: "alex-m",
        state: "open",
        occurredAt: new Date("2026-10-13T08:00:00.000Z"),
        texts: ["Login form", "feature/CASS-12-login-form"],
      }],
    });
    const merged = parseGithubWebhook("pull_request", githubPrMerged, NOW);
    expect(merged.type === "references" && merged.refs[0]).toMatchObject({
      state: "merged",
      title: "CASS-12 Login form",
      occurredAt: new Date("2026-10-13T10:00:00.000Z"),
    });
  });

  it("ignores pull request actions that change nothing shown, and other events", () => {
    expect(parseGithubWebhook("pull_request", { ...githubPrOpened, action: "labeled" }, NOW)).toEqual({ type: "ignored" });
    expect(parseGithubWebhook("issues", { action: "opened" }, NOW)).toEqual({ type: "ignored" });
    expect(parseGithubWebhook(null, {}, NOW)).toEqual({ type: "ignored" });
  });

  it("rejects a handled event whose payload lacks what it needs", () => {
    expect(() => parseGithubWebhook("push", { ref: "refs/heads/x" }, NOW)).toThrow(WebhookPayloadError);
    expect(() => parseGithubWebhook("pull_request", { action: "opened", repository: { full_name: "a/b" } }, NOW)).toThrow(WebhookPayloadError);
    expect(() => parseGithubWebhook("push", { ...githubPush, commits: [{ id: "not a sha", message: "x" }] }, NOW)).toThrow(WebhookPayloadError);
  });
});

describe("githubPullRequestState", () => {
  it("follows opened → closed → reopened → merged", () => {
    expect(githubPullRequestState({ state: "open", merged: false })).toBe("open");
    expect(githubPullRequestState({ state: "closed", merged: false })).toBe("closed");
    expect(githubPullRequestState({ state: "open", merged: false })).toBe("open");
    expect(githubPullRequestState({ state: "closed", merged: true })).toBe("merged");
    expect(githubPullRequestState({ state: "closed", merged_at: "2026-10-13T10:00:00Z" })).toBe("merged");
  });
});

describe("parseGitlabWebhook", () => {
  it("turns a push hook into the branch and its commits", () => {
    const parsed = parseGitlabWebhook("Push Hook", gitlabPush, NOW);
    expect(parsed).toEqual({
      type: "references",
      repositoryPath: "juridiction/greffe/api",
      refs: [
        {
          kind: "branch",
          id: "cass-21-archive",
          title: "cass-21-archive",
          authorName: "Camille Durand",
          state: null,
          occurredAt: new Date("2026-10-12T12:10:00.000Z"),
          texts: ["cass-21-archive"],
        },
        {
          kind: "commit",
          id: "b6568db1bc1dcd7f8b4d5a946b0b91f9dacd7327",
          title: "Cass-21: archive old decisions",
          authorName: "Camille Durand",
          state: null,
          occurredAt: new Date("2026-10-12T12:05:00.000Z"),
          texts: ["Cass-21: archive old decisions"],
        },
        {
          kind: "commit",
          id: "da1560886d4f094c3e6c9ef40349f7d38b5d27d7",
          title: "Bump version ABC-12x and CASS-3a are not keys",
          authorName: "Camille Durand",
          state: null,
          occurredAt: new Date("2026-10-12T12:10:00.000Z"),
          texts: ["Bump version ABC-12x and CASS-3a are not keys"],
        },
      ],
    });
    expect(JSON.stringify(parsed)).not.toContain("camille@");
  });

  it("drops the branch of a deleted branch push", () => {
    const parsed = parseGitlabWebhook(
      "Push Hook",
      { ...gitlabPush, after: "0000000000000000000000000000000000000000", commits: [] },
      NOW,
    );
    expect(parsed).toEqual({ type: "references", repositoryPath: "juridiction/greffe/api", refs: [] });
  });

  it("reads a merge request hook, GitLab date format included", () => {
    expect(parseGitlabWebhook("Merge Request Hook", gitlabMergeRequest, NOW)).toEqual({
      type: "references",
      repositoryPath: "juridiction/greffe/api",
      refs: [{
        kind: "pr",
        id: "7",
        title: "Draft: archive old decisions",
        authorName: "Camille Durand",
        state: "open",
        occurredAt: new Date("2026-10-12T12:20:00.000Z"),
        texts: ["Draft: archive old decisions", "cass-21-archive"],
      }],
    });
  });

  it("ignores tag pushes and other hooks", () => {
    expect(parseGitlabWebhook("Tag Push Hook", gitlabPush, NOW)).toEqual({ type: "ignored" });
    expect(parseGitlabWebhook("Push Hook", { ...gitlabPush, ref: "refs/tags/v1" }, NOW)).toEqual({ type: "ignored" });
    expect(parseGitlabWebhook("Issue Hook", {}, NOW)).toEqual({ type: "ignored" });
  });

  it("rejects a merge request hook without its attributes", () => {
    expect(() => parseGitlabWebhook("Merge Request Hook", { project: { path_with_namespace: "a/b" } }, NOW)).toThrow(WebhookPayloadError);
  });
});

describe("gitlabMergeRequestState", () => {
  it("maps opened, locked, closed and merged", () => {
    expect(gitlabMergeRequestState("opened")).toBe("open");
    expect(gitlabMergeRequestState("locked")).toBe("open");
    expect(gitlabMergeRequestState("closed")).toBe("closed");
    expect(gitlabMergeRequestState("merged")).toBe("merged");
  });
});

describe("commitTitle", () => {
  it("keeps the first line only, trimmed and capped", () => {
    expect(commitTitle("  First line  \r\nSecond")).toBe("First line");
    expect(commitTitle("x".repeat(600))).toHaveLength(500);
  });
});
