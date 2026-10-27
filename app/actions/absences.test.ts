import { beforeEach, describe, expect, it, vi } from "vitest";
import { permissionDeniedError } from "@/test-utils/action-authorization-errors";

const mocks = vi.hoisted(() => ({
  declareAbsence: vi.fn(),
  getAbsenceOwner: vi.fn(),
  getSession: vi.fn(),
  invalidateBacklog: vi.fn(),
  listAssignableUsersForBacklog: vi.fn(),
  removeAbsence: vi.fn(),
  requireBacklogPermissionById: vi.fn(),
}));

vi.mock("@/lib/realtime/publish", () => ({ invalidateBacklog: mocks.invalidateBacklog }));
vi.mock("@/lib/auth/action-authorization", () => ({ requireBacklogPermissionById: mocks.requireBacklogPermissionById }));
vi.mock("@/lib/auth/authorization", () => ({ listAssignableUsersForBacklog: mocks.listAssignableUsersForBacklog }));
vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/services/absences", () => ({
  ABSENCE_NOT_FOUND_MESSAGE: "Absence introuvable.",
  ABSENCE_OVERLAP_MESSAGE: "Cette période chevauche une absence déjà déclarée.",
  declareAbsence: mocks.declareAbsence,
  getAbsenceOwner: mocks.getAbsenceOwner,
  removeAbsence: mocks.removeAbsence,
}));

import { declareAbsenceAction, removeAbsenceAction } from "./absences";

const backlogId = "11111111-1111-4111-8111-111111111111";
const otherBacklogId = "22222222-2222-4222-8222-222222222222";
const absenceId = "33333333-3333-4333-8333-333333333333";
const unknownId = "44444444-4444-4444-8444-444444444444";
const NOT_FOUND = "La ressource demandée est introuvable.";
const period = { startDate: "2026-11-03", endDate: "2026-11-06" };

/** The actor holds these permissions on the backlog, no other. */
function grant(permissions: string[]) {
  mocks.requireBacklogPermissionById.mockImplementation(async ({ permission, backlogId: id }: { permission: string; backlogId: string }) => {
    if (id === backlogId && permissions.includes(permission)) return { backlogKey: "DEMO", backlogId: id };
    throw permissionDeniedError(permission, { type: "backlog", backlogId: id });
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSession.mockResolvedValue({ user: { id: "camille" } });
  mocks.listAssignableUsersForBacklog.mockResolvedValue([{ id: "camille" }, { id: "hugo" }]);
  mocks.declareAbsence.mockImplementation(async (data: Record<string, unknown>) => ({ id: absenceId, ...data }));
  mocks.removeAbsence.mockResolvedValue(undefined);
});

describe("declareAbsenceAction", () => {
  it("lets anyone who browses the backlog declare their own absence, then refreshes the backlog", async () => {
    grant(["browse_backlog"]);
    const result = await declareAbsenceAction({ userId: "camille", backlogId, ...period });
    expect(result).toMatchObject({ ok: true, absence: { id: absenceId, userId: "camille" } });
    expect(mocks.declareAbsence).toHaveBeenCalledWith({ userId: "camille", backlogId, ...period, startHalf: "am", endHalf: "pm" }, "camille");
    expect(mocks.invalidateBacklog).toHaveBeenCalledWith("DEMO", { kind: "backlog", backlogId, itemIds: [], actorId: "camille" });
  });

  it("refuses one's own absence from a backlog one may not browse", async () => {
    grant([]);
    const result = await declareAbsenceAction({ userId: "camille", backlogId, ...period });
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining("Vous n’avez pas la permission") });
    expect(mocks.declareAbsence).not.toHaveBeenCalled();
  });

  it("lets a backlog administrator declare a member's absence, with either administration right", async () => {
    grant(["administer_backlog"]);
    expect(await declareAbsenceAction({ userId: "hugo", backlogId, ...period })).toMatchObject({ ok: true });
    grant(["manage_members"]);
    expect(await declareAbsenceAction({ userId: "hugo", backlogId, ...period })).toMatchObject({ ok: true });
    expect(mocks.declareAbsence).toHaveBeenCalledTimes(2);
  });

  it("refuses a member's absence to someone who only browses the backlog", async () => {
    grant(["browse_backlog"]);
    const result = await declareAbsenceAction({ userId: "hugo", backlogId, ...period });
    expect(result).toEqual({ ok: false, error: "Vous n’avez pas la permission « Gérer les membres » pour ce backlog." });
    expect(mocks.declareAbsence).not.toHaveBeenCalled();
  });

  it("refuses an absence for someone outside the backlog, even to its administrator", async () => {
    grant(["administer_backlog"]);
    const result = await declareAbsenceAction({ userId: "stranger", backlogId, ...period });
    expect(result).toEqual({ ok: false, error: "Cette personne n’est pas membre du backlog." });
    expect(mocks.declareAbsence).not.toHaveBeenCalled();
  });

  it("passes the service's overlap and the input's own errors on, and nothing else", async () => {
    grant(["browse_backlog"]);
    mocks.declareAbsence.mockRejectedValueOnce(new Error("Cette période chevauche une absence déjà déclarée."));
    expect(await declareAbsenceAction({ userId: "camille", backlogId, ...period })).toEqual({ ok: false, error: "Cette période chevauche une absence déjà déclarée." });
    expect(await declareAbsenceAction({ userId: "camille", backlogId, startDate: "2026-11-06", endDate: "2026-11-03" })).toEqual({ ok: false, error: "La fin de l’absence précède son début." });
    mocks.declareAbsence.mockRejectedValueOnce(new Error("relation \"absences\" does not exist"));
    expect(await declareAbsenceAction({ userId: "camille", backlogId, ...period })).toEqual({ ok: false, error: "Action impossible. Réessayez." });
    expect(mocks.invalidateBacklog).not.toHaveBeenCalled();
  });

  it("asks for a session first", async () => {
    mocks.getSession.mockResolvedValue(null);
    expect(await declareAbsenceAction({ userId: "camille", backlogId, ...period })).toEqual({ ok: false, error: "Votre session a expiré. Reconnectez-vous." });
    expect(mocks.requireBacklogPermissionById).not.toHaveBeenCalled();
  });
});

describe("removeAbsenceAction", () => {
  it("removes one's own absence, and a member's for the backlog's administrator", async () => {
    grant(["browse_backlog"]);
    mocks.getAbsenceOwner.mockResolvedValue("camille");
    expect(await removeAbsenceAction({ id: absenceId, backlogId })).toEqual({ ok: true });
    expect(mocks.removeAbsence).toHaveBeenCalledWith({ id: absenceId, backlogId }, "camille");
    expect(mocks.invalidateBacklog).toHaveBeenCalledWith("DEMO", { kind: "backlog", backlogId, itemIds: [], actorId: "camille" });
    grant(["browse_backlog", "manage_members"]);
    mocks.getAbsenceOwner.mockResolvedValue("hugo");
    expect(await removeAbsenceAction({ id: absenceId, backlogId })).toEqual({ ok: true });
  });

  it("checks the backlog's right before reading any absence", async () => {
    grant([]);
    const result = await removeAbsenceAction({ id: absenceId, backlogId });
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining("Vous n’avez pas la permission") });
    expect(mocks.getAbsenceOwner).not.toHaveBeenCalled();
    expect(mocks.removeAbsence).not.toHaveBeenCalled();
  });

  it("answers the same for an unknown absence and for one the reader may not touch", async () => {
    grant(["browse_backlog"]);
    mocks.getAbsenceOwner.mockResolvedValue(null);
    expect(await removeAbsenceAction({ id: unknownId, backlogId })).toEqual({ ok: false, error: NOT_FOUND });
    // Hugo's absence, to someone who only browses the backlog.
    mocks.getAbsenceOwner.mockResolvedValue("hugo");
    expect(await removeAbsenceAction({ id: absenceId, backlogId })).toEqual({ ok: false, error: NOT_FOUND });
    // Someone's absence from a backlog the administrator does not administer.
    grant(["browse_backlog", "administer_backlog"]);
    mocks.getAbsenceOwner.mockResolvedValue("stranger");
    expect(await removeAbsenceAction({ id: absenceId, backlogId })).toEqual({ ok: false, error: NOT_FOUND });
    expect(await removeAbsenceAction({ id: absenceId, backlogId: otherBacklogId })).toMatchObject({ ok: false });
    expect(await removeAbsenceAction({ id: "not-an-id", backlogId })).toEqual({ ok: false, error: NOT_FOUND });
    expect(mocks.removeAbsence).not.toHaveBeenCalled();
    expect(mocks.invalidateBacklog).not.toHaveBeenCalled();
  });
});
