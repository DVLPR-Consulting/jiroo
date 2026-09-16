import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import AppError from "@/app/(app)/error";

describe("AppError", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("retries through the stable Next.js error boundary prop", () => {
    const retry = vi.fn();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    render(<AppError error={new Error("boom")} retry={retry} />);

    fireEvent.click(screen.getByRole("button", { name: "Réessayer" }));
    expect(retry).toHaveBeenCalledOnce();
    expect(consoleError).toHaveBeenCalled();
  });
});
