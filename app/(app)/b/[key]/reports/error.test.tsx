import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ReportsError from "@/app/(app)/b/[key]/reports/error";
import ReportsLoading from "@/app/(app)/b/[key]/reports/loading";

describe("ReportsError", () => {
  it("shows safe recovery copy without exposing the error payload", () => {
    const retry = vi.fn();
    const secret = [
      "postgres://jiroo:secret@db.internal/reports",
      "authorization: Bearer private-token",
      "11111111-1111-4111-8111-111111111111",
    ].join(" ");

    render(<ReportsError error={new Error(secret)} retry={retry} />);

    expect(screen.getByRole("heading", { name: "Impossible de charger les rapports" }))
      .toBeVisible();
    expect(screen.queryByText(/postgres|authorization|11111111/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Réessayer" }));
    expect(retry).toHaveBeenCalledOnce();
  });
});

describe("ReportsLoading", () => {
  it("uses a status without nesting another main landmark", () => {
    const { container } = render(<ReportsLoading />);

    expect(screen.getByRole("status", { name: "Chargement des rapports…" })).toBeVisible();
    expect(container.querySelector("main")).toBeNull();
  });
});
