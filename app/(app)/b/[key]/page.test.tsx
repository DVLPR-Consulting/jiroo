import type { ReactElement } from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAppPageSession: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", () => ({
  requireAppPageSession: mocks.requireAppPageSession,
}));
vi.mock("@/components/items/backlog-view-content", () => ({
  BacklogViewContent: () => null,
}));

import BacklogPage from "@/app/(app)/b/[key]/page";

async function renderPage(search: Record<string, string>) {
  return (await BacklogPage({
    params: Promise.resolve({ key: "CASS" }),
    searchParams: Promise.resolve(search),
  })) as ReactElement<{ fallback: ReactElement }>;
}

describe("BacklogPage loading fallback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAppPageSession.mockResolvedValue({ user: { id: "user-1" } });
  });

  it.each([
    ["backlog", "Chargement du backlog"],
    ["board", "Chargement du board"],
    ["list", "Chargement de la liste"],
    ["tree", "Chargement de l’arbre"],
  ])("streams the %s view behind its own skeleton", async (view, label) => {
    const page = await renderPage({ view });

    render(page.props.fallback);
    expect(screen.getByRole("status", { name: label })).toHaveAttribute("data-skeleton", view);
  });

  it("keys the boundary by view so a view switch shows the new skeleton", async () => {
    const list = await renderPage({ view: "list", q: "bug" });
    const filtered = await renderPage({ view: "list", q: "autre" });
    const board = await renderPage({});

    expect(list.key).toBe("list");
    // Filtering keeps the boundary: the current content stays until it updates.
    expect(filtered.key).toBe(list.key);
    expect(board.key).toBe("board");
  });
});
