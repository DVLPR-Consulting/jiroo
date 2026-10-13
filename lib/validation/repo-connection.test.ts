import { describe, expect, it } from "vitest";
import {
  createRepoConnectionInput,
  normalizeInstanceUrl,
  normalizeRepositoryPath,
} from "@/lib/validation/repo-connection";

const BACKLOG_ID = "6f9619ff-8b86-4011-b42d-00c04fc964ff";

describe("normalizeRepositoryPath", () => {
  it("accepts GitHub owner/repo, pasted URLs and clone addresses, lower-cased", () => {
    for (const raw of [
      "Acme/Api",
      " acme/api ",
      "https://github.com/acme/api",
      "https://github.com/acme/api.git",
      "git@github.com:acme/api.git",
      "/acme/api/",
    ]) {
      expect(normalizeRepositoryPath("github", raw), raw).toBe("acme/api");
    }
  });

  it("refuses GitHub paths that are not exactly owner/repo", () => {
    for (const raw of ["acme", "acme/api/extra", "-acme/api", "acme/a pi", "", "javascript:alert(1)"]) {
      expect(normalizeRepositoryPath("github", raw), raw).toBeNull();
    }
  });

  it("accepts GitLab nested group paths", () => {
    expect(normalizeRepositoryPath("gitlab", "Juridiction/Greffe/API")).toBe("juridiction/greffe/api");
    expect(
      normalizeRepositoryPath("gitlab", "https://gitlab.example.invalid/group/project/-/merge_requests/3"),
    ).toBe("group/project");
  });

  it("refuses GitLab paths with a single or a dot-only segment", () => {
    for (const raw of ["project", "group/../project", "group//project", "group/pro ject"]) {
      expect(normalizeRepositoryPath("gitlab", raw), raw).toBeNull();
    }
  });
});

describe("a self-hosted GitLab under a sub-path", () => {
  it("drops the instance prefix from a pasted repository URL, not from a typed path", () => {
    const base = { backlogId: BACKLOG_ID, provider: "gitlab", instanceUrl: "https://forge.example.invalid/gitlab" };
    for (const repositoryPath of [
      "https://forge.example.invalid/gitlab/group/api.git",
      "https://forge.example.invalid/GitLab/group/api/-/merge_requests/3",
      "group/api",
    ]) {
      expect(createRepoConnectionInput.parse({ ...base, repositoryPath }).repositoryPath, repositoryPath).toBe("group/api");
    }
    // A project really named « gitlab/… » typed as a path stays as typed.
    expect(createRepoConnectionInput.parse({ ...base, repositoryPath: "gitlab/group/api" }).repositoryPath).toBe("gitlab/group/api");
  });
});

describe("normalizeInstanceUrl", () => {
  it("pins GitHub to github.com", () => {
    expect(normalizeInstanceUrl("github", "https://evil.example")).toBe("https://github.com");
  });

  it("defaults GitLab to gitlab.com and keeps a self-hosted origin", () => {
    expect(normalizeInstanceUrl("gitlab", undefined)).toBe("https://gitlab.com");
    expect(normalizeInstanceUrl("gitlab", " ")).toBe("https://gitlab.com");
    expect(normalizeInstanceUrl("gitlab", "https://gitlab.example.invalid/")).toBe(
      "https://gitlab.example.invalid",
    );
    expect(normalizeInstanceUrl("gitlab", "https://intra.example.invalid/gitlab/")).toBe(
      "https://intra.example.invalid/gitlab",
    );
    expect(normalizeInstanceUrl("gitlab", "gitlab.intra.example:8443")).toBe(
      "https://gitlab.intra.example:8443",
    );
    expect(normalizeInstanceUrl("gitlab", "http://gitlab.intra.example")).toBe("http://gitlab.intra.example");
  });

  it("refuses other schemes and embedded credentials", () => {
    for (const raw of [
      "ftp://gitlab.example",
      "javascript:alert(1)",
      "https://user:pw@gitlab.example",
      "https://gitlab.example/?next=x",
    ]) {
      expect(normalizeInstanceUrl("gitlab", raw), raw).toBeNull();
    }
  });
});

describe("createRepoConnectionInput", () => {
  it("normalises a valid connection", () => {
    expect(
      createRepoConnectionInput.parse({
        backlogId: BACKLOG_ID,
        provider: "gitlab",
        repositoryPath: "Group/Project",
        instanceUrl: "https://gitlab.example.invalid/",
      }),
    ).toEqual({
      backlogId: BACKLOG_ID,
      provider: "gitlab",
      repositoryPath: "group/project",
      instanceUrl: "https://gitlab.example.invalid",
    });
  });

  it("explains an invalid repository in French", () => {
    const result = createRepoConnectionInput.safeParse({
      backlogId: BACKLOG_ID,
      provider: "github",
      repositoryPath: "not a repo",
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("Dépôt invalide : saisissez « propriétaire/dépôt ».");
  });
});
