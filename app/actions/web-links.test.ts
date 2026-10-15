import { beforeEach, describe, expect, it, vi } from "vitest";
import { permissionDeniedError } from "@/test-utils/action-authorization-errors";

const mocks = vi.hoisted(() => ({
  addWebLink: vi.fn(),
  getSession: vi.fn(),
  removeWebLink: vi.fn(),
  requireItemPermission: vi.fn(),
  requireWebLinkPermission: vi.fn(),
  revalidatePath: vi.fn(),
  invalidateBacklog: vi.fn(),
  notifyUsers: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/realtime/publish", () => ({ invalidateBacklog: mocks.invalidateBacklog, notifyUsers: mocks.notifyUsers }));
vi.mock("@/lib/auth/action-authorization", () => ({
  requireItemPermission: mocks.requireItemPermission,
  requireWebLinkPermission: mocks.requireWebLinkPermission,
}));
vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/services/web-links", () => ({
  addWebLink: mocks.addWebLink,
  removeWebLink: mocks.removeWebLink,
}));

import { addWebLinkAction, removeWebLinkAction } from "@/app/actions/web-links";

describe("web link action permissions (JIR-99)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ user: { id: "writer-1", role: "contributor" } });
    mocks.requireItemPermission.mockResolvedValue({ backlogId: "backlog-1", resourceId: "item-1" });
    mocks.requireWebLinkPermission.mockResolvedValue({ backlogId: "backlog-1", resourceId: "link-1" });
    mocks.addWebLink.mockResolvedValue({ id: "link-1" });
  });

  it("requires link_items on the stored item before adding a web link", async () => {
    await expect(
      addWebLinkAction({ backlogKey: "CASS", itemId: "item-1", url: "https://figma.com/x", title: "Maquettes" }),
    ).resolves.toEqual({ ok: true, webLink: { id: "link-1" } });
    expect(mocks.requireItemPermission).toHaveBeenCalledWith({
      actorId: "writer-1",
      itemId: "item-1",
      permission: "link_items",
    });
    expect(mocks.addWebLink).toHaveBeenCalledWith(
      { itemId: "item-1", url: "https://figma.com/x", title: "Maquettes" },
      "writer-1",
    );
    expect(mocks.invalidateBacklog).toHaveBeenCalledWith("CASS", { kind: "item", backlogId: "backlog-1", itemIds: ["item-1"], actorId: "writer-1" });
  });

  it("returns a structured permission denial without writing", async () => {
    mocks.requireItemPermission.mockRejectedValueOnce(
      permissionDeniedError("link_items", { type: "backlog", backlogId: "backlog-1" }),
    );
    await expect(
      addWebLinkAction({ backlogKey: "CASS", itemId: "item-1", url: "https://figma.com/x" }),
    ).resolves.toEqual({
      ok: false,
      error: "Vous n’avez pas la permission « Lier les éléments » pour ce backlog.",
    });
    expect(mocks.addWebLink).not.toHaveBeenCalled();
  });

  it("maps a validation error to French", async () => {
    mocks.addWebLink.mockRejectedValueOnce(new Error("URL invalide (http ou https)."));
    await expect(
      addWebLinkAction({ backlogKey: "CASS", itemId: "item-1", url: "javascript:alert(1)" }),
    ).resolves.toEqual({ ok: false, error: "URL invalide (http ou https)." });
  });

  it("requires link_items from the stored web link before removing it", async () => {
    await expect(removeWebLinkAction({ backlogKey: "CASS", id: "link-1" })).resolves.toEqual({ ok: true });
    expect(mocks.requireWebLinkPermission).toHaveBeenCalledWith({
      actorId: "writer-1",
      webLinkId: "link-1",
      permission: "link_items",
    });
    expect(mocks.removeWebLink).toHaveBeenCalledWith("link-1");
  });
});
