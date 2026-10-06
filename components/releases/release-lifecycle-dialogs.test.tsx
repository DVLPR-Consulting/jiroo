import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ReleaseLifecycleDialogs } from "@/components/releases/release-lifecycle-dialogs";

const mocks = vi.hoisted(() => ({
  archiveReleaseAction: vi.fn(),
  publishReleaseAction: vi.fn(),
  refresh: vi.fn(),
  unarchiveReleaseAction: vi.fn(),
  unreleaseReleaseAction: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("@/app/actions/releases", () => ({
  archiveReleaseAction: mocks.archiveReleaseAction,
  publishReleaseAction: mocks.publishReleaseAction,
  unarchiveReleaseAction: mocks.unarchiveReleaseAction,
  unreleaseReleaseAction: mocks.unreleaseReleaseAction,
}));

const backlog = { id: "11111111-1111-4111-8111-111111111111", key: "CASS" };
const release = {
  id: "22222222-2222-4222-8222-222222222222",
  name: "Version 1",
  revision: 4,
  publicationScopeRevision: "0123456789abcdef0123456789abcdef",
  released: false,
  archived: false,
  progress: { todo: 2, inProgress: 1 },
};
const destinations = [
  { id: "33333333-3333-4333-8333-333333333333", name: "Version 2" },
];

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("release lifecycle dialogs", () => {
  beforeEach(() => vi.clearAllMocks());

  it("starts publish with no date or disposition selected", async () => {
    const user = userEvent.setup();
    render(
      <ReleaseLifecycleDialogs
        backlog={backlog}
        release={release}
        destinations={destinations}
        canAssignItems
      />,
    );
    await user.click(screen.getByRole("button", { name: "Publier Version 1" }));

    expect(screen.getByLabelText("Date de publication")).toHaveValue("");
    expect(screen.getByRole("radio", { name: /conserver/i })).not.toBeChecked();
    expect(screen.getByRole("radio", { name: /déplacer/i })).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Publier" })).toBeDisabled();
    expect(screen.getByText(/3 éléments non terminés/i)).toBeVisible();
    expect(screen.getByText(/terminé signifie que le statut appartient à la catégorie/i)).toBeVisible();
  });

  it("uses an automatic keep disposition when there is no incomplete work", async () => {
    const user = userEvent.setup();
    mocks.publishReleaseAction.mockResolvedValueOnce({ ok: true, result: {} });
    render(
      <ReleaseLifecycleDialogs
        backlog={backlog}
        release={{ ...release, progress: { todo: 0, inProgress: 0 } }}
        destinations={destinations}
        canAssignItems
      />,
    );
    await user.click(screen.getByRole("button", { name: "Publier Version 1" }));

    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
    expect(screen.getByText(/aucun élément non terminé/i)).toBeVisible();
    await user.type(screen.getByLabelText("Date de publication"), "2026-10-01");
    await user.click(screen.getByRole("button", { name: "Publier" }));

    await waitFor(() => expect(mocks.publishReleaseAction).toHaveBeenCalledWith(
      expect.objectContaining({ incompleteDisposition: "keep" }),
    ));
  });

  it("keeps the keep disposition but hides move without assignItems", async () => {
    const user = userEvent.setup();
    mocks.publishReleaseAction.mockResolvedValueOnce({ ok: true, result: {} });
    render(
      <ReleaseLifecycleDialogs
        backlog={backlog}
        release={release}
        destinations={destinations}
        canAssignItems={false}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Publier Version 1" }));

    expect(screen.getByRole("radio", { name: /conserver/i })).toBeVisible();
    expect(screen.queryByRole("radio", { name: /déplacer/i })).not.toBeInTheDocument();
    await user.type(screen.getByLabelText("Date de publication"), "2026-10-01");
    await user.click(screen.getByRole("radio", { name: /conserver/i }));
    await user.click(screen.getByRole("button", { name: "Publier" }));

    await waitFor(() => expect(mocks.publishReleaseAction).toHaveBeenCalledWith({
      backlogId: backlog.id,
      backlogKey: backlog.key,
      releaseId: release.id,
      expectedRevision: release.revision,
      expectedScopeRevision: release.publicationScopeRevision,
      effectiveDate: "2026-10-01",
      incompleteDisposition: "keep",
    }));
  });

  it("requires a destination for move and preserves every input after rejection", async () => {
    const user = userEvent.setup();
    mocks.publishReleaseAction.mockResolvedValueOnce({
      ok: false,
      error: "Cette release a changé. Rechargez-la avant de réessayer.",
    });
    render(
      <ReleaseLifecycleDialogs
        backlog={backlog}
        release={release}
        destinations={destinations}
        canAssignItems
      />,
    );
    await user.click(screen.getByRole("button", { name: "Publier Version 1" }));
    await user.type(screen.getByLabelText("Date de publication"), "2026-10-01");
    await user.click(screen.getByRole("radio", { name: /déplacer/i }));
    const destination = screen.getByRole("combobox", { name: /version de destination/i });
    expect(destination).toBeVisible();
    expect(screen.getByRole("button", { name: "Publier" })).toBeDisabled();
    await user.selectOptions(destination, destinations[0]!.id);
    await user.click(screen.getByRole("button", { name: "Publier" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Cette release a changé");
    expect(screen.getByLabelText("Date de publication")).toHaveValue("2026-10-01");
    expect(screen.getByRole("radio", { name: /déplacer/i })).toBeChecked();
    expect(destination).toHaveValue(destinations[0]!.id);
    expect(screen.getByRole("dialog", { name: "Publier Version 1" })).toBeVisible();
  });

  it("opens publish with the current scope after its props refresh while closed", async () => {
    const user = userEvent.setup();
    mocks.publishReleaseAction.mockResolvedValueOnce({ ok: true, result: {} });
    const props = { backlog, destinations, canAssignItems: true };
    const { rerender } = render(
      <ReleaseLifecycleDialogs {...props} release={{ ...release, progress: { todo: 0, inProgress: 0 } }} />,
    );
    await user.click(screen.getByRole("button", { name: "Publier Version 1" }));
    expect(screen.getByText(/aucun élément non terminé/i)).toBeVisible();
    await user.keyboard("{Escape}");

    const refreshedScope = "fedcba9876543210fedcba9876543210";
    rerender(
      <ReleaseLifecycleDialogs
        {...props}
        release={{ ...release, publicationScopeRevision: refreshedScope, progress: { todo: 2, inProgress: 0 } }}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Publier Version 1" }));

    expect(screen.queryByText(/aucun élément non terminé/i)).not.toBeInTheDocument();
    expect(screen.getByText(/2 éléments non terminés/i)).toBeVisible();
    expect(screen.getByRole("radio", { name: /conserver/i })).not.toBeChecked();
    await user.type(screen.getByLabelText("Date de publication"), "2026-10-01");
    expect(screen.getByRole("button", { name: "Publier" })).toBeDisabled();
    await user.click(screen.getByRole("radio", { name: /conserver/i }));
    await user.click(screen.getByRole("button", { name: "Publier" }));

    await waitFor(() => expect(mocks.publishReleaseAction).toHaveBeenCalledWith(
      expect.objectContaining({ expectedScopeRevision: refreshedScope, incompleteDisposition: "keep" }),
    ));
  });

  it("keeps publish choices made while open when the release props refresh", async () => {
    const user = userEvent.setup();
    mocks.publishReleaseAction.mockResolvedValueOnce({ ok: true, result: {} });
    const props = { backlog, destinations, canAssignItems: true };
    const { rerender } = render(<ReleaseLifecycleDialogs {...props} release={release} />);
    await user.click(screen.getByRole("button", { name: "Publier Version 1" }));
    await user.type(screen.getByLabelText("Date de publication"), "2026-10-01");
    await user.click(screen.getByRole("radio", { name: /déplacer/i }));

    rerender(
      <ReleaseLifecycleDialogs
        {...props}
        release={{
          ...release,
          publicationScopeRevision: "fedcba9876543210fedcba9876543210",
          progress: { todo: 5, inProgress: 0 },
        }}
      />,
    );

    expect(screen.getByLabelText("Date de publication")).toHaveValue("2026-10-01");
    expect(screen.getByRole("radio", { name: /déplacer/i })).toBeChecked();
    expect(screen.getByText(/3 éléments non terminés/i)).toBeVisible();
    await user.selectOptions(screen.getByLabelText("Version de destination"), "Version 2");
    await user.click(screen.getByRole("button", { name: "Publier" }));

    await waitFor(() => expect(mocks.publishReleaseAction).toHaveBeenCalledWith(
      expect.objectContaining({ expectedScopeRevision: release.publicationScopeRevision }),
    ));
  });

  it("cannot close publish while the request is pending", async () => {
    const user = userEvent.setup();
    const request = deferred<{ ok: false; error: string }>();
    mocks.publishReleaseAction.mockReturnValueOnce(request.promise);
    render(
      <ReleaseLifecycleDialogs
        backlog={backlog}
        release={release}
        destinations={destinations}
        canAssignItems
      />,
    );
    await user.click(screen.getByRole("button", { name: "Publier Version 1" }));
    await user.type(screen.getByLabelText("Date de publication"), "2026-10-01");
    await user.click(screen.getByRole("radio", { name: /conserver/i }));
    await user.click(screen.getByRole("button", { name: "Publier" }));

    await user.keyboard("{Escape}");
    expect(screen.getByRole("dialog")).toBeVisible();

    request.resolve({ ok: false, error: "Publication refusée." });
    expect(await screen.findByRole("alert")).toHaveTextContent("Publication refusée.");
    await waitFor(() => expect(screen.getByRole("button", { name: "Publier" })).toBeEnabled());
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Publier Version 1" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("cannot close a revision action while the request is pending", async () => {
    const user = userEvent.setup();
    const request = deferred<{ ok: false; error: string }>();
    mocks.archiveReleaseAction.mockReturnValueOnce(request.promise);
    render(
      <ReleaseLifecycleDialogs
        backlog={backlog}
        release={release}
        destinations={destinations}
        canAssignItems
      />,
    );
    await user.click(screen.getByRole("button", { name: "Archiver Version 1" }));
    await user.click(screen.getByRole("button", { name: "Confirmer l’archivage" }));

    await user.keyboard("{Escape}");
    expect(screen.getByRole("dialog")).toBeVisible();

    request.resolve({ ok: false, error: "Archivage refusé." });
    expect(await screen.findByRole("alert")).toHaveTextContent("Archivage refusé.");
    await waitFor(() => expect(screen.getByRole("button", { name: "Confirmer l’archivage" })).toBeEnabled());
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Archiver Version 1" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("surfaces a stale scope, refreshes it, and requires an explicit new decision", async () => {
    const user = userEvent.setup();
    mocks.publishReleaseAction.mockResolvedValueOnce({
      ok: false,
      reason: "stale_scope",
      error: "Le périmètre de publication a changé. Vérifiez-le avant de réessayer.",
      currentScopeRevision: "fedcba9876543210fedcba9876543210",
      currentIncompleteCount: 4,
    });
    render(
      <ReleaseLifecycleDialogs
        backlog={backlog}
        release={release}
        destinations={destinations}
        canAssignItems
      />,
    );
    await user.click(screen.getByRole("button", { name: "Publier Version 1" }));
    await user.type(screen.getByLabelText("Date de publication"), "2026-10-01");
    await user.click(screen.getByRole("radio", { name: /conserver/i }));
    await user.click(screen.getByRole("button", { name: "Publier" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("périmètre de publication a changé");
    expect(screen.getByLabelText("Date de publication")).toHaveValue("2026-10-01");
    expect(screen.getByRole("button", { name: "Publier" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Examiner le périmètre actualisé" }));
    expect(mocks.refresh).toHaveBeenCalledOnce();
    expect(screen.getByText(/4 éléments non terminés/i)).toBeVisible();
    expect(screen.getByRole("radio", { name: /conserver/i })).not.toBeChecked();
    expect(screen.getByLabelText("Date de publication")).toHaveValue("2026-10-01");
  });

  it.each([
    {
      name: "dépublication",
      releasePatch: { released: true, archived: false },
      trigger: "Annuler la publication Version 1",
      confirm: "Confirmer l’annulation",
      action: () => mocks.unreleaseReleaseAction,
    },
    {
      name: "archivage",
      releasePatch: { released: false, archived: false },
      trigger: "Archiver Version 1",
      confirm: "Confirmer l’archivage",
      action: () => mocks.archiveReleaseAction,
    },
    {
      name: "désarchivage",
      releasePatch: { released: false, archived: true },
      trigger: "Désarchiver Version 1",
      confirm: "Confirmer le désarchivage",
      action: () => mocks.unarchiveReleaseAction,
    },
  ])("submits expected revision for $name", async ({ releasePatch, trigger, confirm, action }) => {
    const user = userEvent.setup();
    action().mockResolvedValueOnce({ ok: true, result: {} });
    render(
      <ReleaseLifecycleDialogs
        backlog={backlog}
        release={{ ...release, ...releasePatch }}
        destinations={destinations}
        canAssignItems
      />,
    );
    await user.click(screen.getByRole("button", { name: trigger }));
    await user.click(screen.getByRole("button", { name: confirm }));

    await waitFor(() => expect(action()).toHaveBeenCalledWith({
      backlogId: backlog.id,
      backlogKey: backlog.key,
      releaseId: release.id,
      expectedRevision: release.revision,
    }));
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it("reports a rejected publish request and stays closable", async () => {
    const user = userEvent.setup();
    // Drop any unconsumed one-shot result left by an earlier test.
    mocks.publishReleaseAction.mockReset().mockRejectedValueOnce(new Error("network"));
    render(
      <ReleaseLifecycleDialogs
        backlog={backlog}
        release={release}
        destinations={destinations}
        canAssignItems
      />,
    );
    await user.click(screen.getByRole("button", { name: "Publier Version 1" }));
    await user.type(screen.getByLabelText("Date de publication"), "2026-10-01");
    await user.click(screen.getByRole("radio", { name: /conserver/i }));
    await user.click(screen.getByRole("button", { name: "Publier" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Publication impossible.");
    await waitFor(() => expect(screen.getByRole("button", { name: "Publier" })).toBeEnabled());
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("reports a rejected revision action and stays closable", async () => {
    const user = userEvent.setup();
    // Drop any unconsumed one-shot result left by an earlier test.
    mocks.archiveReleaseAction.mockReset().mockRejectedValueOnce(new Error("network"));
    render(
      <ReleaseLifecycleDialogs
        backlog={backlog}
        release={release}
        destinations={destinations}
        canAssignItems
      />,
    );
    await user.click(screen.getByRole("button", { name: "Archiver Version 1" }));
    await user.click(screen.getByRole("button", { name: "Confirmer l’archivage" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Archivage impossible.");
    await waitFor(() => expect(screen.getByRole("button", { name: "Confirmer l’archivage" })).toBeEnabled());
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
});
