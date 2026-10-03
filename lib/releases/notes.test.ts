import { describe, expect, it } from "vitest";
import {
  buildReleaseNotesMarkdown,
  escapeMarkdownText,
  type ReleaseNotesModel,
} from "@/lib/releases/notes";

const model: ReleaseNotesModel = {
  releaseName: "2026.10",
  description: null,
  effectiveReleaseDate: null,
  truncated: false,
  items: [
    { key: "CASS-7", title: "Tri des décisions *urgent*", kind: "bug", type: "tache", completed: true },
    { key: "CASS-12", title: "Recherche plein texte", kind: "feature", type: "epic", completed: true },
    { key: "CASS-30", title: "Export PDF", kind: "feature", type: "tache", completed: false },
    { key: "CASS-31", title: "Sous-tâche", kind: "feature", type: "soustache", completed: true },
  ],
};

const options = { includeIncomplete: false, includeDescription: false };

describe("buildReleaseNotesMarkdown", () => {
  it("groups completed top-level items by kind, sorted by key", () => {
    expect(buildReleaseNotesMarkdown(model, options)).toBe(
      [
        "# Notes de release — 2026.10",
        "",
        "## Fonctionnalités",
        "",
        "- CASS-12 — Recherche plein texte",
        "",
        "## Corrections",
        "",
        "- CASS-7 — Tri des décisions \\*urgent\\*",
        "",
      ].join("\n"),
    );
  });

  it("sorts keys numerically within a group", () => {
    const notes = buildReleaseNotesMarkdown(
      {
        ...model,
        items: [
          { key: "CASS-12", title: "Douze", kind: "feature", type: "tache", completed: true },
          { key: "CASS-9", title: "Neuf", kind: "feature", type: "tache", completed: true },
          { key: "CASS-100", title: "Cent", kind: "feature", type: "tache", completed: true },
        ],
      },
      options,
    );
    expect(notes.indexOf("CASS-9")).toBeLessThan(notes.indexOf("CASS-12"));
    expect(notes.indexOf("CASS-12")).toBeLessThan(notes.indexOf("CASS-100"));
  });

  it("adds an incomplete section only when requested", () => {
    expect(buildReleaseNotesMarkdown(model, options)).not.toContain("Non terminés");
    const notes = buildReleaseNotesMarkdown(model, { ...options, includeIncomplete: true });
    expect(notes).toContain("## Non terminés\n\n- CASS-30 — Export PDF\n");
    expect(notes).not.toContain("CASS-31");
  });

  it("includes the escaped description and the publication date when present", () => {
    const notes = buildReleaseNotesMarkdown(
      {
        ...model,
        description: "Livraison <b>majeure</b>\n# pas un titre",
        effectiveReleaseDate: "2026-08-20",
      },
      { includeIncomplete: false, includeDescription: true },
    );
    expect(notes).toContain("Publiée le 20 août 2026.");
    expect(notes).toContain("Livraison \\<b\\>majeure\\</b\\>\n\\# pas un titre");
    expect(
      buildReleaseNotesMarkdown({ ...model, description: "Texte" }, options),
    ).not.toContain("Texte");
  });

  it("explains empty notes", () => {
    const notes = buildReleaseNotesMarkdown({ ...model, items: [] }, options);
    expect(notes).toBe(
      ["# Notes de release — 2026.10", "", "Aucun élément terminé dans cette version.", ""].join(
        "\n",
      ),
    );
  });

  it("flags notes truncated at the item cap", () => {
    expect(buildReleaseNotesMarkdown({ ...model, truncated: true }, options)).toContain(
      "Liste tronquée",
    );
  });

  it("is byte-identical for identical input", () => {
    const shuffled = { ...model, items: [...model.items].reverse() };
    expect(buildReleaseNotesMarkdown(shuffled, options)).toBe(
      buildReleaseNotesMarkdown(model, options),
    );
  });
});

describe("escapeMarkdownText", () => {
  it("escapes inline markup, HTML and block markers", () => {
    expect(escapeMarkdownText("a*b_c[d](e)#f<g>`h`\\i|j~k")).toBe(
      "a\\*b\\_c\\[d\\](e)\\#f\\<g\\>\\`h\\`\\\\i\\|j\\~k",
    );
    expect(escapeMarkdownText("1. Liste")).toBe("1\\. Liste");
    expect(escapeMarkdownText("- tiret")).toBe("\\- tiret");
    expect(escapeMarkdownText("+ plus")).toBe("\\+ plus");
    expect(escapeMarkdownText("> citation")).toBe("\\> citation");
  });

  it("neutralizes block constructs on every line", () => {
    expect(escapeMarkdownText("Titre\n---\n===\n-\n1) liste\n2.\n    code\n\tcode")).toBe(
      "Titre\n\\---\n\\===\n\\-\n1\\) liste\n2\\.\ncode\ncode",
    );
  });

  it("treats lone carriage returns and Unicode separators as line breaks", () => {
    expect(escapeMarkdownText("x\r# h")).toBe("x\n\\# h");
    expect(escapeMarkdownText("x\u2028# h", { singleLine: true })).toBe("x \\# h");
    expect(escapeMarkdownText("x\r# h", { singleLine: true })).toBe("x \\# h");
  });

  it("flattens line breaks in single-line fields", () => {
    expect(escapeMarkdownText("ligne 1\r\nligne 2", { singleLine: true })).toBe("ligne 1 ligne 2");
  });
});
