import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SprintEventJournal } from "@/components/reports/sprint-event-journal";

describe("SprintEventJournal", () => {
  it("renders chronological French summaries and preserves the item page", () => {
    render(
      <SprintEventJournal
        backlogKey="CASS"
        sprintId="11111111-1111-4111-8111-111111111111"
        itemPage={3}
        events={{
          page: 2,
          pageSize: 2,
          total: 6,
          rows: [
            {
              id: "event-1",
              sequence: "9",
              eventType: "item_added",
              occurredAt: "2026-08-01T10:00:00.000Z",
              actor: { id: "actor-1", name: "Ada" },
              itemId: "item-1",
              itemKey: "CASS-42",
              itemTitle: "Paiement",
              previousEstimate: null,
              nextEstimate: 5,
              previousDone: null,
              nextDone: null,
              relatedSprint: null,
              removalReason: null,
            },
            {
              id: "event-2",
              sequence: "10",
              eventType: "estimate_changed",
              occurredAt: "2026-08-01T10:00:00.000Z",
              actor: { id: "actor-1", name: "Ada" },
              itemId: "item-1",
              itemKey: "CASS-42",
              itemTitle: "Paiement",
              previousEstimate: null,
              nextEstimate: 8,
              previousDone: null,
              nextDone: null,
              relatedSprint: null,
              removalReason: null,
            },
            {
              id: "event-3",
              sequence: "11",
              eventType: "item_removed",
              occurredAt: "2026-08-01T10:01:00.000Z",
              actor: { id: "actor-1", name: "Ada" },
              itemId: null,
              itemKey: "CASS-43",
              itemTitle: "Ancien paiement",
              previousEstimate: 3,
              nextEstimate: null,
              previousDone: null,
              nextDone: null,
              relatedSprint: null,
              removalReason: "deleted",
            },
          ],
        }}
      />,
    );

    const journal = screen.getByRole("region", { name: "Journal du sprint" });
    expect(journal).toHaveTextContent("Ada a ajouté CASS-42 au sprint avec 5 pts");
    expect(journal).toHaveTextContent("Ada a modifié CASS-42 : Non estimé → 8 pts");
    expect(journal).toHaveTextContent("Ada a supprimé CASS-43 du sprint avec 3 pts");
    expect(within(journal).getAllByRole("listitem")[0]).toHaveTextContent("ajouté");
    expect(within(journal).getAllByRole("listitem")[1]).toHaveTextContent("modifié");
    expect(within(journal).getAllByRole("time")[0]).toHaveAttribute(
      "datetime",
      "2026-08-01T10:00:00.000Z",
    );
    expect(within(screen.getByRole("navigation", { name: "Pagination du journal" }))
      .getByRole("link", { name: "Précédent" }).getAttribute("href"))
      .toContain("itemPage=3");
    expect(journal).not.toHaveTextContent("correlation");
  });
});
