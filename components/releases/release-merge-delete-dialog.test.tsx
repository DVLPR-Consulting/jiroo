import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ReleaseMergeDeleteDialog } from "@/components/releases/release-merge-delete-dialog";

const mocks = vi.hoisted(() => ({
  deleteReleaseAction: vi.fn(),
  mergeReleaseAction: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }),
}));
vi.mock("@/app/actions/releases", () => ({
  deleteReleaseAction: mocks.deleteReleaseAction,
  mergeReleaseAction: mocks.mergeReleaseAction,
}));
vi.mock("@/lib/toast", () => ({ toast: { success: mocks.toastSuccess } }));

const backlog = { id: "11111111-1111-4111-8111-111111111111", key: "CASS" };
const release = {
  id: "22222222-2222-4222-8222-222222222222",
  name: "Version 1",
  revision: 4,
  publicationScopeRevision: "0123456789abcdef0123456789abcdef",
  publicationCount: 2,
  removalScope: { revision: "0123456789abcdef0123456789abcdef", linkedCount: 3, trashedCount: 0 },
};
const targets = [
  { id: "33333333-3333-4333-8333-333333333333", name: "Version 2", revision: 7, released: false },
  { id: "44444444-4444-4444-8444-444444444444", name: "Version 0", revision: 2, released: true },
];

async function openDialog(mode: "merge" | "delete", overrides: Partial<typeof release> = {}, extra = {}) {
  const user = userEvent.setup();
  render(
    <ReleaseMergeDeleteDialog
      mode={mode}
      backlog={backlog}
      release={{ ...release, ...overrides }}
      targets={targets}
      {...extra}
    />,
  );
  await user.click(
    screen.getByRole("button", {
      name: mode === "merge" ? "Fusionner Version 1" : "Supprimer Version 1",
    }),
  );
  return user;
}

describe("ReleaseMergeDeleteDialog — delete", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows the impact and requires an explicit disposition", async () => {
    const user = await openDialog("delete");
    expect(screen.getByText("3 éléments liés")).toBeVisible();
    expect(screen.getByText(/2 publications conservées dans l’historique/)).toBeVisible();
    const confirm = screen.getByRole("button", { name: "Supprimer" });
    expect(confirm).toBeDisabled();
    expect(screen.getByRole("radio", { name: /transférer vers une autre version/i })).not.toBeChecked();
    expect(screen.getByRole("radio", { name: /retirer la version des éléments/i })).not.toBeChecked();
    expect(screen.queryByRole("combobox", { name: /version de destination/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: /transférer vers une autre version/i }));
    expect(screen.getByRole("combobox", { name: /version de destination/i })).toBeVisible();
    expect(confirm).toBeDisabled();
    await user.selectOptions(screen.getByRole("combobox", { name: /version de destination/i }), "Version 2");
    expect(confirm).toBeEnabled();
  });

  it("sends a transfer with the target revision and returns to the list from the detail page", async () => {
    mocks.deleteReleaseAction.mockResolvedValueOnce({ ok: true, result: {} });
    const user = await openDialog("delete", {}, { afterSuccessHref: "/b/CASS/releases" });
    await user.click(screen.getByRole("radio", { name: /transférer vers une autre version/i }));
    await user.selectOptions(screen.getByRole("combobox", { name: /version de destination/i }), "Version 2");
    await user.click(screen.getByRole("button", { name: "Supprimer" }));

    await waitFor(() =>
      expect(mocks.deleteReleaseAction).toHaveBeenCalledWith({
        backlogId: backlog.id,
        backlogKey: "CASS",
        releaseId: release.id,
        expectedRevision: 4,
        expectedScopeRevision: release.removalScope.revision,
        fixVersions: {
          disposition: "transfer",
          targetReleaseId: targets[0]!.id,
          expectedTargetRevision: 7,
        },
      }),
    );
    expect(mocks.toastSuccess).toHaveBeenCalledWith("Version supprimée.");
    expect(mocks.push).toHaveBeenCalledWith("/b/CASS/releases");
  });

  it("sends a removal and refreshes the list", async () => {
    mocks.deleteReleaseAction.mockResolvedValueOnce({ ok: true, result: {} });
    const user = await openDialog("delete");
    await user.click(screen.getByRole("radio", { name: /retirer la version des éléments/i }));
    await user.click(screen.getByRole("button", { name: "Supprimer" }));
    await waitFor(() =>
      expect(mocks.deleteReleaseAction).toHaveBeenCalledWith(
        expect.objectContaining({ fixVersions: { disposition: "remove" } }),
      ),
    );
    expect(mocks.refresh).toHaveBeenCalled();
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("deletes an empty version after a simple confirmation", async () => {
    mocks.deleteReleaseAction.mockResolvedValueOnce({ ok: true, result: {} });
    const user = await openDialog("delete", {
      removalScope: { revision: "d41d8cd98f00b204e9800998ecf8427e", linkedCount: 0, trashedCount: 0 },
      publicationCount: 0,
    });
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
    expect(screen.getByText("Aucun élément lié")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Supprimer" }));
    await waitFor(() =>
      expect(mocks.deleteReleaseAction).toHaveBeenCalledWith(
        expect.objectContaining({ fixVersions: { disposition: "none" } }),
      ),
    );
  });

  it("requires a transfer or removal choice for a version linked only to trashed items", async () => {
    mocks.deleteReleaseAction.mockResolvedValueOnce({ ok: true, result: {} });
    const user = await openDialog("delete", {
      removalScope: { revision: "fedcba9876543210fedcba9876543210", linkedCount: 1, trashedCount: 1 },
    });
    expect(screen.getByText("1 élément lié, dont 1 dans la corbeille")).toBeVisible();
    expect(screen.getByRole("button", { name: "Supprimer" })).toBeDisabled();
    await user.click(screen.getByRole("radio", { name: /retirer la version des éléments/i }));
    await user.click(screen.getByRole("button", { name: "Supprimer" }));
    await waitFor(() =>
      expect(mocks.deleteReleaseAction).toHaveBeenCalledWith(
        expect.objectContaining({
          expectedScopeRevision: "fedcba9876543210fedcba9876543210",
          fixVersions: { disposition: "remove" },
        }),
      ),
    );
  });

  it("keeps the dialog open with the new count when the linked items changed", async () => {
    mocks.deleteReleaseAction.mockResolvedValueOnce({
      ok: false,
      reason: "stale_scope",
      error: "Les éléments liés à cette version ont changé. Vérifiez l’impact avant de réessayer.",
      currentScopeRevision: "fedcba9876543210fedcba9876543210",
      currentLinkedCount: 5,
      currentTrashedCount: 2,
    });
    mocks.deleteReleaseAction.mockResolvedValueOnce({ ok: true, result: {} });
    const user = await openDialog("delete");
    await user.click(screen.getByRole("radio", { name: /retirer la version des éléments/i }));
    await user.click(screen.getByRole("button", { name: "Supprimer" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/ont changé/);
    expect(screen.getByRole("button", { name: "Supprimer" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Examiner l’impact actualisé" }));
    expect(screen.getByText("5 éléments liés, dont 2 dans la corbeille")).toBeVisible();
    expect(screen.getByRole("radio", { name: /retirer la version des éléments/i })).not.toBeChecked();
    await user.click(screen.getByRole("radio", { name: /retirer la version des éléments/i }));
    await user.click(screen.getByRole("button", { name: "Supprimer" }));
    await waitFor(() =>
      expect(mocks.deleteReleaseAction).toHaveBeenLastCalledWith(
        expect.objectContaining({ expectedScopeRevision: "fedcba9876543210fedcba9876543210" }),
      ),
    );
  });

  it("keeps the selection after a network failure", async () => {
    mocks.deleteReleaseAction.mockRejectedValueOnce(new Error("Failed to fetch"));
    const user = await openDialog("delete");
    await user.click(screen.getByRole("radio", { name: /transférer vers une autre version/i }));
    await user.selectOptions(screen.getByRole("combobox", { name: /version de destination/i }), "Version 2");
    await user.click(screen.getByRole("button", { name: "Supprimer" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Suppression impossible.");
    expect(screen.getByRole("radio", { name: /transférer vers une autre version/i })).toBeChecked();
    expect(screen.getByRole("combobox", { name: /version de destination/i })).toHaveValue(targets[0]!.id);
    expect(screen.getByRole("button", { name: "Supprimer" })).toBeEnabled();
  });
});

describe("ReleaseMergeDeleteDialog — merge", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requires a target and warns that a published target changes its current scope", async () => {
    mocks.mergeReleaseAction.mockResolvedValueOnce({ ok: true, result: {} });
    const user = await openDialog("merge");
    expect(screen.getByText(/3 éléments liés/)).toBeVisible();
    const confirm = screen.getByRole("button", { name: "Fusionner" });
    expect(confirm).toBeDisabled();
    await user.selectOptions(screen.getByRole("combobox", { name: /version de destination/i }), "Version 0");
    expect(screen.getByText(/périmètre actuel de Version 0 changera/)).toBeVisible();
    await user.click(confirm);
    await waitFor(() =>
      expect(mocks.mergeReleaseAction).toHaveBeenCalledWith({
        backlogId: backlog.id,
        backlogKey: "CASS",
        sourceReleaseId: release.id,
        expectedSourceRevision: 4,
        expectedScopeRevision: release.removalScope.revision,
        targetReleaseId: targets[1]!.id,
        expectedTargetRevision: 2,
      }),
    );
    expect(mocks.toastSuccess).toHaveBeenCalledWith("Version 1 fusionnée dans Version 0.");
  });

  it("shows a domain error and keeps the dialog open", async () => {
    mocks.mergeReleaseAction.mockResolvedValueOnce({
      ok: false,
      error: "La release de destination est archivée.",
    });
    const user = await openDialog("merge");
    await user.selectOptions(screen.getByRole("combobox", { name: /version de destination/i }), "Version 2");
    await user.click(screen.getByRole("button", { name: "Fusionner" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("La release de destination est archivée.");
    expect(screen.getByRole("dialog")).toBeVisible();
  });
});
