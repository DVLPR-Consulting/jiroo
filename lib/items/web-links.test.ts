import { describe, expect, it } from "vitest";
import { addWebLinkInput, webLinkKind, webLinkLabel } from "@/lib/items/web-links";

const itemId = "11111111-1111-4111-8111-111111111111";

describe("addWebLinkInput", () => {
  it("accepts an http(s) URL and trims it", () => {
    expect(
      addWebLinkInput.parse({ itemId, url: "  https://www.figma.com/design/abc/Maquette  " }),
    ).toEqual({ itemId, url: "https://www.figma.com/design/abc/Maquette", title: null });
  });

  it("keeps a trimmed title and turns a blank one into null", () => {
    expect(addWebLinkInput.parse({ itemId, url: "http://intra.local/spec", title: "  Spec  " }).title).toBe("Spec");
    expect(addWebLinkInput.parse({ itemId, url: "http://intra.local/spec", title: "   " }).title).toBeNull();
  });

  it.each(["javascript:alert(1)", "data:text/html,hi", "file:///etc/passwd", "ftp://host/x", "pas une url", ""])(
    "rejects %j",
    (url) => {
      const result = addWebLinkInput.safeParse({ itemId, url });
      expect(result.success).toBe(false);
      expect(result.error?.issues[0]?.message).toBe("URL invalide (http ou https).");
    },
  );

  it("rejects URLs over 2048 characters and titles over 200", () => {
    expect(addWebLinkInput.safeParse({ itemId, url: `https://a.fr/${"x".repeat(2048)}` }).success).toBe(false);
    expect(addWebLinkInput.safeParse({ itemId, url: "https://a.fr", title: "t".repeat(201) }).success).toBe(false);
  });
});

describe("webLinkLabel", () => {
  it("prefers the title", () => {
    expect(webLinkLabel("https://www.figma.com/design/abc", "Maquettes")).toBe("Maquettes");
  });

  it("falls back to host and path, without www. nor a trailing slash", () => {
    expect(webLinkLabel("https://www.figma.com/design/abc/", null)).toBe("figma.com/design/abc");
    expect(webLinkLabel("https://intra.local/", null)).toBe("intra.local");
  });

  it("shortens a long fallback to 60 characters with an ellipsis", () => {
    const label = webLinkLabel(`https://docs.example.org/${"segment/".repeat(20)}`, null);
    expect(label).toHaveLength(60);
    expect(label.endsWith("…")).toBe(true);
  });

  it("returns the raw URL when it cannot be parsed", () => {
    expect(webLinkLabel("not a url", null)).toBe("not a url");
  });
});

describe("webLinkKind", () => {
  it("detects Figma, including subdomains", () => {
    expect(webLinkKind("https://figma.com/file/x")).toBe("figma");
    expect(webLinkKind("https://www.figma.com/design/x")).toBe("figma");
  });

  it("does not mistake look-alike hosts for Figma", () => {
    expect(webLinkKind("https://notfigma.com/x")).toBe("web");
    expect(webLinkKind("https://figma.com.evil.fr/x")).toBe("web");
    expect(webLinkKind("not a url")).toBe("web");
  });
});
