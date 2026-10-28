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
    expect(screen.getByRole("link", { name: "Burndown" }))
      .toHaveAttribute("href", "/b/CASS/reports?report=burndown");

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

  it("renders a URL-native Burndown tab that keeps the GET sprint selector", () => {
    render(
      <ReportNavigation
        backlogKey="CASS"
        report="burndown"
        selectedSprintId={sprints[1]!.id}
        sprints={sprints}
        plannedCount={0}
      />,
    );

    const burndown = screen.getByRole("link", { name: "Burndown" });
    // Switching presentation keeps the subject: the selected (older) sprint stays selected.
    expect(burndown).toHaveAttribute(
      "href",
      `/b/CASS/reports?report=burndown&sprint=${sprints[1]!.id}`,
    );
    expect(screen.getByRole("link", { name: "Rapport de sprint" })).toHaveAttribute(
      "href",
      `/b/CASS/reports?report=sprint&sprint=${sprints[1]!.id}`,
    );
    expect(burndown).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Rapport de sprint" }))
      .not.toHaveAttribute("aria-current");
    expect(screen.getByRole("link", { name: "Vélocité" })).not.toHaveAttribute("aria-current");
    const form = screen.getByRole("form", { name: "Choisir un sprint" });
    expect(form).toHaveAttribute("method", "get");
    expect(form).toHaveAttribute("action", "/b/CASS/reports");
    expect(screen.getByRole("combobox", { name: "Sprint" })).toHaveValue(sprints[1]!.id);
    expect(screen.getByDisplayValue("burndown")).toHaveAttribute("name", "report");
  });

  it("does not mark Burndown current on other reports and hides the selector for velocity", () => {
    render(
      <ReportNavigation
        backlogKey="CASS"
        report="velocity"
        selectedSprintId={sprints[0]!.id}
        sprints={sprints}
        plannedCount={0}
      />,
    );

    expect(screen.getByRole("link", { name: "Burndown" })).not.toHaveAttribute("aria-current");
    expect(screen.queryByRole("form", { name: "Choisir un sprint" })).not.toBeInTheDocument();
  });

  it("shows the empty sprint states on the burndown report", () => {
    const { rerender } = render(
      <ReportNavigation
        backlogKey="CASS"
        report="burndown"
        selectedSprintId={null}
        sprints={[]}
        plannedCount={0}
      />,
    );

    expect(screen.getByText("Aucun sprint actif ou terminé.")).toBeVisible();

    rerender(
      <ReportNavigation
        backlogKey="CASS"
        report="burndown"
        selectedSprintId={null}
        sprints={[]}
        plannedCount={1}
      />,
    );

    expect(screen.getByText("1 sprint est planifié, mais aucun n’a encore démarré.")).toBeVisible();
  });
});

it("opens the team review without a sprint selector", () => {
  render(<ReportNavigation backlogKey="CASS" report="bilan" selectedSprintId={null} sprints={sprints} plannedCount={0} />);
  expect(screen.getByRole("link", { name: "Bilan des sprints" })).toHaveAttribute("aria-current", "page");
  expect(screen.getByRole("link", { name: "Bilan des sprints" })).toHaveAttribute("href", "/b/CASS/reports?report=bilan");
  expect(screen.queryByRole("form", { name: "Choisir un sprint" })).not.toBeInTheDocument();
});
