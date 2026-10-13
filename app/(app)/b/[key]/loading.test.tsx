import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ search: "" }));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(mocks.search),
}));

import BacklogLoading from "@/app/(app)/b/[key]/loading";

describe("BacklogLoading", () => {
  beforeEach(() => {
    mocks.search = "";
  });

  it.each([
    ["view=backlog", "backlog", "Chargement du backlog"],
    ["view=board", "board", "Chargement du board"],
    ["view=list&q=bug", "list", "Chargement de la liste"],
    ["view=tree", "tree", "Chargement de l’arbre"],
    ["", "board", "Chargement du board"],
    ["view=unknown", "board", "Chargement du board"],
  ])("follows ?%s with the %s skeleton", (search, shape, label) => {
    mocks.search = search;
    render(<BacklogLoading />);

    expect(screen.getByRole("status", { name: label })).toHaveAttribute("data-skeleton", shape);
  });
});
