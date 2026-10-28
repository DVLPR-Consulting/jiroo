import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SprintsReviewView } from "@/components/reports/sprints-review";
import { calculateSprintReview, type SprintReviewRow } from "@/lib/reports/bilan-calculations";

export const reviewRow: SprintReviewRow = {
  id: "sprint-1", name: "Sprint actif", state: "active", start: "2026-10-19", end: "2026-10-30",
  ...calculateSprintReview({ initial: 13, added: 4, removed: 2, completed: 8, completedPoints: 24, finalCount: 15, bugs: 6, presence: 34 }),
};

describe("SprintsReviewView", () => {
  it("renders team totals, French ratios, dates and meaningful red indicators", () => {
    render(<SprintsReviewView backlogKey="CASS" report={{ rows: [reviewRow], limited: true }} />);
    const row = screen.getByRole("row", { name: /Sprint actif/ });
    expect(within(row).getByText("en cours")).toBeVisible();
    expect(within(row).getByText("19/10/2026 – 30/10/2026")).toBeVisible();
    expect(within(row).getByText("34 j-pers.")).toBeVisible();
    expect(within(row).getByText("53 %")).toHaveClass("text-destructive");
    expect(within(row).getByText("6 / 15")).toHaveClass("text-destructive");
    expect(within(row).getByText("0,7")).toBeVisible();
    expect(within(row).getByRole("link", { name: "Sprint actif" })).toHaveAttribute("href", "/b/CASS/reports?report=sprint&sprint=sprint-1");
    expect(screen.getByText(/50 derniers sprints clos/)).toBeVisible();
    expect(screen.getByText(/effectif assignable actuel/)).toBeVisible();
    expect(screen.getByText(/seuils à discuter/)).toBeVisible();
    expect(screen.getByRole("region", { name: "Bilan des sprints" })).toHaveAttribute("tabindex", "0");
  });

  it("keeps unknown history and unavailable presence blank, without inventing zero", () => {
    const row: SprintReviewRow = { ...reviewRow, state: "completed", end: null,
      ...calculateSprintReview({ initial: null, added: null, removed: null, completed: null, completedPoints: null, finalCount: null, bugs: null, presence: null }),
    };
    render(<SprintsReviewView backlogKey="CASS" report={{ rows: [row], limited: false }} />);
    expect(screen.getAllByRole("cell").filter((cell) => cell.textContent === "—")).toHaveLength(9);
    expect(screen.getByText(/fin inconnue/)).toBeVisible();
    expect(screen.queryByText("en cours")).not.toBeInTheDocument();
    expect(screen.queryByText(/50 derniers/)).not.toBeInTheDocument();
  });

  it("explains an empty backlog", () => {
    render(<SprintsReviewView backlogKey="CASS" report={{ rows: [], limited: false }} />);
    expect(screen.getByText("Aucun sprint actif ou terminé.")).toBeVisible();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});
