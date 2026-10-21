// @vitest-environment node
import { spawnSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";

const HOOK = path.resolve(import.meta.dirname, "../.husky/pre-push");
const SHA = "0123456789abcdef0123456789abcdef01234567";

function push(...remoteRefs: string[]) {
  const input = remoteRefs.map((ref) => `refs/heads/local ${SHA} ${ref} ${SHA}\n`).join("");
  return spawnSync("sh", [HOOK], { input, encoding: "utf8" });
}

describe("pre-push guard (JIR-34)", () => {
  it("refuses a direct push to main", () => {
    const result = push("refs/heads/main");
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Push to main refused");
  });

  it("refuses main even among other refs", () => {
    expect(push("refs/heads/feature", "refs/heads/main").status).toBe(1);
  });

  it.each(["refs/heads/feat/main-menu", "refs/heads/maintenance", "refs/tags/v1.0.0"])(
    "lets %s through",
    (ref) => {
      expect(push(ref).status).toBe(0);
    },
  );

  it("lets a push without refs through", () => {
    expect(push().status).toBe(0);
  });
});
