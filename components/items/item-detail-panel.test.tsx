import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { currentHref } from "@/test/history";
import { ItemDetailPanel } from "@/components/items/item-detail-panel";
import { resetAutosaveRegistry } from "@/lib/autosave/use-autosave";
import { ItemDetailSheet } from "@/components/items/item-detail-sheet";
import { ViewUrlStateProvider } from "@/components/shell/view-url-state";
import { KeyboardShortcutsProvider } from "@/components/shortcuts/keyboard-shortcuts-provider";
import type { ViewUrlEntry } from "@/lib/items/view-url-params";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
  replace: vi.fn(),
  restoreItemAction: vi.fn(),
  createItemAction: vi.fn(),
  softDeleteItemAction: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  updateItemAction: vi.fn(),
  moveSprintItemAction: vi.fn(),
  reparentItemAction: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/b/CASS",
  useRouter: () => ({
    push: mocks.push,
    refresh: mocks.refresh,
    replace: mocks.replace,
  }),
}));

vi.mock("@/app/actions/items", () => ({
  createItemAction: mocks.createItemAction,
  restoreItemAction: mocks.restoreItemAction,
  softDeleteItemAction: mocks.softDeleteItemAction,
  updateItemAction: mocks.updateItemAction,
  reparentItemAction: mocks.reparentItemAction,
}));

vi.mock("@/app/actions/sprints", () => ({
  moveSprintItemAction: mocks.moveSprintItemAction,
}));

vi.mock("@/app/actions/comments", () => ({
  addCommentAction: vi.fn(),
  deleteCommentAction: vi.fn(),
  editCommentAction: vi.fn(),
}));

vi.mock("@/app/actions/labels", () => ({
  createLabelAction: vi.fn(),
}));

vi.mock("@/app/actions/links", () => ({
  addLinkAction: vi.fn(),
  removeLinkAction: vi.fn(),
}));

vi.mock("@/app/actions/refs", () => ({
  addRefAction: vi.fn(),
  removeRefAction: vi.fn(),
}));

vi.mock("@/lib/toast", () => ({
  toast: {
    error: mocks.toastError,
    success: mocks.toastSuccess,
  },
}));





const detail: Parameters<typeof ItemDetailPanel>[0]["detail"] = {
  id: "22222222-2222-4222-9222-222222222222",
  key: "CASS-2",
  type: "epic",
  kind: "feature",
  backlogId: "11111111-1111-4111-8111-111111111111",
  title: "Paiement en ligne",
  description: null,
  parentId: "33333333-3333-4333-8333-333333333333",
  statusId: "44444444-4444-4444-8444-444444444444",
  priority: 2,
  estimatePoints: null,
  assigneeId: null,
  reporterId: "better-auth-marie",
  rank: "a1",
  path: "root.33333333333343338333333333333333.22222222222242229222222222222222",
  depth: 1,
  dueDate: null,
  createdAt: new Date("2026-08-01T10:00:00.000Z"),
  updatedAt: new Date("2026-08-02T10:00:00.000Z"),
  closedAt: null,
  deletedAt: null,
  search: "",
};

const baseProps = {
  detail,
  activities: [],
  comments: [],
  currentUserId: "better-auth-marie",
  itemLabelIds: [],
  backlogLabels: [],
  users: [
    { id: "better-auth-marie", name: "Marie Lemaire" },
  ],
  assigneeCandidates: [
    { id: "better-auth-marie", name: "Marie Lemaire" },
  ],
  reporterCandidates: [
    { id: "better-auth-marie", name: "Marie Lemaire" },
  ],
  statuses: [
    {
      id: detail.statusId,
      name: "À faire",
      color: "#9aa0a6",
      category: "todo",
    },
  ],
  backlogKey: "CASS",
  links: [],
  candidates: [],
  refs: [],
};

const currentArchivedVersion = {
  id: "55555555-5555-4555-8555-555555555555",
  name: "Legacy",
  released: true,
  archived: true,
};
const activeVersion = {
  id: "66666666-6666-4666-8666-666666666666",
  name: "2026.10",
  released: false,
  archived: false,
};
const publishedVersion = {
  id: "77777777-7777-4777-8777-777777777777",
  name: "2026.09",
  released: true,
  archived: false,
};

/** The panel always renders inside the drawer frame, as in the app. */
function DetailHarness({
  initialEntries,
  children,
}: {
  initialEntries: ViewUrlEntry[];
  children: React.ReactNode;
}) {
  return (
    <ViewUrlStateProvider initialEntries={initialEntries}>
      <ItemDetailSheet itemKey={detail.key}>{children}</ItemDetailSheet>
    </ViewUrlStateProvider>
  );
}

/** Opens a « Détails » row's editor, as a click on its value does. */
async function editField(user: ReturnType<typeof userEvent.setup>, label: string) {
  const iconTrigger = screen.queryByRole("button", { name: `Modifier : ${label}` });
  await user.click(iconTrigger ?? screen.getByRole("button", { name: new RegExp(`^${label} `) }));
}

function renderPanel(
  parent?: { key: string; title: string },
  detailOverride = detail,
  canEditItems = true,
) {
  return render(
    <DetailHarness initialEntries={[["view", "board"], ["item", detail.key]]}>
      <ItemDetailPanel
        {...baseProps}
        detail={detailOverride}
        parent={parent}
        canEditItems={canEditItems}
        canTransitionItems={canEditItems}
        canAssignItems={canEditItems}
      />
    </DetailHarness>,
  );
}

describe("ItemDetailPanel header", () => {
  const writeText = vi.fn();

  beforeEach(() => {
    mocks.push.mockReset();
    mocks.refresh.mockReset();
    mocks.replace.mockReset();
    mocks.restoreItemAction.mockReset();
    mocks.softDeleteItemAction.mockReset();
    mocks.toastError.mockReset();
    mocks.toastSuccess.mockReset();
    mocks.updateItemAction.mockReset();
    mocks.moveSprintItemAction.mockReset();
    mocks.reparentItemAction.mockReset();
    writeText.mockReset();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    window.history.replaceState({}, "", "/b/CASS?view=board&item=CASS-2");
  });

  it("renders the parent and current keys as a breadcrumb", () => {
    renderPanel({ key: "PARENT-1", title: "Composant parent" });

    expect(screen.getByRole("navigation", { name: "Fil d’Ariane" })).toHaveTextContent(
      /^PARENT-1\s*\/\s*CASS-2$/,
    );
    expect(screen.getByRole("link", { name: "PARENT-1" })).toHaveAttribute(
      "href",
      expect.stringContaining("item=PARENT-1"),
    );
  });

  it("renders only the current key when there is no parent", () => {
    renderPanel();

    const breadcrumb = screen.getByRole("navigation", { name: "Fil d’Ariane" });
    expect(breadcrumb).toHaveTextContent(/^CASS-2$/);
    expect(within(breadcrumb).queryByText("PARENT-1")).not.toBeInTheDocument();
  });

  it("shows story points only for tasks", async () => {
    const user = userEvent.setup();
    const { rerender } = renderPanel();
    expect(screen.queryByText("Points")).not.toBeInTheDocument();

    rerender(
      <DetailHarness initialEntries={[["view", "board"], ["item", detail.key]]}>
        <ItemDetailPanel
          {...baseProps}
          detail={{ ...detail, type: "tache", estimatePoints: 5 }}
        />
      </DetailHarness>,
    );

    expect(screen.getByRole("button", { name: /^Points / })).toHaveTextContent("5 pts");
    await editField(user, "Points");
    expect(screen.getByRole("spinbutton", { name: "Points" })).toHaveValue(5);
  });

  it("renders task points as text for a viewer", () => {
    renderPanel(undefined, { ...detail, type: "tache", estimatePoints: 5 }, false);

    expect(screen.getByText("Points")).toBeVisible();
    expect(screen.getByText("5 pts")).toBeVisible();
    expect(screen.queryByRole("spinbutton", { name: "Points" })).not.toBeInTheDocument();
  });

  it("formats decimal task points with the French comma for a viewer", () => {
    renderPanel(undefined, { ...detail, type: "tache", estimatePoints: 1.5 }, false);

    expect(screen.getByText("1,5 pt")).toBeVisible();
  });

  it("keeps the editable estimate input machine-parseable", async () => {
    const user = userEvent.setup();
    renderPanel(undefined, { ...detail, type: "tache", estimatePoints: 1.5 });
    await editField(user, "Points");

    expect(screen.getByRole("spinbutton", { name: "Points" })).toHaveValue(1.5);
  });

  it("copies the exact current href and confirms success", async () => {
    const user = userEvent.setup();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    writeText.mockResolvedValueOnce(undefined);
    renderPanel({ key: "PARENT-1", title: "Composant parent" });
    const href = window.location.href;

    await user.click(screen.getByRole("button", { name: "Copier le lien" }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(href));
    expect(mocks.toastSuccess).toHaveBeenCalledWith("Lien copié.");
    expect(mocks.toastError).not.toHaveBeenCalled();
  });

  it("shows a safe error toast when clipboard writing fails", async () => {
    const user = userEvent.setup();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    writeText.mockRejectedValueOnce(new Error("clipboard details"));
    renderPanel();

    await user.click(screen.getByRole("button", { name: "Copier le lien" }));

    await waitFor(() =>
      expect(mocks.toastError).toHaveBeenCalledWith("Impossible de copier le lien."),
    );
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
  });

  it("names the detail as a dialog and closes through Escape", async () => {
    const user = userEvent.setup();
    const returnTarget = document.createElement("button");
    returnTarget.textContent = "Item déclencheur";
    document.body.append(returnTarget);
    returnTarget.focus();
    const rendered = renderPanel();

    const dialog = screen.getByRole("dialog", {
      name: `${detail.key} — ${detail.title}`,
    });
    expect(dialog).toBeVisible();
    await user.keyboard("{Escape}");

    expect(dialog).not.toBeInTheDocument();
    // Closing only drops `item` from the URL, through the History API.
    await waitFor(() => expect(currentHref()).toBe("/b/CASS?view=board"));
    expect(mocks.push).not.toHaveBeenCalled();
    expect(returnTarget).toHaveFocus();
    rendered.unmount();
    returnTarget.remove();
  });

  it("stacks the properties under the main column until a wide drawer gives them a third", () => {
    renderPanel();

    const dialog = screen.getByRole("dialog", { name: `${detail.key} — ${detail.title}` });
    expect(dialog).toHaveClass("w-screen", "md:w-[min(960px,92vw)]");
    expect(dialog).not.toHaveClass("md:w-[620px]");
    // A container query: the side column joins at a ~900 px drawer, not a viewport.
    expect(screen.getByTestId("item-detail-grid").parentElement).toHaveClass("@container");
    expect(screen.getByTestId("item-detail-grid")).toHaveClass(
      "grid-cols-1",
      "@min-[900px]:grid-cols-[minmax(0,1fr)_340px]",
    );
  });

  it("fills the viewport height and scrolls each column on its own when side by side", () => {
    renderPanel();

    const dialog = screen.getByRole("dialog", { name: `${detail.key} — ${detail.title}` });
    // Full height from the insets; the body scrolls, never the frame.
    expect(dialog).toHaveClass("inset-y-0", "flex", "flex-col", "overflow-hidden");
    expect(dialog).not.toHaveClass("h-dvh");
    expect(dialog).not.toHaveClass("overflow-y-auto");
    expect(screen.getByRole("banner")).toHaveClass("flex-none");
    expect(screen.getByTestId("item-detail-grid")).toHaveClass(
      "min-h-0",
      "flex-1",
      "overflow-y-auto",
      "@min-[900px]:grid-rows-1",
      "@min-[900px]:overflow-hidden",
    );
    expect(screen.getByTestId("item-detail-main")).toHaveClass("@min-[900px]:overflow-y-auto");
    expect(screen.getByTestId("item-detail-properties")).toHaveClass("@min-[900px]:overflow-y-auto");
  });

  it("keeps the properties column and its editors inside their width", async () => {
    const user = userEvent.setup();
    renderPanel(undefined, { ...detail, type: "tache" });

    const properties = screen.getByTestId("item-detail-properties");
    expect(properties).toHaveClass("min-w-0", "bg-[var(--surface-2)]", "@min-[900px]:border-l");
    await editField(user, "Points");
    expect(within(properties).getByRole("spinbutton", { name: "Points" })).toHaveClass(
      "min-w-0",
    );
  });

  it("cancels title editing with Escape without closing the detail dialog", async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByRole("button", { description: `Renommer ${detail.key}` }));
    expect(screen.getByRole("textbox", { name: "Titre de l’item" })).toHaveFocus();
    await user.keyboard("{Escape}");

    expect(
      screen.getByRole("dialog", { name: `${detail.key} — ${detail.title}` }),
    ).toBeVisible();
    expect(screen.queryByRole("textbox", { name: "Titre de l’item" }))
      .not.toBeInTheDocument();
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("keeps item details readable while hiding viewer mutation affordances", async () => {
    const user = userEvent.setup();
    render(
      <DetailHarness initialEntries={[["view", "board"], ["item", detail.key]]}>
        <ItemDetailPanel
          {...baseProps}
          canEditItems={false}
          canTransitionItems={false}
          canAssignItems={false}
        />
      </DetailHarness>,
    );

    expect(screen.getByRole("heading", { name: detail.title })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Plus d’actions" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ajouter une description" })).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Lier un item/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Lier une PR ou un commit" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Priorité / })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Passer au statut/ })).not.toBeInTheDocument();
    expect(screen.getByText("Moyenne")).toBeVisible();

    await user.click(screen.getByRole("tab", { name: "Commentaires" }));
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("requires edit plus the exact status or assignee capability", () => {
    const denied = {
      canEditItems: false,
      canTransitionItems: false,
      canAssignItems: false,
    } as const;
    const priority = () => screen.queryByRole("button", { name: /^Priorité / });
    const assignee = () => screen.queryByRole("button", { name: /^Assigné / });
    const status = () => screen.queryByRole("combobox", { name: "Statut" });

    const edited = render(
      <DetailHarness initialEntries={[["view", "board"], ["item", detail.key]]}>
        <ItemDetailPanel {...baseProps} {...denied} canEditItems />
      </DetailHarness>,
    );
    expect(screen.getByRole("button", { description: `Renommer ${detail.key}` })).toBeVisible();
    expect(priority()).toBeVisible();
    expect(status()).not.toBeInTheDocument();
    expect(assignee()).not.toBeInTheDocument();
    edited.unmount();

    const transitioned = render(
      <DetailHarness initialEntries={[["view", "board"], ["item", detail.key]]}>
        <ItemDetailPanel {...baseProps} {...denied} canTransitionItems />
      </DetailHarness>,
    );
    expect(status()).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { description: `Renommer ${detail.key}` })).not.toBeInTheDocument();
    expect(priority()).not.toBeInTheDocument();
    expect(assignee()).not.toBeInTheDocument();
    transitioned.unmount();

    const editedAndTransitioned = render(
      <DetailHarness initialEntries={[["view", "board"], ["item", detail.key]]}>
        <ItemDetailPanel {...baseProps} {...denied} canEditItems canTransitionItems />
      </DetailHarness>,
    );
    expect(status()).toBeVisible();
    expect(assignee()).not.toBeInTheDocument();
    editedAndTransitioned.unmount();

    const assigned = render(
      <DetailHarness initialEntries={[["view", "board"], ["item", detail.key]]}>
        <ItemDetailPanel {...baseProps} {...denied} canAssignItems />
      </DetailHarness>,
    );
    expect(assignee()).not.toBeInTheDocument();
    expect(status()).not.toBeInTheDocument();
    expect(priority()).not.toBeInTheDocument();
    assigned.unmount();

    render(
      <DetailHarness initialEntries={[["view", "board"], ["item", detail.key]]}>
        <ItemDetailPanel {...baseProps} {...denied} canEditItems canAssignItems />
      </DetailHarness>,
    );
    expect(assignee()).toBeVisible();
    expect(screen.getByRole("button", { name: "M’assigner" })).toBeVisible();
    expect(status()).not.toBeInTheDocument();
  });

  it("renders current assignee and reporter identities as disabled non-candidate options", async () => {
    const user = userEvent.setup();
    const currentAssignee = { id: "former-assignee", name: "Ancienne assignée" };
    const currentReporter = { id: "former-reporter", name: "Ancien rapporteur" };
    const assignable = { id: "assignable-user", name: "Candidate assignable" };
    const reporterCandidate = { id: "reporter-candidate", name: "Rapporteuse candidate" };

    render(
      <DetailHarness initialEntries={[["view", "board"], ["item", detail.key]]}>
        <ItemDetailPanel
          {...baseProps}
          detail={{
            ...detail,
            assigneeId: currentAssignee.id,
            reporterId: currentReporter.id,
          }}
          users={[currentAssignee, currentReporter]}
          assigneeCandidates={[assignable]}
          reporterCandidates={[reporterCandidate]}
          canEditItems
          canAssignItems
        />
      </DetailHarness>,
    );

    expect(screen.getByRole("button", { name: /^Assigné / })).toHaveTextContent(currentAssignee.name);
    await editField(user, "Assigné");
    const assigneeSelect = screen.getByRole("combobox", { name: "Assigné" });
    expect(assigneeSelect).toHaveValue(currentAssignee.id);
    expect(
      within(assigneeSelect).getByRole("option", { name: currentAssignee.name }),
    ).toBeDisabled();
    expect(
      within(assigneeSelect).getByRole("option", { name: assignable.name }),
    ).toBeEnabled();

    await editField(user, "Rapporteur");
    const reporterSelect = screen.getByRole("combobox", { name: "Rapporteur" });
    expect(reporterSelect).toHaveValue(currentReporter.id);
    expect(
      within(reporterSelect).getByRole("option", { name: currentReporter.name }),
    ).toBeDisabled();
    expect(
      within(reporterSelect).getByRole("option", { name: reporterCandidate.name }),
    ).toBeEnabled();
  });

  it("gates Fix version editing only with the release assign capability", () => {
    const readonly = render(
      <DetailHarness initialEntries={[["view", "board"], ["item", detail.key]]}>
        <ItemDetailPanel
          {...baseProps}
          fixVersions={[currentArchivedVersion]}
          releaseOptions={[activeVersion]}
          releaseCapabilities={{ manage: true, assignItems: false, bulkAssignItems: true }}
        />
      </DetailHarness>,
    );

    expect(screen.getByText("Legacy — Archivée")).toBeVisible();
    expect(screen.getByRole("button", { name: "Versions" })).toBeDisabled();
    readonly.unmount();

    render(
      <DetailHarness initialEntries={[["view", "board"], ["item", detail.key]]}>
        <ItemDetailPanel
          {...baseProps}
          canEditItems={false}
          fixVersions={[currentArchivedVersion]}
          releaseOptions={[activeVersion]}
          releaseCapabilities={{ manage: false, assignItems: true, bulkAssignItems: false }}
        />
      </DetailHarness>,
    );

    expect(screen.getByRole("button", { name: "Versions" })).toBeEnabled();
  });

  it("expands overflow to remove a current archived Fix version beyond the first two", async () => {
    const user = userEvent.setup();
    mocks.updateItemAction.mockResolvedValueOnce({ ok: true, item: detail });
    render(
      <DetailHarness initialEntries={[["view", "board"], ["item", detail.key]]}>
        <ItemDetailPanel
          {...baseProps}
          fixVersions={[activeVersion, publishedVersion, currentArchivedVersion]}
          releaseOptions={[activeVersion, publishedVersion]}
          releaseCapabilities={{ manage: false, assignItems: true, bulkAssignItems: false }}
        />
      </DetailHarness>,
    );

    expect(screen.queryByText("Legacy — Archivée")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", {
      name: "Afficher 1 version supplémentaire",
    }));
    expect(screen.getByText("Legacy — Archivée")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Retirer Legacy" }));

    await waitFor(() => expect(mocks.updateItemAction).toHaveBeenCalledWith({
      id: detail.id,
      backlogKey: "CASS",
      fixVersionIds: [activeVersion.id, publishedVersion.id],
    }));
    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalledWith(
      "Fix versions mises à jour.",
    ));
  });

  it("optimistically updates Fix versions, rolls back a safe failure, and keeps the menu open", async () => {
    const user = userEvent.setup();
    let resolve!: (result: { ok: false; error: string }) => void;
    mocks.updateItemAction.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
    render(
      <DetailHarness initialEntries={[["view", "board"], ["item", detail.key]]}>
        <ItemDetailPanel
          {...baseProps}
          fixVersions={[currentArchivedVersion]}
          releaseOptions={[activeVersion]}
          releaseCapabilities={{ manage: false, assignItems: true, bulkAssignItems: false }}
        />
      </DetailHarness>,
    );

    await user.click(screen.getByRole("button", { name: "Versions" }));
    await user.click(screen.getByRole("menuitemcheckbox", { name: activeVersion.name }));
    expect(screen.getByRole("button", { name: `Retirer ${activeVersion.name}` })).toBeVisible();
    expect(mocks.updateItemAction).toHaveBeenCalledWith({
      id: detail.id,
      backlogKey: "CASS",
      fixVersionIds: [currentArchivedVersion.id, activeVersion.id],
    });
    resolve({ ok: false, error: "Version interdite." });

    await waitFor(() =>
      expect(screen.queryByRole("button", { name: `Retirer ${activeVersion.name}` }))
        .not.toBeInTheDocument(),
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Version interdite.");
    expect(screen.getByRole("menuitemcheckbox", { name: activeVersion.name })).toBeVisible();
  });

  it("lists Fix version options in the manual version order even when one is already assigned", async () => {
    const user = userEvent.setup();
    const thirdVersion = {
      id: "88888888-8888-4888-8888-888888888888",
      name: "2026.11",
      released: false,
      archived: false,
    };
    render(
      <DetailHarness initialEntries={[["view", "board"], ["item", detail.key]]}>
        <ItemDetailPanel
          {...baseProps}
          fixVersions={[{ ...thirdVersion, name: "stale name" }, currentArchivedVersion]}
          releaseOptions={[activeVersion, publishedVersion, thirdVersion]}
          releaseCapabilities={{ manage: false, assignItems: true, bulkAssignItems: false }}
        />
      </DetailHarness>,
    );

    await user.click(screen.getByRole("button", { name: "Versions" }));
    expect(screen.getAllByRole("menuitemcheckbox").map((option) => option.textContent?.trim()))
      .toEqual([
        expect.stringContaining(activeVersion.name),
        expect.stringContaining(publishedVersion.name),
        expect.stringContaining(thirdVersion.name),
      ]);
    expect(screen.queryByRole("menuitemcheckbox", { name: /Legacy/ })).not.toBeInTheDocument();
    expect(screen.getByText("Legacy — Archivée")).toBeVisible();
  });

  it("rolls back Fix versions and keeps the menu open when the action rejects", async () => {
    const user = userEvent.setup();
    mocks.updateItemAction.mockRejectedValueOnce(new Error("internal release details"));
    render(
      <DetailHarness initialEntries={[["view", "board"], ["item", detail.key]]}>
        <ItemDetailPanel
          {...baseProps}
          fixVersions={[]}
          releaseOptions={[activeVersion]}
          releaseCapabilities={{ manage: false, assignItems: true, bulkAssignItems: false }}
        />
      </DetailHarness>,
    );

    await user.click(screen.getByRole("button", { name: "Versions" }));
    await user.click(screen.getByRole("menuitemcheckbox", { name: activeVersion.name }));

    await waitFor(() =>
      expect(screen.queryByRole("button", { name: `Retirer ${activeVersion.name}` }))
        .not.toBeInTheDocument(),
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Mise à jour impossible.");
    expect(screen.getByRole("menuitemcheckbox", { name: activeVersion.name })).toBeVisible();
  });

  it("grants delete, comments, and links independently from ordinary editing", async () => {
    const user = userEvent.setup();
    render(
      <DetailHarness initialEntries={[["view", "board"], ["item", detail.key]]}>
        <ItemDetailPanel
          {...baseProps}
          canEditItems={false}
          canTransitionItems={false}
          canAssignItems={false}
          itemCapabilities={{
            create: false,
            edit: false,
            transition: false,
            assign: false,
            delete: true,
            restore: false,
            addComments: true,
            editOwnComments: false,
            deleteOwnComments: false,
            deleteAllComments: false,
            link: true,
          }}
        />
      </DetailHarness>,
    );

    expect(screen.getByRole("button", { name: "Plus d’actions" })).toBeVisible();
    expect(screen.getByRole("button", { name: /\+ Lier un item/ })).toBeVisible();
    expect(screen.getByRole("button", { name: "Lier une PR ou un commit" })).toBeVisible();
    expect(screen.queryByRole("button", { description: `Renommer ${detail.key}` }))
      .not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Commentaires" }));
    expect(await screen.findByRole("textbox", { name: "Nouveau commentaire" })).toBeVisible();
  });

  it("lets a scheduler change parent and sprint without editing ordinary fields", async () => {
    const user = userEvent.setup();
    mocks.reparentItemAction.mockResolvedValue({ ok: true });
    mocks.moveSprintItemAction.mockResolvedValue({ ok: true });
    const taskDetail = { ...detail, type: "tache" as const };
    render(
      <DetailHarness initialEntries={[["view", "board"], ["item", detail.key]]}>
        <ItemDetailPanel
          {...baseProps}
          detail={taskDetail}
          parent={{ key: "CASS-1", title: "Epic initial" }}
          candidates={[
            { id: detail.parentId!, key: "CASS-1", title: "Epic initial", type: "epic" },
            { id: "55555555-5555-4555-8555-555555555555", key: "CASS-3", title: "Epic cible", type: "epic" },
          ]}
          sprints={[
            { id: "66666666-6666-4666-8666-666666666666", name: "Sprint actif" },
          ]}
          sprintId={null}
          canEditItems={false}
          canTransitionItems={false}
          canAssignItems={false}
          planningCapabilities={{ rank: true, reparent: true, assignSprint: true, manageSprints: false }}
        />
      </DetailHarness>,
    );

    expect(screen.queryByRole("button", { description: `Renommer ${detail.key}` }))
      .not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Priorité / })).not.toBeInTheDocument();
    await editField(user, "Parent");
    await user.selectOptions(screen.getByRole("combobox", { name: "Parent" }), "55555555-5555-4555-8555-555555555555");
    await editField(user, "Sprint");
    await user.selectOptions(screen.getByRole("combobox", { name: "Sprint" }), "66666666-6666-4666-8666-666666666666");

    await waitFor(() => expect(mocks.reparentItemAction).toHaveBeenCalledWith({
      backlogKey: "CASS",
      id: detail.id,
      newParentId: "55555555-5555-4555-8555-555555555555",
    }));
    await waitFor(() => expect(mocks.moveSprintItemAction).toHaveBeenCalledWith({
      backlogKey: "CASS",
      backlogId: detail.backlogId,
      itemId: detail.id,
      sprintId: "66666666-6666-4666-8666-666666666666",
      beforeId: null,
      afterId: null,
    }));
  });

  it("rolls back an optimistic planning change and exposes the safe error", async () => {
    const user = userEvent.setup();
    let resolveAction!: (result: { ok: false; error: string }) => void;
    mocks.reparentItemAction.mockReturnValue(
      new Promise((resolve) => {
        resolveAction = resolve;
      }),
    );
    render(
      <DetailHarness initialEntries={[["view", "board"], ["item", detail.key]]}>
        <ItemDetailPanel
          {...baseProps}
          detail={{ ...detail, type: "tache" }}
          parent={{ key: "CASS-1", title: "Epic initial" }}
          candidates={[
            { id: detail.parentId!, key: "CASS-1", title: "Epic initial", type: "epic" },
            { id: "55555555-5555-4555-8555-555555555555", key: "CASS-3", title: "Epic cible", type: "epic" },
          ]}
          canEditItems={false}
          planningCapabilities={{ rank: true, reparent: true, assignSprint: true, manageSprints: false }}
        />
      </DetailHarness>,
    );

    await editField(user, "Parent");
    const parentSelect = screen.getByRole("combobox", { name: "Parent" });
    await user.selectOptions(parentSelect, "55555555-5555-4555-8555-555555555555");
    expect(parentSelect).toHaveValue("55555555-5555-4555-8555-555555555555");
    resolveAction({ ok: false, error: "Planification interdite." });

    await waitFor(() => expect(parentSelect).toHaveValue(detail.parentId));
    expect(screen.getByRole("alert")).toHaveTextContent("Planification interdite.");
    expect(mocks.toastError).toHaveBeenCalledWith("Planification interdite.");
  });

  it("rolls back the parent and exposes a safe error when reparenting rejects", async () => {
    const user = userEvent.setup();
    mocks.reparentItemAction.mockRejectedValueOnce(new Error("internal parent details"));
    render(
      <DetailHarness initialEntries={[["view", "board"], ["item", detail.key]]}>
        <ItemDetailPanel
          {...baseProps}
          detail={{ ...detail, type: "tache" }}
          parent={{ key: "CASS-1", title: "Epic initial" }}
          candidates={[
            { id: detail.parentId!, key: "CASS-1", title: "Epic initial", type: "epic" },
            { id: "55555555-5555-4555-8555-555555555555", key: "CASS-3", title: "Epic cible", type: "epic" },
          ]}
          canEditItems={false}
          planningCapabilities={{ rank: true, reparent: true, assignSprint: true, manageSprints: false }}
        />
      </DetailHarness>,
    );

    await editField(user, "Parent");
    const parentSelect = screen.getByRole("combobox", { name: "Parent" });
    await user.selectOptions(parentSelect, "55555555-5555-4555-8555-555555555555");

    await waitFor(() => expect(parentSelect).toHaveValue(detail.parentId));
    expect(screen.getByRole("alert")).toHaveTextContent("Impossible de modifier la planification.");
    expect(mocks.toastError).toHaveBeenCalledWith("Impossible de modifier la planification.");
  });

  it("rolls back the sprint and exposes a safe error when sprint assignment rejects", async () => {
    const user = userEvent.setup();
    mocks.moveSprintItemAction.mockRejectedValueOnce(new Error("internal sprint details"));
    const initialSprintId = "66666666-6666-4666-8666-666666666666";
    const targetSprintId = "77777777-7777-4777-8777-777777777777";
    render(
      <DetailHarness initialEntries={[["view", "board"], ["item", detail.key]]}>
        <ItemDetailPanel
          {...baseProps}
          detail={{ ...detail, type: "tache" }}
          sprints={[
            { id: initialSprintId, name: "Sprint initial" },
            { id: targetSprintId, name: "Sprint cible" },
          ]}
          sprintId={initialSprintId}
          canEditItems={false}
          planningCapabilities={{ rank: true, reparent: true, assignSprint: true, manageSprints: false }}
        />
      </DetailHarness>,
    );

    await editField(user, "Sprint");
    const sprintSelect = screen.getByRole("combobox", { name: "Sprint" });
    await user.selectOptions(sprintSelect, targetSprintId);

    await waitFor(() => expect(sprintSelect).toHaveValue(initialSprintId));
    expect(screen.getByRole("alert")).toHaveTextContent("Impossible de modifier la planification.");
    expect(mocks.toastError).toHaveBeenCalledWith("Impossible de modifier la planification.");
  });
});

describe("ItemDetailPanel keyboard shortcuts", () => {
  beforeEach(() => {
    mocks.updateItemAction.mockReset();
    mocks.updateItemAction.mockResolvedValue({ ok: true });
    mocks.refresh.mockReset();
    window.history.replaceState({}, "", "/b/CASS?view=board&item=CASS-2");
  });

  function renderWithShortcuts(
    overrides: Partial<Parameters<typeof ItemDetailPanel>[0]> = {},
  ) {
    return render(
      <KeyboardShortcutsProvider>
        <DetailHarness initialEntries={[["view", "board"], ["item", detail.key]]}>
          <ItemDetailPanel
            {...baseProps}
            canEditItems
            canTransitionItems
            canAssignItems
            {...overrides}
          />
        </DetailHarness>
      </KeyboardShortcutsProvider>,
    );
  }

  function pressInDrawer(key: string) {
    fireEvent.keyDown(screen.getByRole("dialog"), { key });
  }

  it("m opens the comments and focuses the composer", async () => {
    renderWithShortcuts();

    pressInDrawer("m");

    await waitFor(() =>
      expect(screen.getByRole("textbox", { name: "Nouveau commentaire" })).toHaveFocus(),
    );
  });

  it("e starts renaming the item", () => {
    renderWithShortcuts();
    pressInDrawer("e");
    expect(screen.getByRole("textbox", { name: "Titre de l’item" })).toHaveFocus();
  });

  it("a focuses the assignee and s the status", () => {
    renderWithShortcuts();
    pressInDrawer("a");
    expect(screen.getByRole("combobox", { name: "Assigné" })).toHaveFocus();
    pressInDrawer("s");
    expect(screen.getByRole("combobox", { name: "Statut" })).toHaveFocus();
  });

  it("a unfolds « Détails » folded by a click, then focuses the visible assignee", () => {
    renderWithShortcuts();
    const details = screen.getByRole("button", { name: "Détails" });
    fireEvent.click(details);
    expect(details).toHaveAttribute("aria-expanded", "false");

    pressInDrawer("a");

    expect(details).toHaveAttribute("aria-expanded", "true");
    const assignee = screen.getByRole("combobox", { name: "Assigné" });
    expect(assignee).toBeVisible();
    expect(assignee).toHaveFocus();
    window.localStorage.clear();
  });

  it("a unfolds « Détails » folded by the stored preference", async () => {
    window.localStorage.setItem("jiroo:item-drawer-panel:details", "collapsed");
    renderWithShortcuts();
    const details = screen.getByRole("button", { name: "Détails" });
    await waitFor(() => expect(details).toHaveAttribute("aria-expanded", "false"));

    pressInDrawer("a");

    expect(details).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("combobox", { name: "Assigné" })).toHaveFocus();
    window.localStorage.clear();
  });

  it("a leaves a folded « Détails » alone without the assign right or with shortcuts off", async () => {
    window.localStorage.setItem("jiroo:item-drawer-panel:details", "collapsed");
    const { unmount } = renderWithShortcuts({ canAssignItems: false });
    const details = screen.getByRole("button", { name: "Détails" });
    await waitFor(() => expect(details).toHaveAttribute("aria-expanded", "false"));
    pressInDrawer("a");
    expect(details).toHaveAttribute("aria-expanded", "false");
    unmount();

    window.localStorage.setItem("jiroo-shortcuts-enabled", "false");
    renderWithShortcuts();
    const folded = screen.getByRole("button", { name: "Détails" });
    await waitFor(() => expect(folded).toHaveAttribute("aria-expanded", "false"));
    pressInDrawer("a");
    expect(folded).toHaveAttribute("aria-expanded", "false");
    window.localStorage.clear();
  });

  it("i assigns the item to the current user", async () => {
    renderWithShortcuts();

    pressInDrawer("i");

    await waitFor(() =>
      expect(mocks.updateItemAction).toHaveBeenCalledWith(
        expect.objectContaining({ id: detail.id, assigneeId: "better-auth-marie" }),
      ),
    );
    expect(screen.getByRole("button", { name: /^Assigné / })).toHaveTextContent("Marie Lemaire");
  });

  it("does nothing the user is not allowed to do", () => {
    renderWithShortcuts({
      canEditItems: false,
      canTransitionItems: false,
      canAssignItems: false,
    });

    for (const key of ["e", "m", "a", "i", "s"]) pressInDrawer(key);

    expect(mocks.updateItemAction).not.toHaveBeenCalled();
    expect(screen.queryByRole("textbox", { name: "Titre de l’item" })).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Nouveau commentaire" })).not.toBeInTheDocument();
  });

  it("i does nothing when the user cannot be assigned in this backlog", () => {
    renderWithShortcuts({ assigneeCandidates: [{ id: "other", name: "Autre" }] });
    pressInDrawer("i");
    expect(mocks.updateItemAction).not.toHaveBeenCalled();
  });
});

describe("ItemDetailPanel Jira layout (JIR-73)", () => {
  const writeText = vi.fn();

  beforeEach(() => {
    mocks.push.mockReset();
    mocks.toastSuccess.mockReset();
    mocks.toastError.mockReset();
    mocks.updateItemAction.mockReset();
    mocks.updateItemAction.mockResolvedValue({ ok: true });
    writeText.mockReset();
    writeText.mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    window.history.replaceState({}, "", "/b/CASS?view=board&item=CASS-2");
    document.body.innerHTML = "";
  });

  const fullCapabilities = {
    create: true,
    edit: true,
    transition: true,
    assign: true,
    delete: true,
    restore: true,
    addComments: true,
    editOwnComments: true,
    deleteOwnComments: true,
    deleteAllComments: false,
    link: true,
  };
  const createDialog = {
    backlogId: detail.backlogId,
    items: [],
    statuses: [{ id: detail.statusId, name: "À faire" }],
    canScheduleItems: true,
    releaseOptions: [],
  };

  it("lists the children by type and offers to create one with the parent prefilled", async () => {
    const user = userEvent.setup();
    render(
      <DetailHarness initialEntries={[["view", "board"], ["item", detail.key]]}>
        <ItemDetailPanel
          {...baseProps}
          itemCapabilities={fullCapabilities}
          createDialog={createDialog}
          childItems={[
            { id: "child-1", key: "CASS-7", title: "Tâche enfant", type: "tache", statusId: detail.statusId },
          ]}
        />
      </DetailHarness>,
    );

    const children = screen.getByRole("region", { name: "Tâches" });
    // The Backlog row (JIR-93): the identity links, the status follows.
    const childRow = within(children).getByRole("listitem");
    expect(within(childRow).getByRole("link", { name: /CASS-7.*Tâche enfant/ })).toBeVisible();
    expect(within(childRow).getByText("À faire")).toBeVisible();
    expect(screen.getByRole("button", { name: "Créer une tâche" })).toBeVisible();

    await user.click(within(children).getByRole("button", { name: "+ Créer une tâche" }));
    const dialog = await screen.findByRole("dialog", { name: /Nouvel item/ });
    expect(within(dialog).getByRole("combobox", { name: "Type" })).toHaveTextContent("Tâche");
  });

  it("creates a child under the opened item even when the view's filter left it out", async () => {
    const user = userEvent.setup();
    mocks.createItemAction.mockResolvedValueOnce({ ok: true, item: { id: "new-task", key: "CASS-30" } });
    render(
      <DetailHarness initialEntries={[["view", "list"], ["item", detail.key]]}>
        <ItemDetailPanel
          {...baseProps}
          itemCapabilities={fullCapabilities}
          // A Fix version filter matched other epics only.
          createDialog={{
            ...createDialog,
            items: [{ id: "other-epic", key: "CASS-5", type: "epic", title: "Autre epic" }],
          }}
        />
      </DetailHarness>,
    );

    await user.click(screen.getByRole("button", { name: "Créer une tâche" }));
    const dialog = await screen.findByRole("dialog", { name: /Nouvel item/ });
    const parent = within(dialog).getByRole("combobox", { name: /Parent/ });
    expect(parent).toHaveTextContent(`${detail.key} — ${detail.title}`);
    await user.type(within(dialog).getByRole("textbox", { name: /Titre/ }), "Tâche filtrée");
    await user.click(within(dialog).getByRole("button", { name: /^Créer$/ }));

    await waitFor(() =>
      expect(mocks.createItemAction).toHaveBeenCalledWith(
        expect.objectContaining({ type: "tache", parentId: detail.id, title: "Tâche filtrée" }),
      ),
    );
  });

  it("says the view's filters hide a child created from the drawer (JIR-92)", async () => {
    const user = userEvent.setup();
    mocks.createItemAction.mockResolvedValueOnce({
      ok: true,
      item: {
        id: "new-task", key: "CASS-31", type: "tache", kind: "feature", title: "Tâche masquée",
        statusId: detail.statusId, priority: 0, assigneeId: null, path: `${detail.path}.newtask`,
      },
    });
    render(
      <DetailHarness initialEntries={[["view", "list"], ["item", detail.key]]}>
        <ItemDetailPanel
          {...baseProps}
          itemCapabilities={fullCapabilities}
          createDialog={createDialog}
          viewFilters={{
            q: "", types: [], statusIds: [], priorities: [], assignees: [], labels: [],
            releaseIds: ["55555555-5555-4555-8555-555555555555"], sprintIds: [], kind: [], underIds: [],
          }}
        />
      </DetailHarness>,
    );

    await user.click(screen.getByRole("button", { name: "Créer une tâche" }));
    const dialog = await screen.findByRole("dialog", { name: /Nouvel item/ });
    await user.type(within(dialog).getByRole("textbox", { name: /Titre/ }), "Tâche masquée");
    await user.click(within(dialog).getByRole("button", { name: /^Créer$/ }));

    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalled());
    const [message, options] = mocks.toastSuccess.mock.calls[0]!;
    expect(message).toBe("CASS-31 créé — masqué par les filtres de la vue.");
    expect(options.secondaryAction.label).toBe("Ouvrir");
  });

  it("has no child section for a sub-task and no creation without the right", () => {
    const { unmount } = render(
      <DetailHarness initialEntries={[["view", "board"], ["item", detail.key]]}>
        <ItemDetailPanel {...baseProps} detail={{ ...detail, type: "soustache" }} itemCapabilities={fullCapabilities} createDialog={createDialog} />
      </DetailHarness>,
    );
    expect(screen.queryByRole("region", { name: "Sous-tâches" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Créer une/ })).not.toBeInTheDocument();
    unmount();

    render(
      <DetailHarness initialEntries={[["view", "board"], ["item", detail.key]]}>
        <ItemDetailPanel {...baseProps} itemCapabilities={{ ...fullCapabilities, create: false }} createDialog={createDialog} />
      </DetailHarness>,
    );
    expect(screen.getByRole("region", { name: "Tâches" })).toHaveTextContent("Aucun enfant.");
    expect(screen.queryByRole("button", { name: /Créer une tâche/ })).not.toBeInTheDocument();
  });

  it("opens the link form from the « Lier un item » action", async () => {
    const user = userEvent.setup();
    render(
      <DetailHarness initialEntries={[["view", "board"], ["item", detail.key]]}>
        <ItemDetailPanel {...baseProps} itemCapabilities={fullCapabilities} />
      </DetailHarness>,
    );
    await user.click(screen.getByRole("button", { name: "Lier un item" }));
    expect(screen.getByRole("textbox", { name: "Rechercher un item à lier" })).toHaveFocus();
  });

  it("copies the item's branch name", async () => {
    const user = userEvent.setup();
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    render(
      <DetailHarness initialEntries={[["view", "board"], ["item", detail.key]]}>
        <ItemDetailPanel {...baseProps} />
      </DetailHarness>,
    );
    await user.click(screen.getByRole("button", { name: /Copier le nom de branche/ }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("cass-2-paiement-en-ligne"));
    expect(mocks.toastSuccess).toHaveBeenCalledWith(
      "Nom de branche copié : cass-2-paiement-en-ligne",
    );
  });

  it("assigns the item to me from the « M’assigner » link, then hides it", async () => {
    const user = userEvent.setup();
    render(
      <DetailHarness initialEntries={[["view", "board"], ["item", detail.key]]}>
        <ItemDetailPanel {...baseProps} />
      </DetailHarness>,
    );
    await user.click(screen.getByRole("button", { name: "M’assigner" }));
    expect(mocks.updateItemAction).toHaveBeenCalledWith(
      expect.objectContaining({ id: detail.id, assigneeId: "better-auth-marie" }),
    );
    expect(screen.getByRole("button", { name: /^Assigné / })).toHaveTextContent("Marie Lemaire");
    expect(screen.queryByRole("button", { name: "M’assigner" })).not.toBeInTheDocument();
  });

  it("offers the next status of the workflow", () => {
    render(
      <DetailHarness initialEntries={[["view", "board"], ["item", detail.key]]}>
        <ItemDetailPanel
          {...baseProps}
          statuses={[
            ...baseProps.statuses,
            { id: "doing", name: "En cours", color: "#d99a00", category: "in_progress" },
          ]}
        />
      </DetailHarness>,
    );
    expect(screen.getByRole("button", { name: "Passer au statut En cours" })).toBeVisible();
  });

  it("folds the Détails and Développement panels", async () => {
    const user = userEvent.setup();
    render(
      <DetailHarness initialEntries={[["view", "board"], ["item", detail.key]]}>
        <ItemDetailPanel {...baseProps} />
      </DetailHarness>,
    );
    const details = screen.getByRole("button", { name: "Détails" });
    await user.click(details);
    expect(details).toHaveAttribute("aria-expanded", "false");
    // Folded content leaves the accessibility tree.
    expect(screen.queryByRole("button", { name: /^Priorité / })).toBeNull();
    expect(screen.getByRole("button", { name: "Développement" })).toHaveAttribute("aria-expanded", "true");
    window.localStorage.clear();
  });

  function renderInList(keys: string[]) {
    const main = document.createElement("main");
    for (const key of keys) {
      const row = document.createElement("div");
      row.setAttribute("data-shortcut-item", key);
      row.tabIndex = 0;
      main.append(row);
    }
    document.body.append(main);
    return render(
      <KeyboardShortcutsProvider>
        <DetailHarness initialEntries={[["view", "board"], ["item", detail.key]]}>
          <ItemDetailPanel {...baseProps} />
        </DetailHarness>
      </KeyboardShortcutsProvider>,
    );
  }

  it("moves to the previous and next item of the view, with K / J too", async () => {
    const user = userEvent.setup();
    renderInList(["CASS-1", detail.key, "CASS-9"]);

    await user.click(screen.getByRole("button", { name: "Item suivant (J)" }));
    await waitFor(() => expect(currentHref()).toBe("/b/CASS?view=board&item=CASS-9"));
    await user.click(screen.getByRole("button", { name: "Item précédent (K)" }));
    await waitFor(() => expect(currentHref()).toBe("/b/CASS?view=board&item=CASS-1"));

    fireEvent.keyDown(screen.getByRole("dialog"), { key: "j" });
    await waitFor(() => expect(currentHref()).toBe("/b/CASS?view=board&item=CASS-9"));
    // Switching items never goes through a server navigation.
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("disables the end of the list and hides the arrows without a list", () => {
    const { unmount } = renderInList([detail.key, "CASS-9"]);
    expect(screen.getByRole("button", { name: "Item précédent (K)" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Item suivant (J)" })).toBeEnabled();
    unmount();
    document.body.innerHTML = "";

    renderInList(["CASS-1"]);
    expect(screen.queryByRole("button", { name: "Item suivant (J)" })).not.toBeInTheDocument();
  });

  it("m brings the comments back from the history filter", async () => {
    render(
      <KeyboardShortcutsProvider>
        <DetailHarness initialEntries={[["view", "board"], ["item", detail.key]]}>
          <ItemDetailPanel {...baseProps} />
        </DetailHarness>
      </KeyboardShortcutsProvider>,
    );
    fireEvent.click(screen.getByRole("tab", { name: "Historique" }));
    expect(screen.queryByRole("button", { name: "Commenter" })).not.toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "m" });
    expect(screen.getByRole("tab", { name: "Commentaires" })).toHaveAttribute("aria-selected", "true");
    await waitFor(() =>
      expect(screen.getByRole("textbox", { name: "Nouveau commentaire" })).toHaveFocus(),
    );
  });
});

describe("ItemDetailPanel description draft (JIR-71)", () => {
  beforeEach(() => {
    resetAutosaveRegistry();
    mocks.refresh.mockReset();
    mocks.updateItemAction.mockReset();
    window.history.replaceState({}, "", "/b/CASS?view=board&item=CASS-2");
  });

  it("keeps a description draft whose save failed, across a reopening of the drawer", async () => {
    let fail!: (value: unknown) => void;
    mocks.updateItemAction.mockImplementationOnce(() => new Promise((res) => (fail = res)));
    const user = userEvent.setup({ delay: 5 });
    const rendered = renderPanel();
    const textbox = await screen.findByRole("textbox", { name: "Description" });
    await waitFor(() => expect(textbox).toHaveAttribute("contenteditable", "true"));
    await user.click(textbox);
    await user.keyboard("{Control>}a{/Control}");
    await user.keyboard("Brouillon");
    // Leaving the description (here for the activity filter) saves it.
    await user.click(screen.getByRole("tab", { name: "Historique" }));
    await waitFor(() => expect(mocks.updateItemAction).toHaveBeenCalledTimes(1), {
      timeout: 3000,
    });
    // jsdom may drop a typed key under load: compare with what was sent.
    const sent = mocks.updateItemAction.mock.calls[0]![0].description as string;
    expect(sent).toMatch(/^B/);
    await act(async () => fail({ ok: false, error: "Indisponible" }));

    // The draft is kept per user and item when the drawer closes and reopens.
    rendered.unmount();
    renderPanel();
    const again = await screen.findByRole("textbox", { name: "Description" });
    await waitFor(() => expect(again).toHaveTextContent(sent), { timeout: 3000 });
    expect(await screen.findByRole("button", { name: "Réessayer" })).toBeInTheDocument();
  });
});
