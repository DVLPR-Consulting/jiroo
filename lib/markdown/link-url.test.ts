import { describe, expect, it } from "vitest";
import { isAllowedLinkUrl, normalizeLinkUrl } from "@/lib/markdown/link-url";

describe("normalizeLinkUrl", () => {
  it("keeps http, https and mailto URLs", () => {
    expect(normalizeLinkUrl("https://exemple.fr/a?b=1#c")).toBe("https://exemple.fr/a?b=1#c");
    expect(normalizeLinkUrl("  http://exemple.fr  ")).toBe("http://exemple.fr");
    expect(normalizeLinkUrl("mailto:greffe@exemple.fr")).toBe("mailto:greffe@exemple.fr");
  });

  it("adds https to a bare domain", () => {
    expect(normalizeLinkUrl("www.courdecassation.fr")).toBe("https://www.courdecassation.fr");
    expect(normalizeLinkUrl("exemple.fr/page")).toBe("https://exemple.fr/page");
  });

  it("keeps same-site relative links", () => {
    expect(normalizeLinkUrl("/b/CASS?item=CASS-1")).toBe("/b/CASS?item=CASS-1");
    expect(normalizeLinkUrl("#section")).toBe("#section");
  });

  it.each([
    "javascript:alert(1)",
    " JavaScript:alert(1)",
    "java\tscript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "vbscript:msgbox(1)",
    "file:///etc/passwd",
    "//evil.example",
    "",
    "   ",
    "pas une url",
    "https://",
  ])("rejects %j", (input) => {
    expect(normalizeLinkUrl(input)).toBeNull();
    expect(isAllowedLinkUrl(input)).toBe(false);
  });
});
