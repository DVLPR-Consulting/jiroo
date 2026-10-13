import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  regenerate: vi.fn(),
  setEnabled: vi.fn(),
  remove: vi.fn(),
}));

vi.mock("@/app/actions/repo-connections", () => ({
  createRepoConnectionAction: mocks.create,
  regenerateRepoConnectionSecretAction: mocks.regenerate,
  setRepoConnectionEnabledAction: mocks.setEnabled,
  deleteRepoConnectionAction: mocks.remove,
}));
vi.mock("@/lib/toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { RepoConnectionsAdmin, type RepoConnectionView } from "@/components/admin/repo-connections-admin";

const BACKLOG_ID = "6f9619ff-8b86-4011-b42d-00c04fc964ff";

function connection(overrides: Partial<RepoConnectionView>): RepoConnectionView {
  return {
    id: "0b6c2a5e-3f1d-4c8e-9a7b-1d2e3f4a5b6c",
    provider: "github",
    instanceUrl: "https://github.com",
    repositoryPath: "acme/api",
    enabled: true,
    lastEventAt: null,
    lastError: null,
    lastErrorAt: null,
    ...overrides,
  };
}

describe("RepoConnectionsAdmin", () => {
  beforeEach(() => vi.clearAllMocks());

  it("explains the empty state", () => {
    render(<RepoConnectionsAdmin backlogId={BACKLOG_ID} backlogKey="CASS" connections={[]} />);
    expect(screen.getByText(/Aucun dépôt connecté/)).toHaveTextContent("CASS-12");
  });

  it("connects a self-hosted GitLab project and shows its secret once", async () => {
    const user = userEvent.setup();
    const created = connection({
      id: "11111111-2222-4333-8444-555555555555",
      provider: "gitlab",
      instanceUrl: "https://gitlab.example.invalid",
      repositoryPath: "group/api",
    });
    mocks.create.mockResolvedValue({ ok: true, connection: created, secret: "the-one-time-secret" });
    render(<RepoConnectionsAdmin backlogId={BACKLOG_ID} backlogKey="CASS" connections={[]} />);

    await user.click(screen.getByRole("button", { name: "Connecter un dépôt" }));
    const form = screen.getByRole("form", { name: "Connecter un dépôt" });
    expect(within(form).queryByLabelText("URL de l’instance GitLab")).not.toBeInTheDocument();
    await user.click(within(form).getByRole("radio", { name: /GitLab/ }));
    await user.type(within(form).getByLabelText("Chemin du projet"), "group/api");
    await user.type(within(form).getByLabelText("URL de l’instance GitLab"), "https://gitlab.example.invalid");
    await user.click(within(form).getByRole("button", { name: "Connecter le dépôt" }));

    expect(mocks.create).toHaveBeenCalledWith({
      backlogId: BACKLOG_ID,
      provider: "gitlab",
      repositoryPath: "group/api",
      instanceUrl: "https://gitlab.example.invalid",
    });
    const dialog = await screen.findByRole("dialog", { name: "Configurer le webhook" });
    expect(within(dialog).getByRole("textbox", { name: "Secret du webhook" })).toHaveValue("the-one-time-secret");
    expect(within(dialog).getByRole("textbox", { name: "URL du webhook" })).toHaveValue(
      `${window.location.origin}/api/webhooks/gitlab/11111111-2222-4333-8444-555555555555`,
    );
    expect(dialog).toHaveTextContent("Secret token");
    expect(dialog).toHaveTextContent("Merge request events");
    await user.click(within(dialog).getByRole("button", { name: "J’ai copié le secret" }));
    expect(screen.queryByRole("dialog", { name: "Configurer le webhook" })).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue("the-one-time-secret")).not.toBeInTheDocument();
  });

  it("keeps the dialog open with the validation message on failure", async () => {
    const user = userEvent.setup();
    mocks.create.mockResolvedValue({ ok: false, error: "Dépôt invalide : saisissez « propriétaire/dépôt »." });
    render(<RepoConnectionsAdmin backlogId={BACKLOG_ID} backlogKey="CASS" connections={[]} />);
    await user.click(screen.getByRole("button", { name: "Connecter un dépôt" }));
    await user.type(screen.getByLabelText("Dépôt"), "nope");
    await user.click(screen.getByRole("button", { name: "Connecter le dépôt" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Dépôt invalide");
    expect(screen.getByRole("form", { name: "Connecter un dépôt" })).toBeInTheDocument();
  });

  it("shows each connection's status, last event and last error", () => {
    render(
      <RepoConnectionsAdmin
        backlogId={BACKLOG_ID}
        backlogKey="CASS"
        connections={[
          connection({ id: "a", repositoryPath: "acme/waiting" }),
          connection({ id: "b", repositoryPath: "acme/active", lastEventAt: "2026-10-13T08:00:00.000Z" }),
          connection({
            id: "c",
            repositoryPath: "acme/failing",
            lastEventAt: "2026-10-13T08:00:00.000Z",
            lastError: "Signature invalide.",
            lastErrorAt: "2026-10-13T09:00:00.000Z",
          }),
          connection({ id: "d", repositoryPath: "acme/off", enabled: false }),
        ]}
      />,
    );
    const row = (name: string) => screen.getByRole("listitem", { name: `GitHub ${name}` });
    expect(row("acme/waiting")).toHaveTextContent("En attente d’un premier événement");
    expect(row("acme/waiting")).toHaveTextContent("Aucun événement reçu");
    expect(row("acme/active")).toHaveTextContent("Active");
    expect(row("acme/active")).toHaveTextContent("Dernier événement :");
    expect(row("acme/failing")).toHaveTextContent("Erreur");
    expect(row("acme/failing")).toHaveTextContent("Signature invalide.");
    expect(within(row("acme/off")).getByRole("button", { name: "Activer" })).toBeInTheDocument();
    expect(row("acme/off")).toHaveTextContent("Désactivée");
    expect(row("acme/active")).toHaveTextContent("/api/webhooks/github/b");
  });

  it("regenerates the secret after confirmation and reveals the new one", async () => {
    const user = userEvent.setup();
    const current = connection({});
    mocks.regenerate.mockResolvedValue({ ok: true, connection: current, secret: "new-secret" });
    render(<RepoConnectionsAdmin backlogId={BACKLOG_ID} backlogKey="CASS" connections={[current]} />);
    await user.click(screen.getByRole("button", { name: "Régénérer le secret" }));
    const confirm = screen.getByRole("dialog", { name: "Régénérer le secret ?" });
    expect(confirm).toHaveTextContent("sera refusé dès maintenant");
    await user.click(within(confirm).getByRole("button", { name: "Régénérer" }));
    expect(mocks.regenerate).toHaveBeenCalledWith({ backlogKey: "CASS", connectionId: current.id });
    const revealed = await screen.findByRole("dialog", { name: "Nouveau secret du webhook" });
    expect(within(revealed).getByRole("textbox", { name: "Secret du webhook" })).toHaveValue("new-secret");
    expect(revealed).toHaveTextContent("L’ancien secret est déjà refusé.");
  });

  it("disables and deletes a connection", async () => {
    const user = userEvent.setup();
    const current = connection({});
    mocks.setEnabled.mockResolvedValue({ ok: true, connection: { ...current, enabled: false } });
    mocks.remove.mockResolvedValue({ ok: true });
    render(<RepoConnectionsAdmin backlogId={BACKLOG_ID} backlogKey="CASS" connections={[current]} />);
    await user.click(screen.getByRole("button", { name: "Désactiver" }));
    expect(mocks.setEnabled).toHaveBeenCalledWith({ backlogKey: "CASS", connectionId: current.id, enabled: false });

    await user.click(screen.getByRole("button", { name: "Supprimer" }));
    const confirm = screen.getByRole("dialog", { name: "Supprimer la connexion ?" });
    expect(confirm).toHaveTextContent("Les références déjà créées restent sur les tickets.");
    await user.click(within(confirm).getByRole("button", { name: "Supprimer" }));
    expect(mocks.remove).toHaveBeenCalledWith({ backlogKey: "CASS", connectionId: current.id });
  });
});
