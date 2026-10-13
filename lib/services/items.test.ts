import { describe, expect, it, vi } from "vitest";
import { listLiveParentCandidates } from "@/lib/services/items";

vi.mock("server-only", () => ({}));

describe("listLiveParentCandidates", () => {
  // Built, never run: the query reads no database here.
  const query = listLiveParentCandidates("backlog-1").toSQL();

  it("reads only what a creation form shows of a parent", () => {
    expect(query.sql).toMatch(
      /^select "id", "key", "type", "title" from "items" /,
    );
  });

  it("keeps the live parent levels of the backlog, whatever the view filters", () => {
    expect(query.sql).toContain(
      '"items"."backlog_id" = $1 and "items"."deleted_at" is null and "items"."type" in ($2, $3, $4)',
    );
    expect(query.params).toEqual(["backlog-1", "composant", "epic", "tache"]);
    // No Fix-version join: a Version filter never narrows the candidates.
    expect(query.sql).not.toContain("item_fix_versions");
  });

  it("orders the candidates like the backlog rows", () => {
    expect(query.sql).toMatch(
      /order by "items"\."depth" asc, "items"\."rank" collate "C" asc, "items"\."key" asc$/,
    );
  });
});
