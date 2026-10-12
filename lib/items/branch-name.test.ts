import { describe, expect, it } from "vitest";
import { BRANCH_NAME_MAX, itemBranchName } from "@/lib/items/branch-name";

describe("itemBranchName", () => {
  it("joins the lower-cased key and an ASCII slug of the title", () => {
    expect(itemBranchName("CASS-3", "Écran de vérification du code")).toBe(
      "cass-3-ecran-de-verification-du-code",
    );
  });

  it("drops accents, ligatures, punctuation and apostrophes", () => {
    expect(itemBranchName("CASS-12", "L’œuvre « finale » : déjà vu ?!")).toBe(
      "cass-12-l-oeuvre-finale-deja-vu",
    );
  });

  it("collapses separators and trims them at both ends", () => {
    expect(itemBranchName("CASS-1", "  --Paiement__en   ligne--  ")).toBe(
      "cass-1-paiement-en-ligne",
    );
  });

  it("keeps only the key when the title has no usable character", () => {
    expect(itemBranchName("CASS-9", "🚀 — !!")).toBe("cass-9");
  });

  it("truncates a long title on a word boundary within the limit", () => {
    const name = itemBranchName(
      "CASS-123",
      "Mettre en place la vérification en deux étapes pour tous les comptes administrateurs de la plateforme",
    );
    expect(name.length).toBeLessThanOrEqual(BRANCH_NAME_MAX);
    expect(name).toBe("cass-123-mettre-en-place-la-verification-en-deux-etapes-pour");
    expect(name.endsWith("-")).toBe(false);
  });

  it("cuts a single over-long word at the limit", () => {
    const name = itemBranchName("CASS-1", "a".repeat(200));
    expect(name).toHaveLength(BRANCH_NAME_MAX);
    expect(name.startsWith("cass-1-aaa")).toBe(true);
  });
});
