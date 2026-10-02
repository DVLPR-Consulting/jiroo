import { describe, expect, it } from "vitest";
import {
  materializeReleaseRanks,
  resolveReleaseRank,
  type OrderedRelease,
} from "@/lib/releases/order";

const binarySorted = (values: string[]) =>
  [...values].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));

function ordered(
  entries: Array<[id: string, rank: string, archived?: boolean]>,
): OrderedRelease[] {
  return entries.map(([id, rank, archived = false]) => ({ id, rank, archived }));
}

describe("materializeReleaseRanks", () => {
  it("keeps the PR1 display order when materializing missing ranks", () => {
    const ranks = materializeReleaseRanks([
      { id: "a", rank: null },
      { id: "b", rank: null },
      { id: "c", rank: null },
    ]);
    const values = ["a", "b", "c"].map((id) => ranks.get(id)!);
    expect(values.every(Boolean)).toBe(true);
    expect(values).toEqual(binarySorted(values));
    expect(new Set(values).size).toBe(3);
  });

  it("keeps existing ranks and places unranked rows after the ranked ones", () => {
    const ranks = materializeReleaseRanks([
      { id: "x", rank: "a0" },
      { id: "y", rank: "a5" },
      { id: "p", rank: null },
      { id: "q", rank: null },
    ]);
    expect(ranks.get("x")).toBe("a0");
    expect(ranks.get("y")).toBe("a5");
    const tail = [ranks.get("p")!, ranks.get("q")!];
    expect(tail[0]! > "a5").toBe(true);
    expect(tail).toEqual(binarySorted(tail));
  });

  it("uses the highest existing rank in binary order even if rows arrive unsorted", () => {
    const ranks = materializeReleaseRanks([
      { id: "y", rank: "a5" },
      { id: "x", rank: "Zz" },
      { id: "p", rank: null },
    ]);
    expect(ranks.get("p")! > "a5").toBe(true);
  });

  it("returns ranks unchanged when nothing is missing", () => {
    const ranks = materializeReleaseRanks([
      { id: "x", rank: "a0" },
      { id: "y", rank: "a1" },
    ]);
    expect([...ranks.entries()]).toEqual([
      ["x", "a0"],
      ["y", "a1"],
    ]);
  });
});

describe("resolveReleaseRank", () => {
  const rows = ordered([
    ["a", "a0"],
    ["b", "a1"],
    ["c", "a2"],
    ["d", "a3"],
  ]);

  it("places a version between two adjacent neighbours", () => {
    const rank = resolveReleaseRank({ ordered: rows, releaseId: "d", beforeId: "a", afterId: "b" });
    expect(rank > "a0" && rank < "a1").toBe(true);
  });

  it("moves a version to the first position", () => {
    const rank = resolveReleaseRank({ ordered: rows, releaseId: "c", beforeId: null, afterId: "a" });
    expect(rank < "a0").toBe(true);
  });

  it("moves a version to the last position", () => {
    const rank = resolveReleaseRank({ ordered: rows, releaseId: "a", beforeId: "d", afterId: null });
    expect(rank > "a3").toBe(true);
  });

  it("returns the current rank when the position does not change", () => {
    expect(
      resolveReleaseRank({ ordered: rows, releaseId: "b", beforeId: "a", afterId: "c" }),
    ).toBe("a1");
    expect(
      resolveReleaseRank({ ordered: rows, releaseId: "a", beforeId: null, afterId: "b" }),
    ).toBe("a0");
  });

  it("rejects non-adjacent neighbours (stale drag)", () => {
    expect(() =>
      resolveReleaseRank({ ordered: rows, releaseId: "d", beforeId: "a", afterId: "c" }),
    ).toThrow("Voisin invalide pour ce backlog.");
    expect(() =>
      resolveReleaseRank({ ordered: rows, releaseId: "d", beforeId: "b", afterId: null }),
    ).toThrow("Voisin invalide pour ce backlog.");
    expect(() =>
      resolveReleaseRank({ ordered: rows, releaseId: "a", beforeId: null, afterId: "c" }),
    ).toThrow("Voisin invalide pour ce backlog.");
  });

  it("rejects unknown neighbours and an unknown version", () => {
    expect(() =>
      resolveReleaseRank({ ordered: rows, releaseId: "a", beforeId: "zz", afterId: null }),
    ).toThrow("Voisin invalide pour ce backlog.");
    expect(() =>
      resolveReleaseRank({ ordered: rows, releaseId: "zz", beforeId: "a", afterId: "b" }),
    ).toThrow("Release introuvable.");
  });

  it("skips archived versions for adjacency and never collides with their rank", () => {
    const withArchived = ordered([
      ["a", "a0"],
      ["arch", "a0V", true],
      ["b", "a1"],
      ["c", "a2"],
    ]);
    const rank = resolveReleaseRank({
      ordered: withArchived,
      releaseId: "c",
      beforeId: "a",
      afterId: "b",
    });
    expect(rank > "a0" && rank < "a1").toBe(true);
    expect(rank).not.toBe("a0V");
    expect(rank < "a0V").toBe(true);
  });

  it("rejects an archived neighbour and an archived version", () => {
    const withArchived = ordered([
      ["a", "a0"],
      ["arch", "a0V", true],
      ["b", "a1"],
    ]);
    expect(() =>
      resolveReleaseRank({ ordered: withArchived, releaseId: "b", beforeId: "arch", afterId: null }),
    ).toThrow("Voisin invalide pour ce backlog.");
    expect(() =>
      resolveReleaseRank({ ordered: withArchived, releaseId: "arch", beforeId: null, afterId: "a" }),
    ).toThrow("Une version archivée ne peut pas être réordonnée.");
  });

  it("orders consistently with binary text ordering", () => {
    const mixedCase = ordered([
      ["a", "Zz"],
      ["b", "a0"],
    ]);
    const rank = resolveReleaseRank({
      ordered: mixedCase,
      releaseId: "b",
      beforeId: null,
      afterId: "a",
    });
    expect(rank < "Zz").toBe(true);
  });
});
