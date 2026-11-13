import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  revoke: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("@/app/actions/api-tokens", () => ({ revokeApiTokenAsAdministratorAction: mocks.revoke }));
vi.mock("@/lib/toast", () => ({ toast: { success: mocks.toastSuccess, error: mocks.toastError } }));

import { ApiTokensAdmin, type AdministeredApiToken } from "@/components/admin/api-tokens-admin";

const tokens: AdministeredApiToken[] = [
  {
    id: "token-1", name: "Herdr", tokenPrefix: "Ab3dEf9h", scope: "write",
    expiresAt: "2027-02-11T10:00:00.000Z", lastUsedAt: "2026-11-13T09:00:00.000Z", createdAt: "2026-11-13T08:00:00.000Z",
    owner: { name: "Ada", email: "ada@example.test" },
  },
  {
    id: "token-2", name: "Script", tokenPrefix: "Zz9yXx8w", scope: "read",
    expiresAt: "2026-01-01T00:00:00.000Z", lastUsedAt: null, createdAt: "2025-12-01T00:00:00.000Z",
    owner: { name: "Grace", email: "grace@example.test" },
  },
];
const now = "2026-11-13T12:00:00.000Z";

beforeEach(() => vi.clearAllMocks());

describe("ApiTokensAdmin", () => {
  it("lists every account's tokens with owner, scope, prefix and state, never a secret", () => {
    render(<ApiTokensAdmin tokens={tokens} now={now} />);
    const items = within(screen.getByRole("list", { name: "Jetons d’accès de tous les comptes" })).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(within(items[0]!).getByText("Ada · ada@example.test")).toBeVisible();
    expect(within(items[0]!).getByText("Lecture et écriture")).toBeVisible();
    expect(within(items[0]!).getByText("jiroo_pat_Ab3dEf9h…")).toBeVisible();
    expect(within(items[1]!).getByText("Expiré")).toBeVisible();
    expect(within(items[1]!).getByText(/Jamais utilisé/)).toBeVisible();
  });

  it("says when no token is live", () => {
    render(<ApiTokensAdmin tokens={[]} now={now} />);
    expect(screen.getByText("Aucun jeton à afficher.")).toBeVisible();
  });

  it("revokes another account's token after confirmation naming its owner", async () => {
    const interaction = userEvent.setup();
    mocks.revoke.mockResolvedValue({ ok: true });
    render(<ApiTokensAdmin tokens={tokens} now={now} />);

    await interaction.click(screen.getByRole("button", { name: "Révoquer le jeton « Herdr » du compte « Ada »" }));
    const dialog = await screen.findByRole("dialog", { name: "Révoquer ce jeton ?" });
    expect(within(dialog).getByText(/Le jeton « Herdr » du compte « Ada » ne pourra plus être utilisé pour accéder à Jiroo\. Cette révocation est définitive et sera enregistrée dans le journal de sécurité\./)).toBeVisible();
    expect(mocks.revoke).not.toHaveBeenCalled();
    await interaction.click(within(dialog).getByRole("button", { name: "Révoquer" }));

    await waitFor(() => expect(mocks.revoke).toHaveBeenCalledWith({ id: "token-1" }));
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledOnce());
    expect(mocks.toastSuccess).toHaveBeenCalledWith("Jeton « Herdr » du compte « Ada » révoqué.");
  });

  it("reports a refused revocation", async () => {
    const interaction = userEvent.setup();
    mocks.revoke.mockResolvedValue({ ok: false, error: "Cette action est réservée aux administrateurs Jiroo." });
    render(<ApiTokensAdmin tokens={tokens} now={now} />);
    await interaction.click(screen.getByRole("button", { name: "Révoquer le jeton « Script » du compte « Grace »" }));
    await interaction.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Révoquer" }));
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith("Cette action est réservée aux administrateurs Jiroo."));
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
});
