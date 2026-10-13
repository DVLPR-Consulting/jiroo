import type { ComponentType } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import HomeLoading from "@/app/(app)/loading";
import AdminLoading from "@/app/(app)/admin/loading";
import HelpLoading from "@/app/(app)/aide/loading";
import MineLoading from "@/app/(app)/mine/loading";
import TrashLoading from "@/app/(app)/trash/loading";
import ReleasesLoading from "@/app/(app)/b/[key]/releases/loading";
import ReleaseDetailLoading from "@/app/(app)/b/[key]/releases/[releaseId]/loading";
import ReleaseNotesLoading from "@/app/(app)/b/[key]/releases/[releaseId]/notes/loading";
import ReportsLoading from "@/app/(app)/b/[key]/reports/loading";
import AccessLoading from "@/app/(app)/b/[key]/settings/access/loading";

/** JIR-84: each route segment streams its own placeholder, not the board's. */
const ROUTES: [string, ComponentType, string, string][] = [
  ["/", HomeLoading, "Chargement des backlogs", "home"],
  ["/admin", AdminLoading, "Chargement de l’administration", "admin"],
  ["/aide", HelpLoading, "Chargement du guide", "help"],
  ["/mine", MineLoading, "Chargement de mes items", "mine"],
  ["/trash", TrashLoading, "Chargement de la corbeille", "trash"],
  ["/b/[key]/releases", ReleasesLoading, "Chargement des releases", "releases"],
  ["/b/[key]/releases/[releaseId]", ReleaseDetailLoading, "Chargement de la release", "release"],
  [
    "/b/[key]/releases/[releaseId]/notes",
    ReleaseNotesLoading,
    "Chargement des notes de release",
    "release-notes",
  ],
  ["/b/[key]/reports", ReportsLoading, "Chargement des rapports…", "reports"],
  ["/b/[key]/settings/access", AccessLoading, "Chargement des accès", "access"],
];

describe("route loading skeletons", () => {
  it.each(ROUTES)("%s announces its own placeholder", (_route, Loading, label, shape) => {
    const { container } = render(<Loading />);

    const region = screen.getByRole("status", { name: label });
    expect(region).toHaveAttribute("aria-busy", "true");
    expect(region).toHaveAttribute("data-skeleton", shape);
    // One announced region; the bars themselves are hidden from screen readers.
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(container.querySelector("main, h1")).toBeNull();
    const bars = container.querySelectorAll('[data-slot="skeleton"]');
    expect(bars).not.toHaveLength(0);
    for (const bar of bars) expect(bar).toHaveAttribute("aria-hidden", "true");
  });

  it("gives every route a distinct shape", () => {
    expect(new Set(ROUTES.map(([, , , shape]) => shape)).size).toBe(ROUTES.length);
  });
});
