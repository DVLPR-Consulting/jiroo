// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

// Saved views are personal. Repository settings are an admin-only surface.
const EXCEPTIONS = new Set(["views.ts", "repo-connections.ts"]);

function directBacklogRevalidations(filename: string, source: string): string[] {
  const violations: string[] = [];
  const file = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true);
  function visit(node: ts.Node) {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "revalidatePath") {
      const argument = node.arguments[0];
      const prefix = argument && (
        ts.isStringLiteral(argument) || ts.isNoSubstitutionTemplateLiteral(argument)
          ? argument.text
          : ts.isTemplateExpression(argument) ? argument.head.text : ""
      );
      // Release pages still need their specific cache invalidation, in addition
      // to invalidateBacklog. Approved exception: only this index and its details.
      const releasePath = filename === "releases.ts" && argument && [
        "`/b/${backlogKey}/releases`",
        "`/b/${backlogKey}/releases/${releaseId}`",
      ].includes(argument.getText(file));
      if (prefix?.startsWith("/b/") && !releasePath) {
        violations.push(argument!.getText(file));
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  return violations;
}

describe("backlog realtime publication guard", () => {
  const directory = path.join(process.cwd(), "app/actions");
  const files = readdirSync(directory).filter((name) =>
    name.endsWith(".ts") && !name.endsWith(".test.ts") && !EXCEPTIONS.has(name),
  );
  it.each(files)("%s never bypasses backlog publication", (filename) => {
    expect(directBacklogRevalidations(filename, readFileSync(path.join(directory, filename), "utf8"))).toEqual([]);
  });

  it.each([
    'revalidatePath(`/b/${key}`)',
    'revalidatePath(\n "/b/DEMO/reports"\n)',
    "revalidatePath('/b/DEMO')",
  ])("detects direct backlog invalidation: %s", (source) => {
    expect(directBacklogRevalidations("items.ts", source)).toHaveLength(1);
  });

  it("does not extend the release exception to the backlog root or other actions", () => {
    expect(directBacklogRevalidations("releases.ts", 'revalidatePath(`/b/${backlogKey}`)')).toHaveLength(1);
    expect(directBacklogRevalidations("items.ts", 'revalidatePath(`/b/${backlogKey}/releases`)')).toHaveLength(1);
  });
});
