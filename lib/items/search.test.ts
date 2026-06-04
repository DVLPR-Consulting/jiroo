import { describe, expect, it } from "vitest";
import { isBlankQuery, looksLikeItemKey, toPrefixTsQuery } from "@/lib/items/search";

// ---------------------------------------------------------------------------
// isBlankQuery
// ---------------------------------------------------------------------------

describe("isBlankQuery", () => {
  it("returns true for an empty string", () => {
    expect(isBlankQuery("")).toBe(true);
  });

  it("returns true for a string of spaces", () => {
    expect(isBlankQuery("   ")).toBe(true);
  });

  it("returns true for a tab-only string", () => {
    expect(isBlankQuery("\t\n")).toBe(true);
  });

  it("returns false for a non-blank string", () => {
    expect(isBlankQuery("hello")).toBe(false);
  });

  it("returns false for a string with leading/trailing spaces around text", () => {
    expect(isBlankQuery("  x  ")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// toPrefixTsQuery
// ---------------------------------------------------------------------------

describe("toPrefixTsQuery", () => {
  it("converts a single word into a prefix term", () => {
    expect(toPrefixTsQuery("hello")).toBe("hello:*");
  });

  it("converts two words into AND-joined prefix terms", () => {
    expect(toPrefixTsQuery("réc proc")).toBe("réc:* & proc:*");
  });

  it("strips tsquery-special chars: pipe removed, token becomes 'ab'; parens stripped from 'c'", () => {
    // "a|b" → strip "|" → "ab"; "(c)" → strip "(" and ")" → "c"
    expect(toPrefixTsQuery("a|b (c)")).toBe("ab:* & c:*");
  });

  it("returns empty string for a blank/whitespace-only input", () => {
    expect(toPrefixTsQuery("  ")).toBe("");
  });

  it("returns empty string for punctuation-only input (asterisks)", () => {
    expect(toPrefixTsQuery("***")).toBe("");
  });

  it("preserves accented characters", () => {
    expect(toPrefixTsQuery("procédure")).toBe("procédure:*");
  });

  it("handles multiple accented terms", () => {
    expect(toPrefixTsQuery("réception éléments")).toBe("réception:* & éléments:*");
  });

  it("strips exclamation mark operator", () => {
    expect(toPrefixTsQuery("!foo")).toBe("foo:*");
  });

  it("strips colon operator", () => {
    expect(toPrefixTsQuery("foo:bar")).toBe("foobar:*");
  });

  it("strips angle brackets (phrase distance operator), hyphen preserved mid-token", () => {
    // "<" and ">" are stripped; "-" is kept (allowed); result is "foo-bar" treated as one token
    expect(toPrefixTsQuery("foo<->bar")).toBe("foo-bar:*");
  });

  it("strips quotes", () => {
    expect(toPrefixTsQuery('"foo bar"')).toBe("foo:* & bar:*");
  });

  it("preserves hyphens within tokens", () => {
    // A hyphen mid-token is kept (it's a valid part of some French words)
    expect(toPrefixTsQuery("mise-en-forme")).toBe("mise-en-forme:*");
  });

  it("handles extra internal whitespace by splitting correctly", () => {
    expect(toPrefixTsQuery("foo   bar")).toBe("foo:* & bar:*");
  });

  it("handles a single punctuation-only token gracefully", () => {
    expect(toPrefixTsQuery("& |")).toBe("");
  });

  it("keeps digits", () => {
    expect(toPrefixTsQuery("item42")).toBe("item42:*");
  });
});

// ---------------------------------------------------------------------------
// looksLikeItemKey
// ---------------------------------------------------------------------------

describe("looksLikeItemKey", () => {
  it("matches a standard uppercase item key", () => {
    expect(looksLikeItemKey("CASS-39")).toBe(true);
  });

  it("matches a lowercase item key (case-insensitive)", () => {
    expect(looksLikeItemKey("cass-39")).toBe(true);
  });

  it("matches a mixed-case item key", () => {
    expect(looksLikeItemKey("Cass-1")).toBe(true);
  });

  it("matches a single-letter prefix", () => {
    expect(looksLikeItemKey("X-100")).toBe(true);
  });

  it("rejects a key without the number (letters only)", () => {
    expect(looksLikeItemKey("CASS")).toBe(false);
  });

  it("rejects a key with a trailing hyphen and no digits", () => {
    expect(looksLikeItemKey("CASS-")).toBe(false);
  });

  it("rejects a plain word (no hyphen)", () => {
    expect(looksLikeItemKey("foo bar")).toBe(false);
  });

  it("rejects an empty string", () => {
    expect(looksLikeItemKey("")).toBe(false);
  });

  it("rejects a key starting with a digit", () => {
    expect(looksLikeItemKey("1CASS-39")).toBe(false);
  });

  it("trims surrounding whitespace before testing", () => {
    expect(looksLikeItemKey("  CASS-5  ")).toBe(true);
  });
});
