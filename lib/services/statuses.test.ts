import { describe, expect, it } from "vitest";
import { buildStatusMigrationActivities } from "@/lib/services/statuses";

describe("status migration audit", () => {
  it("stores stable business names because the source status is deleted", () => {
    expect(
      buildStatusMigrationActivities(
        [{ id: "item-1" }],
        { id: "status-old", name: "Prêt livraison" },
        { id: "status-new", name: "En cours" },
        "admin-1",
      ),
    ).toEqual([
      {
        itemId: "item-1",
        actorId: "admin-1",
        action: "status_change",
        field: "status",
        oldValue: "Prêt livraison",
        newValue: "En cours",
      },
    ]);
  });
});
