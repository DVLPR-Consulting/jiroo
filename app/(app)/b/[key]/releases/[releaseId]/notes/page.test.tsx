import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  editorProps: vi.fn(),
  getBacklogByKeyForUser: vi.fn(),
  getBacklogCapabilities: vi.fn(),
  getReleaseNotesModel: vi.fn(),
  notFound: vi.fn(),
  requireSession: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));
vi.mock("@/lib/auth/session", () => ({ requireAppPageSession: mocks.requireSession }));
vi.mock("@/lib/auth/accessible-backlogs", () => ({
  getBacklogCapabilities: mocks.getBacklogCapabilities,
}));
vi.mock("@/lib/services/backlogs", () => ({ getBacklogByKeyForUser: mocks.getBacklogByKeyForUser }));
vi.mock("@/lib/services/release-notes", () => ({ getReleaseNotesModel: mocks.getReleaseNotesModel }));
vi.mock("@/components/releases/release-notes-editor", () => ({
  ReleaseNotesEditor: (props: unknown) => {
    mocks.editorProps(props);
    return <div>Éditeur</div>;
  },
}));

import ReleaseNotesPage from "@/app/(app)/b/[key]/releases/[releaseId]/notes/page";

const backlogId = "11111111-1111-4111-8111-111111111111";
const releaseId = "22222222-2222-4222-8222-222222222222";
const backlog = { id: backlogId, key: "CASS", name: "Cassini", archivedAt: null };
const model = {
  releaseName: "2026.10 « Automne »",
  description: "Livraison",
  effectiveReleaseDate: null,
  truncated: false,
  items: [
    { key: "CASS-1", title: "Recherche", kind: "feature", type: "tache", completed: true },
    { key: "CASS-2", title: "Export", kind: "feature", type: "tache", completed: false },
  ],
};

function page(searchParams: Record<string, string> = {}, key = "CASS", id = releaseId) {
  return ReleaseNotesPage({
    params: Promise.resolve({ key, releaseId: id }),
    searchParams: Promise.resolve(searchParams),
  });
}

describe("release notes route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.notFound.mockImplementation(() => {
      throw new Error("not-found");
    });
    mocks.requireSession.mockResolvedValue({ user: { id: "reader-1", name: "Lecteur" } });
    mocks.getBacklogByKeyForUser.mockResolvedValue(backlog);
    mocks.getBacklogCapabilities.mockResolvedValue({ manageReleases: false, editItems: false });
    mocks.getReleaseNotesModel.mockResolvedValue(model);
  });

  it("lets a backlog reader see notes generated from the current items", async () => {
    render(await page());
    expect(mocks.getReleaseNotesModel).toHaveBeenCalledWith({ backlogId, releaseId });
    expect(screen.getByRole("heading", { name: "Notes de release — 2026.10 « Automne »" })).toBeVisible();
    expect(screen.getByText(/générées à partir des éléments actuels/i)).toBeVisible();
    expect(screen.getByRole("link", { name: "← Retour à la version" })).toHaveAttribute(
      "href",
      `/b/CASS/releases/${releaseId}`,
    );
    const props = mocks.editorProps.mock.calls[0]?.[0];
    expect(props).toMatchObject({
      options: { includeIncomplete: false, includeDescription: true },
      fileBaseName: "notes-de-release-2026-10-automne",
      title: "Notes de release — 2026.10 « Automne »",
    });
    expect(props.initialMarkdown).toContain("- CASS-1 — Recherche");
    expect(props.initialMarkdown).not.toContain("CASS-2");
    expect(props.initialMarkdown).toContain("Livraison");
  });

  it("round-trips options from the URL", async () => {
    render(await page({ incomplete: "1", description: "0" }));
    const props = mocks.editorProps.mock.calls[0]?.[0];
    expect(props.options).toEqual({ includeIncomplete: true, includeDescription: false });
    expect(props.initialMarkdown).toContain("## Non terminés");
    expect(props.initialMarkdown).not.toContain("Livraison");
  });

  it("passes only the generated notes to the client", async () => {
    render(await page());
    const props = mocks.editorProps.mock.calls[0]?.[0];
    expect(Object.keys(props).sort()).toEqual(["fileBaseName", "initialMarkdown", "options", "title"]);
  });

  it.each([
    { label: "missing backlog", setup: () => mocks.getBacklogByKeyForUser.mockResolvedValueOnce(null) },
    {
      label: "archived backlog",
      setup: () => mocks.getBacklogByKeyForUser.mockResolvedValueOnce({ ...backlog, archivedAt: new Date() }),
    },
    { label: "inaccessible backlog", setup: () => mocks.getBacklogCapabilities.mockResolvedValueOnce(null) },
    { label: "missing release", setup: () => mocks.getReleaseNotesModel.mockResolvedValueOnce(null) },
  ])("turns a $label into notFound", async ({ setup }) => {
    setup();
    await expect(page()).rejects.toThrow("not-found");
    expect(mocks.editorProps).not.toHaveBeenCalled();
  });

  it("rejects a malformed release ID before any read", async () => {
    await expect(page({}, "CASS", "not-a-uuid")).rejects.toThrow("not-found");
    expect(mocks.getBacklogByKeyForUser).not.toHaveBeenCalled();
  });
});
