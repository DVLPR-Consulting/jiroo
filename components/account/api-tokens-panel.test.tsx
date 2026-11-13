import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
afterEach(() => vi.useRealTimers());

describe("ApiTokensPanel", () => {
  it("lists the tokens with their prefix, scope, expiry and last use, never the secret", () => {
    render(<ApiTokensPanel tokens={tokens} now="2026-11-12T22:00:00.000Z" />);

    const list = screen.getByRole("list", { name: "Jetons d’accès" });
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(within(items[0]!).getByText("Herdr")).toBeVisible();
    expect(within(items[0]!).getByText("jiroo_pat_Ab3dEf9h…")).toBeVisible();
    expect(within(items[0]!).getByText("Lecture")).toBeVisible();
    expect(within(items[0]!).getByText(/Dernière utilisation le/)).toBeVisible();
    expect(within(items[1]!).getByText("Lecture et écriture")).toBeVisible();
    expect(within(items[1]!).getByText("Expiré")).toBeVisible();
    expect(within(items[1]!).getByText(/Jamais utilisé/)).toBeVisible();
    expect(screen.getByText("2 jetons")).toBeVisible();
  });

  it("re-evaluates the expiry when the list is refreshed and while it stays open", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-12T21:00:00.000Z"));
    const soon: ApiTokenView = { ...tokens[0]!, id: "token-soon", name: "Bientôt", expiresAt: "2026-11-12T21:00:30.000Z" };
    const { rerender } = render(<ApiTokensPanel tokens={[soon]} now="2026-11-12T21:00:00.000Z" />);
    expect(screen.queryByText("Expiré")).not.toBeInTheDocument();

    // Refreshed by the server after the expiry: the badge appears without a remount.
    vi.setSystemTime(new Date("2026-11-12T21:01:00.000Z"));
    rerender(<ApiTokensPanel tokens={[{ ...soon }]} now="2026-11-12T21:01:00.000Z" />);
    expect(screen.getByText("Expiré")).toBeVisible();

    // Left open: the clock ticks on its own every minute.
    const later: ApiTokenView = { ...soon, id: "token-later", name: "Plus tard", expiresAt: "2026-11-12T21:02:30.000Z" };
    rerender(<ApiTokensPanel tokens={[later]} now="2026-11-12T21:01:00.000Z" />);
    expect(screen.queryByText("Expiré")).not.toBeInTheDocument();
    vi.setSystemTime(new Date("2026-11-12T21:03:00.000Z"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(screen.getByText("Expiré")).toBeVisible();
  });

  it("shows the empty state and the create button without tokens", () => {
    render(<ApiTokensPanel tokens={[]} now="2026-11-12T22:00:00.000Z" />);
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
    render(<ApiTokensPanel tokens={[]} now="2026-11-12T22:00:00.000Z" />);

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
    const reveal = await screen.findByRole("dialog", { name: "Jeton créé" });
    expect(within(reveal).getByLabelText("Jeton d’accès")).toHaveValue("jiroo_pat_secret-value");
    expect(mocks.refresh).toHaveBeenCalledOnce();

    await interaction.click(within(reveal).getByRole("button", { name: "J’ai conservé le jeton" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.queryByText("jiroo_pat_secret-value")).not.toBeInTheDocument();
  });

  it("keeps the dialog open and shows the server's message when creation fails", async () => {
    const interaction = userEvent.setup();
    mocks.createApiTokenAction.mockResolvedValue({ ok: false, error: "Donnez un nom à ce jeton." });
    render(<ApiTokensPanel tokens={[]} now="2026-11-12T22:00:00.000Z" />);

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
    render(<ApiTokensPanel tokens={tokens} now="2026-11-12T22:00:00.000Z" />);

    await interaction.click(screen.getByRole("button", { name: "Révoquer le jeton « Herdr »" }));
    const dialog = await screen.findByRole("dialog", { name: "Révoquer ce jeton ?" });
    expect(within(dialog).getByText(/« Herdr » ne permettra plus/)).toBeVisible();
    expect(mocks.revokeApiTokenAction).not.toHaveBeenCalled();
    await interaction.click(within(dialog).getByRole("button", { name: "Révoquer" }));

    await waitFor(() => expect(mocks.revokeApiTokenAction).toHaveBeenCalledWith({ id: "token-1" }));
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledOnce());
    expect(mocks.toastSuccess).toHaveBeenCalledWith("Jeton « Herdr » révoqué.");
  });

  it("reports a revocation the server refused", async () => {
    const interaction = userEvent.setup();
    mocks.revokeApiTokenAction.mockResolvedValue({ ok: false, error: "Ce jeton n’est plus disponible." });
    render(<ApiTokensPanel tokens={tokens} now="2026-11-12T22:00:00.000Z" />);

    await interaction.click(screen.getByRole("button", { name: "Révoquer le jeton « Agents »" }));
    const dialog = await screen.findByRole("dialog", { name: "Révoquer ce jeton ?" });
    await interaction.click(within(dialog).getByRole("button", { name: "Révoquer" }));

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith("Ce jeton n’est plus disponible."));
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
});
