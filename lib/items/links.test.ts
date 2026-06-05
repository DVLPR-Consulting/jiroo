import { describe, expect, it } from "vitest";
import {
  LINK_TYPES,
  LINK_TYPE_META,
  type LinkRow,
  directionFor,
  groupLinksForDisplay,
  addLinkInput,
  wouldCreateDirectCycle,
  isDuplicateLink,
} from "./links";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const UUID_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const UUID_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const UUID_C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const UUID_D = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

function makeLink(
  id: string,
  sourceId: string,
  targetId: string,
  type: LinkRow["type"],
): LinkRow {
  return { id, sourceId, targetId, type };
}

// ---------------------------------------------------------------------------
// LINK_TYPES
// ---------------------------------------------------------------------------

describe("LINK_TYPES", () => {
  it("contains exactly the three expected types", () => {
    expect([...LINK_TYPES]).toEqual(["blocks", "relates", "duplicates"]);
  });
});

// ---------------------------------------------------------------------------
// LINK_TYPE_META
// ---------------------------------------------------------------------------

describe("LINK_TYPE_META", () => {
  it("has correct labels for blocks", () => {
    expect(LINK_TYPE_META.blocks.forward).toBe("Bloque");
    expect(LINK_TYPE_META.blocks.inverse).toBe("Est bloqué par");
    expect(LINK_TYPE_META.blocks.symmetric).toBe(false);
  });

  it("has correct labels for relates", () => {
    expect(LINK_TYPE_META.relates.forward).toBe("Lié à");
    expect(LINK_TYPE_META.relates.inverse).toBe("Lié à");
    expect(LINK_TYPE_META.relates.symmetric).toBe(true);
  });

  it("has correct labels for duplicates", () => {
    expect(LINK_TYPE_META.duplicates.forward).toBe("Duplique");
    expect(LINK_TYPE_META.duplicates.inverse).toBe("Est dupliqué par");
    expect(LINK_TYPE_META.duplicates.symmetric).toBe(false);
  });

  it("defines all types from LINK_TYPES", () => {
    for (const t of LINK_TYPES) {
      expect(LINK_TYPE_META[t]).toBeDefined();
    }
  });
});

// ---------------------------------------------------------------------------
// directionFor
// ---------------------------------------------------------------------------

describe("directionFor", () => {
  it("returns outgoing when itemId is the source (blocks)", () => {
    const link = makeLink("1", UUID_A, UUID_B, "blocks");
    const result = directionFor(link, UUID_A);
    expect(result.direction).toBe("outgoing");
    expect(result.otherId).toBe(UUID_B);
    expect(result.label).toBe("Bloque");
  });

  it("returns incoming when itemId is the target (blocks)", () => {
    const link = makeLink("2", UUID_A, UUID_B, "blocks");
    const result = directionFor(link, UUID_B);
    expect(result.direction).toBe("incoming");
    expect(result.otherId).toBe(UUID_A);
    expect(result.label).toBe("Est bloqué par");
  });

  it("returns outgoing with forward label for duplicates source", () => {
    const link = makeLink("3", UUID_A, UUID_B, "duplicates");
    const result = directionFor(link, UUID_A);
    expect(result.direction).toBe("outgoing");
    expect(result.label).toBe("Duplique");
  });

  it("returns incoming with inverse label for duplicates target", () => {
    const link = makeLink("4", UUID_A, UUID_B, "duplicates");
    const result = directionFor(link, UUID_B);
    expect(result.direction).toBe("incoming");
    expect(result.label).toBe("Est dupliqué par");
  });

  it("returns outgoing 'Lié à' for relates source", () => {
    const link = makeLink("5", UUID_A, UUID_B, "relates");
    const result = directionFor(link, UUID_A);
    expect(result.direction).toBe("outgoing");
    expect(result.label).toBe("Lié à");
  });

  it("returns incoming 'Lié à' for relates target (symmetric)", () => {
    const link = makeLink("6", UUID_A, UUID_B, "relates");
    const result = directionFor(link, UUID_B);
    expect(result.direction).toBe("incoming");
    // Symmetric: inverse is also "Lié à"
    expect(result.label).toBe("Lié à");
  });

  it("throws when itemId is neither source nor target", () => {
    const link = makeLink("7", UUID_A, UUID_B, "blocks");
    expect(() => directionFor(link, UUID_C)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// groupLinksForDisplay
// ---------------------------------------------------------------------------

describe("groupLinksForDisplay", () => {
  it("returns empty array when no links", () => {
    expect(groupLinksForDisplay([], UUID_A)).toEqual([]);
  });

  it("groups a single outgoing blocks link into 'Bloque'", () => {
    const links = [makeLink("1", UUID_A, UUID_B, "blocks")];
    const groups = groupLinksForDisplay(links, UUID_A);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.label).toBe("Bloque");
    expect(groups[0]!.direction).toBe("outgoing");
    expect(groups[0]!.type).toBe("blocks");
    expect(groups[0]!.items).toHaveLength(1);
  });

  it("groups a single incoming blocks link into 'Est bloqué par'", () => {
    const links = [makeLink("2", UUID_B, UUID_A, "blocks")];
    const groups = groupLinksForDisplay(links, UUID_A);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.label).toBe("Est bloqué par");
    expect(groups[0]!.direction).toBe("incoming");
  });

  it("groups relates link into 'Lié à' regardless of direction", () => {
    const links = [makeLink("3", UUID_A, UUID_B, "relates")];
    const groups = groupLinksForDisplay(links, UUID_A);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.label).toBe("Lié à");
  });

  it("merges outgoing and incoming relates into a single 'Lié à' bucket", () => {
    const links = [
      makeLink("3", UUID_A, UUID_B, "relates"),
      makeLink("4", UUID_C, UUID_A, "relates"),
    ];
    const groups = groupLinksForDisplay(links, UUID_A);
    // Both map to "Lié à", so only one group
    expect(groups).toHaveLength(1);
    expect(groups[0]!.label).toBe("Lié à");
    expect(groups[0]!.items).toHaveLength(2);
  });

  it("preserves stable label order for mixed link types", () => {
    const links = [
      makeLink("1", UUID_A, UUID_B, "relates"),          // "Lié à"
      makeLink("2", UUID_C, UUID_A, "blocks"),            // "Est bloqué par"
      makeLink("3", UUID_A, UUID_D, "blocks"),            // "Bloque"
      makeLink("4", UUID_A, UUID_B, "duplicates"),        // "Duplique"
    ];
    const groups = groupLinksForDisplay(links, UUID_A);
    const labels = groups.map((g) => g.label);
    // Expected stable order: Bloque, Est bloqué par, Duplique, Lié à
    expect(labels).toEqual(["Bloque", "Est bloqué par", "Duplique", "Lié à"]);
  });

  it("puts multiple links of the same label in the same bucket", () => {
    const links = [
      makeLink("1", UUID_A, UUID_B, "blocks"),
      makeLink("2", UUID_A, UUID_C, "blocks"),
      makeLink("3", UUID_A, UUID_D, "blocks"),
    ];
    const groups = groupLinksForDisplay(links, UUID_A);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.label).toBe("Bloque");
    expect(groups[0]!.items).toHaveLength(3);
  });

  it("omits labels that have no matching links", () => {
    // Only a relates link — no blocks/duplicates labels should appear
    const links = [makeLink("5", UUID_A, UUID_B, "relates")];
    const groups = groupLinksForDisplay(links, UUID_A);
    const labels = groups.map((g) => g.label);
    expect(labels).not.toContain("Bloque");
    expect(labels).not.toContain("Est bloqué par");
    expect(labels).not.toContain("Duplique");
    expect(labels).not.toContain("Est dupliqué par");
  });
});

// ---------------------------------------------------------------------------
// addLinkInput
// ---------------------------------------------------------------------------

describe("addLinkInput", () => {
  it("accepts a valid input", () => {
    const result = addLinkInput.safeParse({
      sourceId: UUID_A,
      targetId: UUID_B,
      type: "blocks",
    });
    expect(result.success).toBe(true);
  });

  it("accepts all valid link types", () => {
    for (const type of LINK_TYPES) {
      const result = addLinkInput.safeParse({ sourceId: UUID_A, targetId: UUID_B, type });
      expect(result.success).toBe(true);
    }
  });

  it("rejects a non-uuid sourceId", () => {
    const result = addLinkInput.safeParse({ sourceId: "not-a-uuid", targetId: UUID_B, type: "blocks" });
    expect(result.success).toBe(false);
  });

  it("rejects a non-uuid targetId", () => {
    const result = addLinkInput.safeParse({ sourceId: UUID_A, targetId: "not-a-uuid", type: "relates" });
    expect(result.success).toBe(false);
  });

  it("rejects an unknown link type", () => {
    const result = addLinkInput.safeParse({ sourceId: UUID_A, targetId: UUID_B, type: "depends_on" });
    expect(result.success).toBe(false);
  });

  it("rejects a self-link (sourceId === targetId)", () => {
    const result = addLinkInput.safeParse({ sourceId: UUID_A, targetId: UUID_A, type: "relates" });
    expect(result.success).toBe(false);
  });

  it("includes the French error message for a self-link", () => {
    const result = addLinkInput.safeParse({ sourceId: UUID_A, targetId: UUID_A, type: "blocks" });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages).toContain("Un item ne peut pas être lié à lui-même.");
    }
  });

  it("requires all three fields", () => {
    expect(addLinkInput.safeParse({ sourceId: UUID_A, targetId: UUID_B }).success).toBe(false);
    expect(addLinkInput.safeParse({ sourceId: UUID_A, type: "blocks" }).success).toBe(false);
    expect(addLinkInput.safeParse({ targetId: UUID_B, type: "blocks" }).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// wouldCreateDirectCycle
// ---------------------------------------------------------------------------

describe("wouldCreateDirectCycle", () => {
  it("returns true when a reverse blocks link exists (2-cycle)", () => {
    const existing = [makeLink("1", UUID_B, UUID_A, "blocks")];
    // Adding A blocks B when B already blocks A → cycle
    expect(wouldCreateDirectCycle(existing, UUID_A, UUID_B)).toBe(true);
  });

  it("returns false when no reverse blocks link exists", () => {
    const existing = [makeLink("1", UUID_A, UUID_C, "blocks")];
    expect(wouldCreateDirectCycle(existing, UUID_A, UUID_B)).toBe(false);
  });

  it("returns false for an empty existing list", () => {
    expect(wouldCreateDirectCycle([], UUID_A, UUID_B)).toBe(false);
  });

  it("ignores relates links (not cycle-checked)", () => {
    // B relates A — this should NOT be considered a cycle for blocks
    const existing = [makeLink("2", UUID_B, UUID_A, "relates")];
    expect(wouldCreateDirectCycle(existing, UUID_A, UUID_B)).toBe(false);
  });

  it("ignores duplicates links (not cycle-checked)", () => {
    const existing = [makeLink("3", UUID_B, UUID_A, "duplicates")];
    expect(wouldCreateDirectCycle(existing, UUID_A, UUID_B)).toBe(false);
  });

  it("returns false for same-direction blocks (not a 2-cycle)", () => {
    // A already blocks B — adding A blocks B again is a dup, not a cycle
    const existing = [makeLink("4", UUID_A, UUID_B, "blocks")];
    expect(wouldCreateDirectCycle(existing, UUID_A, UUID_B)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isDuplicateLink
// ---------------------------------------------------------------------------

describe("isDuplicateLink", () => {
  it("returns true for an exact directional duplicate (blocks)", () => {
    const existing = [makeLink("1", UUID_A, UUID_B, "blocks")];
    expect(isDuplicateLink(existing, UUID_A, UUID_B, "blocks")).toBe(true);
  });

  it("returns false for the reversed pair of a directional type (blocks)", () => {
    // blocks is not symmetric: (A→B) is not the same as (B→A)
    const existing = [makeLink("1", UUID_A, UUID_B, "blocks")];
    expect(isDuplicateLink(existing, UUID_B, UUID_A, "blocks")).toBe(false);
  });

  it("returns true for an exact directional duplicate (duplicates)", () => {
    const existing = [makeLink("2", UUID_A, UUID_B, "duplicates")];
    expect(isDuplicateLink(existing, UUID_A, UUID_B, "duplicates")).toBe(true);
  });

  it("returns false for the reversed pair of duplicates (not symmetric)", () => {
    const existing = [makeLink("2", UUID_A, UUID_B, "duplicates")];
    expect(isDuplicateLink(existing, UUID_B, UUID_A, "duplicates")).toBe(false);
  });

  it("returns true for an exact relates duplicate", () => {
    const existing = [makeLink("3", UUID_A, UUID_B, "relates")];
    expect(isDuplicateLink(existing, UUID_A, UUID_B, "relates")).toBe(true);
  });

  it("returns true for the reversed relates pair (symmetric)", () => {
    // relates IS symmetric: (A→B) ≡ (B→A)
    const existing = [makeLink("3", UUID_A, UUID_B, "relates")];
    expect(isDuplicateLink(existing, UUID_B, UUID_A, "relates")).toBe(true);
  });

  it("returns false when no matching link exists", () => {
    const existing = [makeLink("4", UUID_A, UUID_C, "blocks")];
    expect(isDuplicateLink(existing, UUID_A, UUID_B, "blocks")).toBe(false);
  });

  it("returns false for an empty existing list", () => {
    expect(isDuplicateLink([], UUID_A, UUID_B, "relates")).toBe(false);
  });

  it("does not match across different types", () => {
    const existing = [makeLink("5", UUID_A, UUID_B, "relates")];
    expect(isDuplicateLink(existing, UUID_A, UUID_B, "blocks")).toBe(false);
  });
});
