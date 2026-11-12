import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createApiTokenAction: vi.fn(),
  refresh: vi.fn(),
  revokeApiTokenAction: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh, push: vi.fn() }) }));
vi.mock("@/app/actions/api-tokens", () => ({
  createApiTokenAction: mocks.createApiTokenAction,
  revokeApiTokenAction: mocks.revokeApiTokenAction,
}));
vi.mock("@/lib/toast", () => ({ toast: { success: mocks.toastSuccess, error: mocks.toastError } }));

import { ApiTokensPanel, type ApiTokenView } from "@/components/account/api-tokens-panel";

const tokens: ApiTokenView[] = [
  {
    id: "token-1",
    name: "Herdr",
    tokenPrefix: "Ab3dEf9h",
    scope: "read",
    expiresAt: "2027-02-10T21:00:00.000Z",
    lastUsedAt: "2026-11-12T20:00:00.000Z",
    createdAt: "2026-11-12T21:00:00.000Z",
  },
  {
    id: "token-2",
    name: "Agents",
    tokenPrefix: "Zz9yXx8w",
    scope: "write",
    expiresAt: "2020-01-01T00:00:00.000Z",
    lastUsedAt: null,
    createdAt: "2019-12-01T00:00:00.000Z",
  },
];

beforeEach(() => vi.clearAllMocks());

describe("ApiTokensPanel", () => {
  it("lists the tokens with their prefix, scope, expiry and last use, never the secret", () => {
    render(<ApiTokensPanel tokens={tokens} />);

    const list = screen.getByRole("list", { name: "Jetons d’accès" });
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(within(items[0]!).getByText("Herdr")).toBeVisible();
    expect(within(items[0]!).getByText("jiroo_pat_Ab3dEf9h…")).toBeVisible();
    expect(within(items[0]!).getByText("Lecture")).toBeVisible();
    expect(within(items[0]!).getByText(/Dernier usage le/)).toBeVisible();
    expect(within(items[1]!).getByText("Lecture et écriture")).toBeVisible();
    expect(within(items[1]!).getByText("Expiré")).toBeVisible();
    expect(within(items[1]!).getByText(/Jamais utilisé/)).toBeVisible();
    expect(screen.getByText("2 jetons actifs.")).toBeVisible();
  });

  it("shows the empty state and the create button without tokens", () => {
    render(<ApiTokensPanel tokens={[]} />);
    expect(screen.getByText("Vous n’avez aucun jeton.")).toBeVisible();
    expect(screen.queryByRole("list", { name: "Jetons d’accès" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Créer un jeton" })).toBeEnabled();
  });

  it("creates a read token for 90 days by default and reveals the secret once", async () => {
    const interaction = userEvent.setup();
    mocks.createApiTokenAction.mockResolvedValue({
      ok: true,
      token: "jiroo_pat_secret-value",
      row: { id: "token-3", name: "Claude Code" },
    });
    render(<ApiTokensPanel tokens={[]} />);

    await interaction.click(screen.getByRole("button", { name: "Créer un jeton" }));
    const dialog = await screen.findByRole("dialog", { name: "Créer un jeton d’accès" });
    const submit = within(dialog).getByRole("button", { name: "Créer le jeton" });
    expect(submit).toBeDisabled();
    await interaction.type(within(dialog).getByLabelText("Nom"), "Claude Code");
    await interaction.click(submit);

    await waitFor(() => expect(mocks.createApiTokenAction).toHaveBeenCalledWith({
      name: "Claude Code",
      scope: "read",
      expiresInDays: 90,
    }));
    const reveal = await screen.findByRole("dialog", { name: "Jeton « Claude Code » créé" });
    expect(within(reveal).getByLabelText("Jeton d’accès")).toHaveValue("jiroo_pat_secret-value");
    expect(mocks.refresh).toHaveBeenCalledOnce();

    await interaction.click(within(reveal).getByRole("button", { name: "J’ai copié le jeton" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.queryByText("jiroo_pat_secret-value")).not.toBeInTheDocument();
  });

  it("keeps the dialog open and shows the server's message when creation fails", async () => {
    const interaction = userEvent.setup();
    mocks.createApiTokenAction.mockResolvedValue({ ok: false, error: "Donnez un nom à ce jeton." });
    render(<ApiTokensPanel tokens={[]} />);

    await interaction.click(screen.getByRole("button", { name: "Créer un jeton" }));
    const dialog = await screen.findByRole("dialog", { name: "Créer un jeton d’accès" });
    await interaction.type(within(dialog).getByLabelText("Nom"), "x");
    await interaction.click(within(dialog).getByRole("button", { name: "Créer le jeton" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Donnez un nom à ce jeton.");
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("revokes a token after confirmation and refreshes the list", async () => {
    const interaction = userEvent.setup();
    mocks.revokeApiTokenAction.mockResolvedValue({ ok: true });
    render(<ApiTokensPanel tokens={tokens} />);

    await interaction.click(screen.getByRole("button", { name: "Révoquer le jeton Herdr" }));
    const dialog = await screen.findByRole("dialog", { name: "Révoquer le jeton « Herdr » ?" });
    expect(mocks.revokeApiTokenAction).not.toHaveBeenCalled();
    await interaction.click(within(dialog).getByRole("button", { name: "Révoquer" }));

    await waitFor(() => expect(mocks.revokeApiTokenAction).toHaveBeenCalledWith({ id: "token-1" }));
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledOnce());
    expect(mocks.toastSuccess).toHaveBeenCalledWith("Jeton « Herdr » révoqué.");
  });

  it("reports a revocation the server refused", async () => {
    const interaction = userEvent.setup();
    mocks.revokeApiTokenAction.mockResolvedValue({ ok: false, error: "Ce jeton n’existe plus." });
    render(<ApiTokensPanel tokens={tokens} />);

    await interaction.click(screen.getByRole("button", { name: "Révoquer le jeton Agents" }));
    const dialog = await screen.findByRole("dialog", { name: "Révoquer le jeton « Agents » ?" });
    await interaction.click(within(dialog).getByRole("button", { name: "Révoquer" }));

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith("Ce jeton n’existe plus."));
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
});
