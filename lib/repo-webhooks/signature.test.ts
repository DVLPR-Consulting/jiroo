import { describe, expect, it } from "vitest";
import {
  signGithubPayload,
  verifyGithubSignature,
  verifyGitlabToken,
} from "@/lib/repo-webhooks/signature";

const SECRET = "It's a Secret to Everybody";
const body = (value: string) => new TextEncoder().encode(value);

describe("verifyGithubSignature", () => {
  it("matches GitHub's documented example signature", () => {
    // https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries
    expect(
      verifyGithubSignature(
        body("Hello, World!"),
        "sha256=757107ea0eb2509fc211221cce984b8a37570b6d7586c22c46f4379c8b043e17",
        SECRET,
      ),
    ).toBe(true);
  });

  it("accepts its own signature, whatever the hex case", () => {
    const raw = body('{"zen":"ok"}');
    const signature = signGithubPayload(raw, SECRET);
    expect(verifyGithubSignature(raw, signature, SECRET)).toBe(true);
    expect(verifyGithubSignature(raw, signature.toUpperCase().replace("SHA256", "sha256"), SECRET)).toBe(true);
  });

  it("refuses a signature made with another secret", () => {
    const raw = body('{"zen":"ok"}');
    expect(verifyGithubSignature(raw, signGithubPayload(raw, "other"), SECRET)).toBe(false);
  });

  it("refuses a tampered body", () => {
    const signature = signGithubPayload(body('{"action":"opened"}'), SECRET);
    expect(verifyGithubSignature(body('{"action":"closed"}'), signature, SECRET)).toBe(false);
  });

  it("refuses a missing or malformed header", () => {
    const raw = body("{}");
    const digest = signGithubPayload(raw, SECRET).slice("sha256=".length);
    for (const header of [null, undefined, "", digest, `sha1=${digest}`, "sha256=abc", `sha256=${digest}00`]) {
      expect(verifyGithubSignature(raw, header, SECRET)).toBe(false);
    }
  });
});

describe("verifyGitlabToken", () => {
  it("accepts the exact token", () => {
    expect(verifyGitlabToken("s3cr3t-token", "s3cr3t-token")).toBe(true);
  });

  it("refuses another, a longer, a missing or an empty token", () => {
    for (const header of ["wrong", "s3cr3t-token-and-more", "s3cr3t-toke", null, undefined, ""]) {
      expect(verifyGitlabToken(header, "s3cr3t-token")).toBe(false);
    }
  });
});
