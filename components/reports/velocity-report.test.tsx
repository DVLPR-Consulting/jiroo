import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { VelocityReportView } from "@/components/reports/velocity-report";

describe("VelocityReportView", () => {
  it("keeps chart labels, exact table values, inclusion reasons, and detail links in sync", () => {
    render(
      <VelocityReportView
        backlogKey="CASS"
        report={{
          state: "ready",
          label: null,
          limit: 7,
          population: 2,
          averageCompletedPoints: 2.5,
          bars: [
            { sprintId: "s1", sprintName: "Sprint 1", completedAt: "2026-08-01T12:00:00.000Z", committedPoints: 10, completedPoints: 0, includedInAverage: true, excludedReason: null },
            { sprintId: "s2", sprintName: "Sprint 2", completedAt: "2026-08-08T12:00:00.000Z", committedPoints: 0, completedPoints: 0, includedInAverage: false, excludedReason: "no_point_data" },
            { sprintId: "s3", sprintName: "Sprint 3", completedAt: "2026-08-15T12:00:00.000Z", committedPoints: 8, completedPoints: 5, includedInAverage: true, excludedReason: null },
            { sprintId: "s4", sprintName: "Legacy", completedAt: "2026-08-22T12:00:00.000Z", committedPoints: null, completedPoints: null, includedInAverage: false, excludedReason: "history_unavailable" },
          ],
        }}
      />,
    );

    expect(screen.getByRole("group", { name: "Sprint 3 — engagement 8 points, terminé 5 points" })).toBeVisible();
    expect(screen.getByText("Moyenne des points terminés : 2,5 sur 2 sprints inclus")).toBeVisible();
    expect(screen.getByRole("row", { name: /Sprint 3 8 5 .*Incluse/ })).toBeVisible();
    expect(screen.getByRole("row", { name: /Sprint 2 0 0 .*Exclue Aucune donnée de points/ })).toBeVisible();
    expect(screen.getByRole("row", { name: /Legacy.*Historique détaillé indisponible/ })).toBeVisible();
    expect(within(screen.getByRole("row", { name: /Sprint 3/ })).getByRole("link"))
      .toHaveAttribute("href", "/b/CASS/reports?report=sprint&sprint=s3");
    expect(screen.getByRole("link", { name: "12 sprints" })).toHaveAttribute(
      "href",
      "/b/CASS/reports?report=velocity&limit=12",
    );
  });

  it("renders the explicit empty velocity state without a forecast", () => {
    render(
      <VelocityReportView
        backlogKey="CASS"
        report={{
          state: "empty",
          label: "Pas encore de vélocité",
          limit: 7,
          bars: [
            { sprintId: "s2", sprintName: "Sprint sans points", completedAt: "2026-08-08T12:00:00.000Z", committedPoints: 0, completedPoints: 0, includedInAverage: false, excludedReason: "no_point_data" },
          ],
          population: 0,
          averageCompletedPoints: null,
        }}
      />,
    );
    expect(screen.getByText("Pas encore de vélocité")).toBeVisible();
    expect(screen.getByRole("row", { name: /Sprint sans points 0 0 .*Exclue Aucune donnée de points/ })).toBeVisible();
    expect(screen.getByRole("link", { name: "12 sprints" })).toBeVisible();
    expect(screen.queryByText(/prévision/i)).not.toBeInTheDocument();
  });
});
