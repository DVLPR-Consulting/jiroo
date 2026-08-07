import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  CreateReleaseDialog,
  EditReleaseDialog,
} from "@/components/releases/release-form-dialog";

const mocks = vi.hoisted(() => ({
  createReleaseAction: vi.fn(),
  refresh: vi.fn(),
  toastSuccess: vi.fn(),
  updateReleaseAction: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));
vi.mock("@/app/actions/releases", () => ({
  createReleaseAction: mocks.createReleaseAction,
  updateReleaseAction: mocks.updateReleaseAction,
}));
vi.mock("@/lib/toast", () => ({ toast: { success: mocks.toastSuccess } }));

const backlog = {
  id: "11111111-1111-4111-8111-111111111111",
  key: "CASS",
  name: "Cassini",
};
const actor = { id: "actor-1", name: "Ada" };
const driverOptions = [actor, { id: "driver-2", name: "Lin" }];
const release = {
  id: "22222222-2222-4222-8222-222222222222",
  name: "Version 1",
  description: "Description initiale",
  driver: actor,
  startDate: "2026-09-01",
  targetDate: "2026-09-30",
  effectiveReleaseDate: null,
  released: false,
  archived: false,
  overdue: false,
  revision: 3,
  publicationScopeRevision: "0123456789abcdef0123456789abcdef",
  progress: {
    total: 0,
    todo: 0,
    inProgress: 0,
    done: 0,
    totalPoints: 0,
    donePoints: 0,
    unestimated: 0,
  },
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("release form dialogs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requires a name before creation can be submitted", async () => {
    const user = userEvent.setup();
    render(
      <CreateReleaseDialog
        backlog={backlog}
        actor={actor}
        driverOptions={driverOptions}
        canBrowseUsers
      />,
    );

    await user.click(screen.getByRole("button", { name: "Créer une version" }));

    expect(screen.getByRole("textbox", { name: "Nom" })).toBeRequired();
    expect(screen.getByRole("button", { name: "Créer" })).toBeDisabled();
  });

  it("uses the actor as the required default driver for creation", async () => {
    const user = userEvent.setup();
    mocks.createReleaseAction.mockResolvedValueOnce({ ok: true, result: { id: release.id } });
    render(
      <CreateReleaseDialog
        backlog={backlog}
        actor={actor}
        driverOptions={driverOptions}
        canBrowseUsers
      />,
    );
    await user.click(screen.getByRole("button", { name: "Créer une version" }));

    expect(screen.getByRole("combobox", { name: "Pilote" })).toHaveValue("actor-1");
    expect(screen.queryByRole("option", { name: "Aucun pilote" })).not.toBeInTheDocument();
    await user.type(screen.getByRole("textbox", { name: "Nom" }), "Version par défaut");
    await user.click(screen.getByRole("button", { name: "Créer" }));

    await waitFor(() => expect(mocks.createReleaseAction).toHaveBeenCalledWith({
      backlogId: backlog.id,
      backlogKey: backlog.key,
      name: "Version par défaut",
      description: null,
      startDate: null,
      targetDate: null,
      driverId: "actor-1",
    }));
  });

  it("submits the explicitly selected creation driver", async () => {
    const user = userEvent.setup();
    mocks.createReleaseAction.mockResolvedValueOnce({ ok: true, result: { id: release.id } });
    render(
      <CreateReleaseDialog
        backlog={backlog}
        actor={actor}
        driverOptions={driverOptions}
        canBrowseUsers
      />,
    );
    await user.click(screen.getByRole("button", { name: "Créer une version" }));
    await user.type(screen.getByRole("textbox", { name: "Nom" }), "Version pilotée");
    await user.selectOptions(screen.getByRole("combobox", { name: "Pilote" }), "driver-2");
    await user.click(screen.getByRole("button", { name: "Créer" }));

    await waitFor(() => expect(mocks.createReleaseAction).toHaveBeenCalledWith({
      backlogId: backlog.id,
      backlogKey: backlog.key,
      name: "Version pilotée",
      description: null,
      startDate: null,
      targetDate: null,
      driverId: "driver-2",
    }));
  });

  it("rejects reversed dates locally and focuses the target date", async () => {
    const user = userEvent.setup();
    render(
      <CreateReleaseDialog
        backlog={backlog}
        actor={actor}
        driverOptions={driverOptions}
        canBrowseUsers
      />,
    );
    await user.click(screen.getByRole("button", { name: "Créer une version" }));
    await user.type(screen.getByRole("textbox", { name: "Nom" }), "Version 2");
    await user.type(screen.getByLabelText("Date de début"), "2026-09-20");
    await user.type(screen.getByLabelText("Date cible"), "2026-09-10");
    await user.click(screen.getByRole("button", { name: "Créer" }));

    expect(screen.getByRole("alert")).toHaveTextContent(
      "La date cible doit suivre la date de début.",
    );
    expect(screen.getByLabelText("Date cible")).toHaveFocus();
    expect(mocks.createReleaseAction).not.toHaveBeenCalled();
  });

  it("marks creation pending and preserves input after a rejected request", async () => {
    const user = userEvent.setup();
    const request = deferred<{ ok: false; error: string }>();
    mocks.createReleaseAction.mockReturnValueOnce(request.promise);
    render(
      <CreateReleaseDialog
        backlog={backlog}
        actor={actor}
        driverOptions={driverOptions}
        canBrowseUsers
      />,
    );
    await user.click(screen.getByRole("button", { name: "Créer une version" }));
    const name = screen.getByRole("textbox", { name: "Nom" });
    const description = screen.getByRole("textbox", { name: "Description" });
    await user.type(name, "Version conservée");
    await user.type(description, "Texte conservé");
    await user.selectOptions(screen.getByRole("combobox", { name: "Pilote" }), "driver-2");
    await user.click(screen.getByRole("button", { name: "Créer" }));

    expect(screen.getByRole("button", { name: "Création…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Création…" })).toHaveAttribute(
      "aria-busy",
      "true",
    );
    request.resolve({ ok: false, error: "Une release portant ce nom existe déjà." });

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Une release portant ce nom existe déjà.",
    );
    expect(name).toHaveValue("Version conservée");
    expect(description).toHaveValue("Texte conservé");
    expect(screen.getByRole("combobox", { name: "Pilote" })).toHaveValue("driver-2");
    expect(screen.getByRole("dialog", { name: "Créer une version" })).toBeVisible();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("links a server name error to its field and focuses it", async () => {
    const user = userEvent.setup();
    mocks.createReleaseAction.mockResolvedValueOnce({
      ok: false,
      error: "Une release portant ce nom existe déjà.",
      fieldErrors: { name: ["Une release portant ce nom existe déjà."] },
    });
    render(
      <CreateReleaseDialog
        backlog={backlog}
        actor={actor}
        driverOptions={driverOptions}
        canBrowseUsers
      />,
    );
    await user.click(screen.getByRole("button", { name: "Créer une version" }));
    const name = screen.getByRole("textbox", { name: "Nom" });
    await user.type(name, "Version doublon");
    await user.click(screen.getByRole("button", { name: "Créer" }));

    await waitFor(() => expect(name).toHaveFocus());
    expect(name).toHaveAttribute("aria-invalid", "true");
    expect(name).toHaveAccessibleDescription("Une release portant ce nom existe déjà.");
  });

  it("shows the actor as fixed driver without exposing a directory picker", async () => {
    const user = userEvent.setup();
    mocks.createReleaseAction.mockResolvedValueOnce({ ok: true, result: { id: release.id } });
    render(
      <CreateReleaseDialog
        backlog={backlog}
        actor={actor}
        driverOptions={[]}
        canBrowseUsers={false}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Créer une version" }));

    expect(screen.getByText("Ada", { selector: "output" })).toBeVisible();
    expect(screen.queryByRole("combobox", { name: "Pilote" })).not.toBeInTheDocument();
  });

  it("clears successful creation fields before the dialog is reopened", async () => {
    const user = userEvent.setup();
    mocks.createReleaseAction.mockResolvedValueOnce({ ok: true, result: { id: release.id } });
    render(
      <CreateReleaseDialog
        backlog={backlog}
        actor={actor}
        driverOptions={driverOptions}
        canBrowseUsers
      />,
    );
    const trigger = screen.getByRole("button", { name: "Créer une version" });
    await user.click(trigger);
    await user.type(screen.getByRole("textbox", { name: "Nom" }), "Version créée");
    await user.click(screen.getByRole("button", { name: "Créer" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(mocks.toastSuccess).toHaveBeenCalledWith("Release créée.");

    await user.click(trigger);
    expect(screen.getByRole("textbox", { name: "Nom" })).toHaveValue("");
  });

  it("offers stale recovery, then closes and returns focus to its trigger", async () => {
    const user = userEvent.setup();
    mocks.updateReleaseAction.mockResolvedValueOnce({
      ok: false,
      error: "Cette release a changé. Rechargez-la avant de réessayer.",
    });
    const { rerender } = render(
      <EditReleaseDialog
        backlog={backlog}
        release={release}
        actor={actor}
        driverOptions={driverOptions}
        canBrowseUsers
      />,
    );
    const trigger = screen.getByRole("button", { name: "Modifier Version 1" });
    await user.click(trigger);
    const name = screen.getByRole("textbox", { name: "Nom" });
    await user.clear(name);
    await user.type(name, "Révision locale");
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Cette release a changé");
    expect(name).toHaveValue("Révision locale");
    await user.click(screen.getByRole("button", { name: "Recharger la version" }));

    expect(mocks.refresh).toHaveBeenCalledOnce();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();

    const refreshedRelease = { ...release, name: "Version serveur", revision: 4 };
    rerender(
      <EditReleaseDialog
        backlog={backlog}
        release={refreshedRelease}
        actor={actor}
        driverOptions={driverOptions}
        canBrowseUsers
      />,
    );
    await user.click(screen.getByRole("button", { name: "Modifier Version serveur" }));
    expect(screen.getByRole("textbox", { name: "Nom" })).toHaveValue("Version serveur");
  });

  it("keeps the nullable driver option for editing and submits null", async () => {
    const user = userEvent.setup();
    mocks.updateReleaseAction.mockResolvedValueOnce({ ok: true, result: { id: release.id } });
    render(
      <EditReleaseDialog
        backlog={backlog}
        release={release}
        actor={actor}
        driverOptions={driverOptions}
        canBrowseUsers
      />,
    );
    await user.click(screen.getByRole("button", { name: "Modifier Version 1" }));
    const picker = screen.getByRole("combobox", { name: "Pilote" });
    expect(screen.getByRole("option", { name: "Aucun pilote" })).toBeInTheDocument();
    await user.selectOptions(picker, "");
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));

    await waitFor(() => expect(mocks.updateReleaseAction).toHaveBeenCalledWith({
      backlogId: backlog.id,
      backlogKey: backlog.key,
      releaseId: release.id,
      expectedRevision: 3,
      name: "Version 1",
      description: "Description initiale",
      startDate: "2026-09-01",
      targetDate: "2026-09-30",
      driverId: null,
    }));
  });
});
