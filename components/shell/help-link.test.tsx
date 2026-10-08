import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { HelpLink } from "@/components/shell/help-link";

describe("HelpLink", () => {
  it("links to the user guide with an accessible name", () => {
    render(<HelpLink />);

    const link = screen.getByRole("link", { name: "Aide" });
    expect(link).toHaveAttribute("href", "/aide");
    expect(link.querySelector(".lucide-circle-question-mark")).toBeInTheDocument();
  });

  it("is reachable with the keyboard", async () => {
    const user = userEvent.setup();
    render(<HelpLink />);

    await user.tab();

    expect(screen.getByRole("link", { name: "Aide" })).toHaveFocus();
  });
});
