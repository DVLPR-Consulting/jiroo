import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import LoginPage from "@/app/(auth)/login/page";
import TwoFactorPage from "@/app/(auth)/2fa/page";
import EnrollPage from "@/app/(auth)/2fa/enroll/page";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  signInEmail: vi.fn(),
  verifyTotp: vi.fn(),
  enableTwoFactor: vi.fn(),
  qrToDataUrl: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock("@/lib/auth/client", () => ({
  authClient: {
    signIn: { email: mocks.signInEmail },
    twoFactor: {
      enable: mocks.enableTwoFactor,
      verifyTotp: mocks.verifyTotp,
    },
  },
}));

vi.mock("qrcode", () => ({
  default: { toDataURL: mocks.qrToDataUrl },
}));

describe("parcours 2FA", () => {
  beforeEach(() => {
    mocks.push.mockReset();
    mocks.signInEmail.mockReset();
    mocks.verifyTotp.mockReset();
    mocks.enableTwoFactor.mockReset();
    mocks.qrToDataUrl.mockReset();
  });

  it("routes a successful password-only login to 2FA enrollment", async () => {
    const interaction = userEvent.setup();
    mocks.signInEmail.mockResolvedValue({
      data: {
        redirect: false,
        token: "session-token",
        url: undefined,
        user: {
          id: "user-1",
          name: "Marie Martin",
          email: "marie@example.test",
          emailVerified: true,
          image: null,
          createdAt: new Date("2026-08-04T00:00:00Z"),
          updatedAt: new Date("2026-08-04T00:00:00Z"),
          role: "contributor",
          twoFactorEnabled: false,
        },
      },
      error: null,
    });
    render(<LoginPage />);

    await interaction.type(screen.getByRole("textbox", { name: "E-mail" }), "marie@example.test");
    await interaction.type(screen.getByLabelText("Mot de passe"), "secret-test");
    await interaction.click(screen.getByRole("button", { name: "Se connecter" }));

    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/2fa/enroll"));
  });

  it("routes an enrolled user with a trusted device directly to the app", async () => {
    const interaction = userEvent.setup();
    mocks.signInEmail.mockResolvedValue({
      data: {
        redirect: false,
        token: "session-token",
        url: undefined,
        user: {
          id: "user-1",
          name: "Marie Martin",
          email: "marie@example.test",
          emailVerified: true,
          image: null,
          createdAt: new Date("2026-08-04T00:00:00Z"),
          updatedAt: new Date("2026-08-04T00:00:00Z"),
          role: "contributor",
          twoFactorEnabled: true,
        },
      },
      error: null,
    });
    render(<LoginPage />);

    await interaction.type(screen.getByRole("textbox", { name: "E-mail" }), "marie@example.test");
    await interaction.type(screen.getByLabelText("Mot de passe"), "secret-test");
    await interaction.click(screen.getByRole("button", { name: "Se connecter" }));

    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/"));
  });

  it("leaves the untrusted-device challenge redirect to the Better Auth client hook", async () => {
    const interaction = userEvent.setup();
    mocks.signInEmail.mockResolvedValue({
      data: { twoFactorRedirect: true, twoFactorMethods: ["totp"] },
      error: null,
    });
    render(<LoginPage />);

    await interaction.type(screen.getByRole("textbox", { name: "E-mail" }), "marie@example.test");
    await interaction.type(screen.getByLabelText("Mot de passe"), "secret-test");
    await interaction.click(screen.getByRole("button", { name: "Se connecter" }));

    await waitFor(() => expect(mocks.signInEmail).toHaveBeenCalledTimes(1));
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("renders an explicit Verify action on the TOTP challenge", () => {
    render(<TwoFactorPage />);

    expect(screen.getByRole("button", { name: "Vérifier" })).toBeDisabled();
  });

  it("requires recovery-code acknowledgement before keyboard activation", async () => {
    const interaction = userEvent.setup();
    mocks.enableTwoFactor.mockResolvedValue({
      data: {
        totpURI: "otpauth://totp/Jiroo:marie@example.test?secret=ABCDEF&issuer=Jiroo",
        backupCodes: Array.from({ length: 10 }, (_, index) => `CODE-${index}`),
      },
      error: null,
    });
    mocks.qrToDataUrl.mockResolvedValue("data:image/png;base64,qr");
    mocks.verifyTotp.mockResolvedValue({ data: { status: true }, error: null });
    render(<EnrollPage />);

    await interaction.type(screen.getByLabelText("Mot de passe"), "secret-test");
    await interaction.click(screen.getByRole("button", { name: "Continuer" }));

    const activate = await screen.findByRole("button", { name: "Activer et continuer" });
    expect(activate).toBeDisabled();

    const digits = screen.getAllByRole("textbox", { name: /Chiffre/ });
    for (const [index, value] of [..."123456"].entries()) {
      fireEvent.change(digits[index]!, { target: { value } });
    }
    expect(mocks.verifyTotp).not.toHaveBeenCalled();

    await interaction.click(screen.getByRole("checkbox", { name: /J'ai enregistré/i }));
    for (const [index, value] of [..."123456"].entries()) {
      fireEvent.change(digits[index]!, { target: { value } });
    }
    expect(activate).toBeEnabled();
    await interaction.click(activate);

    await waitFor(() =>
      expect(mocks.verifyTotp).toHaveBeenCalledWith({ code: "123456" }),
    );
  });
});
