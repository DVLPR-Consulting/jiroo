import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ReportNavigation } from "@/components/reports/report-navigation";

const sprints = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Sprint actif",
    state: "active" as const,
    hasSnapshot: false,
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    name: "Sprint terminé",
    state: "completed" as const,
    hasSnapshot: true,
  },
];

describe("ReportNavigation", () => {
  it("renders URL-native tabs and a GET sprint selector", () => {
    render(
      <ReportNavigation
        backlogKey="CASS"
        report="sprint"
        selectedSprintId={sprints[0]!.id}
        sprints={sprints}
        plannedCount={0}
      />,
    );

    expect(screen.getByRole("link", { name: "Rapport de sprint" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Vélocité" })).toHaveAttribute(
      "href",
      "/b/CASS/reports?report=velocity&limit=7",
    );
    const form = screen.getByRole("form", { name: "Choisir un sprint" });
    expect(form).toHaveAttribute("method", "get");
    expect(form).toHaveAttribute("action", "/b/CASS/reports");
    expect(screen.getByRole("combobox", { name: "Sprint" })).toHaveValue(sprints[0]!.id);
    expect(screen.getAllByRole("option")).toHaveLength(2);
    expect(screen.getByDisplayValue("sprint")).toHaveAttribute("name", "report");
  });

  it("distinguishes no sprint from planned-only work", () => {
    const { rerender } = render(
      <ReportNavigation
        backlogKey="CASS"
        report="sprint"
        selectedSprintId={null}
        sprints={[]}
        plannedCount={0}
      />,
    );

    expect(screen.getByText("Aucun sprint actif ou terminé.")).toBeVisible();

    rerender(
      <ReportNavigation
        backlogKey="CASS"
        report="sprint"
        selectedSprintId={null}
        sprints={[]}
        plannedCount={2}
      />,
    );

    expect(screen.getByText("2 sprints sont planifiés, mais aucun n’a encore démarré.")).toBeVisible();
    expect(screen.queryByText("Aucun sprint actif ou terminé.")).not.toBeInTheDocument();
  });
});
