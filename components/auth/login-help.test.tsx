import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { LoginHelp } from "@/components/auth/login-help";

describe("LoginHelp", () => {
  it("reveals the password guidance through an accessible disclosure", async () => {
    const user = userEvent.setup();
    render(<LoginHelp />);

    const button = screen.getByRole("button", { name: "Mot de passe oublié ?" });
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.queryByText("Contactez un administrateur Jiroo pour réinitialiser votre accès."),
    ).not.toBeInTheDocument();

    await user.click(button);

    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(
      screen.getByText("Contactez un administrateur Jiroo pour réinitialiser votre accès."),
    ).toBeInTheDocument();
  });

  it("reveals first-connection guidance without rendering an email reset flow", async () => {
    const user = userEvent.setup();
    render(<LoginHelp />);

    const button = screen.getByRole("button", { name: "Première connexion ?" });
    expect(button).toHaveAttribute("aria-expanded", "false");

    await user.click(button);

    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(
      screen.getByText(
        "Connectez-vous avec le mot de passe transmis : la configuration 2FA vous sera proposée avant l’accès à l’application.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /réinitialiser|envoyer/i })).not.toBeInTheDocument();
  });
});
