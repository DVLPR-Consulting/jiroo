import { describe, expect, it } from "vitest";
import { countLabel, formatPoints, frenchPlural, isFrenchPlural, pointsLabel } from "./plural";

describe("isFrenchPlural", () => {
  it.each([
    [0, false],
    [1, false],
    [1.5, false],
    [1.99, false],
    [2, true],
    [2.5, true],
    [16, true],
    [-1, false],
    [-2, true],
  ])("treats %s as plural: %s", (count, expected) => {
    expect(isFrenchPlural(count)).toBe(expected);
  });
});

describe("frenchPlural", () => {
  it("picks the singular form below two and the plural form from two", () => {
    expect(frenchPlural(0, "sprint inclus", "sprints inclus")).toBe("sprint inclus");
    expect(frenchPlural(1, "sprint inclus", "sprints inclus")).toBe("sprint inclus");
    expect(frenchPlural(2, "sprint inclus", "sprints inclus")).toBe("sprints inclus");
  });
});

describe("countLabel", () => {
  it("prefixes the agreed noun phrase with the raw count", () => {
    expect(countLabel(0, "tâche", "tâches")).toBe("0 tâche");
    expect(countLabel(1, "tâche", "tâches")).toBe("1 tâche");
    expect(countLabel(3, "tâche", "tâches")).toBe("3 tâches");
  });

  it("agrees the following adjective through explicit forms", () => {
    expect(countLabel(1, "élément non terminé", "éléments non terminés")).toBe("1 élément non terminé");
    expect(countLabel(4, "élément non terminé", "éléments non terminés")).toBe("4 éléments non terminés");
  });

  it("formats the count with the supplied formatter but agrees on the numeric value", () => {
    const decimal = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });
    expect(countLabel(1.5, "point", "points", decimal.format)).toBe("1,5 point");
    expect(countLabel(2.5, "point", "points", decimal.format)).toBe("2,5 points");
  });
});

describe("formatPoints", () => {
  it("prints a points value with the French decimal comma and no unit", () => {
    expect(formatPoints(1.5)).toBe("1,5");
    expect(formatPoints(13)).toBe("13");
    expect(formatPoints(2.25)).toBe("2,25");
  });
});

describe("pointsLabel", () => {
  it("abbreviates points as pt below two and pts from two", () => {
    expect(pointsLabel(0)).toBe("0 pt");
    expect(pointsLabel(1)).toBe("1 pt");
    expect(pointsLabel(1.5)).toBe("1,5 pt");
    expect(pointsLabel(2)).toBe("2 pts");
    expect(pointsLabel(16)).toBe("16 pts");
    expect(pointsLabel(2.25)).toBe("2,25 pts");
  });

  it("agrees on the magnitude of negative deltas", () => {
    expect(pointsLabel(-1)).toBe("-1 pt");
    expect(pointsLabel(-3)).toBe("-3 pts");
  });

  it("accepts a custom number formatter such as a signed one", () => {
    const signed = new Intl.NumberFormat("fr-FR", { signDisplay: "exceptZero" });
    expect(pointsLabel(1, signed.format)).toBe("+1 pt");
    expect(pointsLabel(-4, signed.format)).toBe("-4 pts");
  });
});
