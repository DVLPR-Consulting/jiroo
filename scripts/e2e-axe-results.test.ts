// @vitest-environment node
import { describe, expect, it } from "vitest";
import { formatAxeViolations, type AxeScan } from "../e2e/support/axe-results";

type Violation = AxeScan["violations"][number];
function violation(id: string, impact: Violation["impact"]): Violation {
  return {
    id, impact, description: "Synthetic description", help: "Not retained",
    helpUrl: "https://example.test/rules/" + id, tags: ["wcag2a"],
    nodes: [{ html: '<input value="private synthetic content">', target: ["#synthetic"],
      failureSummary: "Synthetic failure", any: [], all: [], none: [], impact }],
  };
}

describe("axe evidence formatting", () => {
  it("keeps only the permitted fields and excludes HTML and check details", () => {
    const input = { violations: [violation("synthetic", "serious")] };
    const output = formatAxeViolations(input);
    expect(JSON.parse(output)).toEqual([{
      id: "synthetic", impact: "serious", description: "Synthetic description",
      helpUrl: "https://example.test/rules/synthetic", tags: ["wcag2a"],
      nodes: [{ target: ["#synthetic"], failureSummary: "Synthetic failure" }],
    }]);
    expect(output).not.toContain("private synthetic content");
    expect(output).not.toContain('"html"');
    expect(output).not.toContain('"any"');
    expect(output).not.toContain('"help"');
  });

  it("orders critical before serious, moderate, minor and unknown impact, then by id", () => {
    const input = { violations: [
      violation("unknown", null), violation("minor", "minor"), violation("z-serious", "serious"),
      violation("moderate", "moderate"), violation("critical", "critical"), violation("a-serious", "serious"),
    ] };
    const original = structuredClone(input);
    expect(JSON.parse(formatAxeViolations(input)).map((value: { id: string }) => value.id)).toEqual([
      "critical", "a-serious", "z-serious", "moderate", "minor", "unknown",
    ]);
    expect(input).toEqual(original);
  });

  it("retains nested frame targets and allows absent failure summaries", () => {
    const value = violation("frame", "moderate");
    value.nodes[0]!.target = [["#frame", "#field"]];
    delete value.nodes[0]!.failureSummary;
    expect(JSON.parse(formatAxeViolations({ violations: [value] }))[0].nodes)
      .toEqual([{ target: [["#frame", "#field"]] }]);
  });

  it("writes an empty JSON array for a clean scan", () => {
    expect(JSON.parse(formatAxeViolations({ violations: [] }))).toEqual([]);
  });
});
