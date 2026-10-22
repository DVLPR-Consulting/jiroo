import { beforeEach, describe, expect, it, vi } from "vitest";
import { permissionDeniedError, resourceNotFoundError } from "@/test-utils/action-authorization-errors";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  requireBacklogPermissionById: vi.fn(),
  invalidateBacklog: vi.fn(),
  getItemTemplateBacklogId: vi.fn(),
  createItemTemplate: vi.fn(),
  updateItemTemplate: vi.fn(),
  deleteItemTemplate: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/auth/action-authorization", () => ({
  requireBacklogPermissionById: mocks.requireBacklogPermissionById,
}));
vi.mock("@/lib/realtime/publish", () => ({ invalidateBacklog: mocks.invalidateBacklog }));
vi.mock("@/lib/services/item-templates", () => ({
  DUPLICATE_TEMPLATE_MESSAGE: "Un modèle porte déjà ce nom dans ce backlog.",
  TEMPLATE_NOT_FOUND_MESSAGE: "Modèle introuvable.",
  TEMPLATE_LIMIT_MESSAGE: "Un backlog compte au plus 50 modèles.",
  FOREIGN_LABEL_MESSAGE: "Un label choisi n’appartient pas à ce backlog.",
  getItemTemplateBacklogId: mocks.getItemTemplateBacklogId,
  createItemTemplate: mocks.createItemTemplate,
  updateItemTemplate: mocks.updateItemTemplate,
  deleteItemTemplate: mocks.deleteItemTemplate,
}));

import {
  createItemTemplateAction,
  deleteItemTemplateAction,
  updateItemTemplateAction,
} from "@/app/actions/item-templates";

const BACKLOG_ID = "6f9619ff-8b86-4011-b42d-00c04fc964ff";
const TEMPLATE_ID = "0b6c2a5e-3f1d-4c8e-9a7b-1d2e3f4a5b6c";
const HIDDEN = { ok: false, error: "La ressource demandée est introuvable." };

describe("item template actions (JIR-43)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ user: { id: "admin" } });
    mocks.requireBacklogPermissionById.mockResolvedValue({ backlogKey: "DEMO" });
    mocks.getItemTemplateBacklogId.mockResolvedValue(BACKLOG_ID);
  });

  it("creates for a backlog administrator and publishes a backlog change", async () => {
    mocks.createItemTemplate.mockResolvedValue({ id: TEMPLATE_ID, name: "Incident" });
    const result = await createItemTemplateAction({ backlogId: BACKLOG_ID, name: "Incident" });
    expect(result).toEqual({ ok: true, template: { id: TEMPLATE_ID, name: "Incident" } });
    expect(mocks.requireBacklogPermissionById).toHaveBeenCalledWith({
      actorId: "admin", backlogId: BACKLOG_ID, permission: "administer_backlog",
    });
    expect(mocks.invalidateBacklog).toHaveBeenCalledWith("DEMO", {
      kind: "backlog", backlogId: BACKLOG_ID, itemIds: [], actorId: "admin",
    });
  });

  it("refuses a member who does not administer the backlog", async () => {
    mocks.requireBacklogPermissionById.mockRejectedValue(permissionDeniedError("administer_backlog", { type: "backlog", backlogId: BACKLOG_ID }));
    const result = await createItemTemplateAction({ backlogId: BACKLOG_ID, name: "Incident" });
    expect(result).toMatchObject({ ok: false });
    expect(mocks.createItemTemplate).not.toHaveBeenCalled();
    expect(mocks.invalidateBacklog).not.toHaveBeenCalled();
  });

  // A missing template and one in a hidden backlog must answer alike.
  it.each([
    ["update", () => updateItemTemplateAction({ id: TEMPLATE_ID, name: "X" })],
    ["delete", () => deleteItemTemplateAction({ id: TEMPLATE_ID })],
  ])("%s answers alike for a missing and a hidden template, changing nothing", async (_name, act) => {
    mocks.getItemTemplateBacklogId.mockResolvedValue(null);
    const missing = await act();
    mocks.getItemTemplateBacklogId.mockResolvedValue(BACKLOG_ID);
    mocks.requireBacklogPermissionById.mockRejectedValue(resourceNotFoundError("backlog", BACKLOG_ID));
    const hidden = await act();
    expect(missing).toEqual(HIDDEN);
    expect(hidden).toEqual(HIDDEN);
    expect(mocks.updateItemTemplate).not.toHaveBeenCalled();
    expect(mocks.deleteItemTemplate).not.toHaveBeenCalled();
    expect(mocks.invalidateBacklog).not.toHaveBeenCalled();
  });

  it("authorizes an update against the stored backlog, not the client's", async () => {
    mocks.updateItemTemplate.mockResolvedValue({ id: TEMPLATE_ID });
    await updateItemTemplateAction({ id: TEMPLATE_ID, name: "X", backlogId: "11111111-1111-4111-8111-111111111111" });
    expect(mocks.requireBacklogPermissionById).toHaveBeenCalledWith(
      expect.objectContaining({ backlogId: BACKLOG_ID }),
    );
  });

  it("requires a session", async () => {
    mocks.getSession.mockResolvedValue(null);
    expect(await deleteItemTemplateAction({ id: TEMPLATE_ID })).toMatchObject({ ok: false });
    expect(mocks.deleteItemTemplate).not.toHaveBeenCalled();
  });
});
