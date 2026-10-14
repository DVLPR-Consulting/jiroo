import { describe, expect, it } from "vitest";
import { buildRefUrl, externalRefId } from "@/lib/repo-webhooks/ref-links";

describe("buildRefUrl", () => {
  it("links GitHub pull requests, commits and branches on the connected repository", () => {
    const base = { provider: "github" as const, instanceUrl: "https://github.com", repositoryPath: "acme/api" };
    expect(buildRefUrl({ ...base, kind: "pr", id: "42" })).toBe("https://github.com/acme/api/pull/42");
    expect(buildRefUrl({ ...base, kind: "commit", id: "abc1234" })).toBe("https://github.com/acme/api/commit/abc1234");
    expect(buildRefUrl({ ...base, kind: "branch", id: "feature/CASS-1 é" })).toBe(
      "https://github.com/acme/api/tree/feature/CASS-1%20%C3%A9",
    );
  });

  it("links GitLab merge requests, commits and branches, self-hosted included", () => {
    const base = {
      provider: "gitlab" as const,
      instanceUrl: "https://gitlab.example.invalid",
      repositoryPath: "group/sub/api",
    };
    expect(buildRefUrl({ ...base, kind: "pr", id: "7" })).toBe(
      "https://gitlab.example.invalid/group/sub/api/-/merge_requests/7",
    );
    expect(buildRefUrl({ ...base, kind: "commit", id: "abc1234" })).toBe(
      "https://gitlab.example.invalid/group/sub/api/-/commit/abc1234",
    );
    expect(buildRefUrl({ ...base, kind: "branch", id: "cass-2" })).toBe(
      "https://gitlab.example.invalid/group/sub/api/-/tree/cass-2",
    );
  });

  it("keeps a self-hosted GitLab's sub-path", () => {
    expect(buildRefUrl({
      provider: "gitlab",
      instanceUrl: "https://intra.example.invalid/gitlab",
      repositoryPath: "group/api",
      kind: "pr",
      id: "3",
    })).toBe("https://intra.example.invalid/gitlab/group/api/-/merge_requests/3");
  });
});

describe("externalRefId", () => {
  it("scopes the identity to the forge host and repository", () => {
    expect(externalRefId({ instanceUrl: "https://github.com", repositoryPath: "acme/api", id: "42" })).toBe(
      "github.com/acme/api#42",
    );
  });

  it("keeps two GitLab instances under one host apart", () => {
    const location = { repositoryPath: "group/api", id: "7" };
    expect(externalRefId({ ...location, instanceUrl: "https://forge.example.invalid/instance-a" })).toBe(
      "forge.example.invalid/instance-a/group/api#7",
    );
    expect(externalRefId({ ...location, instanceUrl: "https://forge.example.invalid/instance-b" })).toBe(
      "forge.example.invalid/instance-b/group/api#7",
    );
  });
});
