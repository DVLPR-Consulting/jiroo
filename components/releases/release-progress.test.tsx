import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ReleaseProgress } from "@/components/releases/release-progress";

describe("ReleaseProgress", () => {
  it("labels every segment without color and links to exact filtered item sets", () => {
    render(
      <ReleaseProgress
        backlogKey="CASS"
        releaseId="22222222-2222-4222-8222-222222222222"
        progress={{
          total: 6,
          todo: 2,
          inProgress: 1,
          done: 3,
          totalPoints: 13,
          donePoints: 8,
          unestimated: 1,
        }}
        statusIds={{
          todo: ["todo-1", "todo-2"],
          inProgress: ["doing-1"],
          done: ["done-1"],
        }}
        detailHref="/b/CASS/releases/22222222-2222-4222-8222-222222222222"
      />,
    );

    expect(screen.getByText("3 terminés sur 6")).toBeVisible();
    expect(screen.getByText("8 / 13 points")).toBeVisible();
    expect(screen.getByText("1 non estimé")).toBeVisible();
    expect(screen.getByRole("link", { name: "À faire : 2" })).toHaveAttribute(
      "href",
      "/b/CASS?view=list&version=22222222-2222-4222-8222-222222222222&status=todo-1,todo-2",
    );
    expect(screen.getByRole("link", { name: "En cours : 1" })).toHaveAttribute(
      "href",
      "/b/CASS?view=list&version=22222222-2222-4222-8222-222222222222&status=doing-1",
    );
    expect(screen.getByRole("link", { name: "Terminés : 3" })).toHaveAttribute(
      "href",
      "/b/CASS?view=list&version=22222222-2222-4222-8222-222222222222&status=done-1",
    );
    expect(screen.getByRole("link", { name: "3 terminés sur 6" })).toHaveAttribute(
      "href",
      "/b/CASS/releases/22222222-2222-4222-8222-222222222222",
    );
    expect(screen.getByRole("link", { name: "8 / 13 points" })).toHaveAttribute(
      "href",
      "/b/CASS/releases/22222222-2222-4222-8222-222222222222?scopeEstimate=estimated",
    );
    expect(screen.getByRole("link", { name: "1 non estimé" })).toHaveAttribute(
      "href",
      "/b/CASS/releases/22222222-2222-4222-8222-222222222222?scopeEstimate=unestimated",
    );
  });

  it("announces an empty release without dividing by zero", () => {
    render(
      <ReleaseProgress
        backlogKey="CASS"
        releaseId="22222222-2222-4222-8222-222222222222"
        progress={{
          total: 0,
          todo: 0,
          inProgress: 0,
          done: 0,
          totalPoints: 0,
          donePoints: 0,
          unestimated: 0,
        }}
        statusIds={{ todo: [], inProgress: [], done: [] }}
      />,
    );

    expect(screen.getByText("Aucun élément associé")).toBeVisible();
  });
});
