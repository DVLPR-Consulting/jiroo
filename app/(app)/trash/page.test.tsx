import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  checkPermission: vi.fn(),
  listTrashedItems: vi.fn(),
  requireAppPageSession: vi.fn(),
}));

vi.mock("@/components/shell/shell-breadcrumb", () => ({
  ShellBreadcrumb: () => <nav aria-label="Fil d’Ariane" />,
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", () => ({
  requireAppPageSession: mocks.requireAppPageSession,
}));
vi.mock("@/lib/auth/authorization", () => ({
  checkPermission: mocks.checkPermission,
}));
vi.mock("@/lib/services/items", () => ({
  listTrashedItems: mocks.listTrashedItems,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock("@/app/actions/trash", () => ({
  purgeItemAction: vi.fn(),
  restoreTrashedItemAction: vi.fn(),
}));

import TrashPage from "@/app/(app)/trash/page";

describe("TrashPage read authorization", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAppPageSession.mockResolvedValue({
      user: { id: "member-1", role: "contributor" },
    });
    mocks.listTrashedItems.mockResolvedValue([]);
    mocks.checkPermission.mockResolvedValue({ allowed: false });
  });

  it("lets an authenticated member read only browse-filtered trash", async () => {
    await expect(TrashPage()).resolves.toBeTruthy();

    expect(mocks.listTrashedItems).toHaveBeenCalledWith("member-1");
  });

  it("keeps mixed backlog data visible and exposes restore controls only where allowed", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-06T12:00:00.000Z"));
    mocks.listTrashedItems.mockResolvedValue([
      {
        id: "item-readable",
        key: "READ-1",
        type: "tache",
        title: "Visible sans restauration",
        backlogId: "backlog-readable",
        backlogKey: "READ",
        backlogName: "Lecture",
        backlogColor: "#475569",
        statusId: "todo",
        statusName: "À faire",
        statusColor: "#9aa0a6",
        deletedAt: new Date("2026-08-01T00:00:00.000Z"),
      },
      {
        id: "item-restorable",
        key: "REST-1",
        type: "tache",
        title: "Visible avec restauration",
        backlogId: "backlog-restorable",
        backlogKey: "REST",
        backlogName: "Restauration",
        backlogColor: "#2563eb",
        statusId: "todo",
        statusName: "À faire",
        statusColor: "#9aa0a6",
        deletedAt: new Date("2026-08-02T00:00:00.000Z"),
      },
      {
        id: "item-readable-2",
        key: "READ-2",
        type: "tache",
        title: "Deuxième donnée visible",
        backlogId: "backlog-readable",
        backlogKey: "READ",
        backlogName: "Lecture",
        backlogColor: "#475569",
        statusId: "todo",
        statusName: "À faire",
        statusColor: "#9aa0a6",
        deletedAt: new Date("2026-08-03T00:00:00.000Z"),
      },
    ]);
    mocks.checkPermission.mockImplementation(async ({ scope }) => ({
      allowed: scope.type === "backlog" && scope.backlogId === "backlog-restorable",
    }));

    render(await TrashPage());

    const [readerRow, secondReaderRow, restorerRow] = screen.getAllByRole("listitem");
    expect(within(readerRow!).getByText("Visible sans restauration")).toBeVisible();
    expect(within(readerRow!).queryByRole("button", { name: "Restaurer" }))
      .not.toBeInTheDocument();
    expect(within(readerRow!).queryByRole("button", { name: "Supprimer définitivement" }))
      .not.toBeInTheDocument();
    expect(within(secondReaderRow!).getByText("Deuxième donnée visible")).toBeVisible();
    expect(within(secondReaderRow!).queryByRole("button")).not.toBeInTheDocument();
    expect(within(restorerRow!).getByText("Visible avec restauration")).toBeVisible();
    expect(within(restorerRow!).getByRole("button", { name: "Restaurer" })).toBeVisible();
    expect(within(restorerRow!).getByRole("button", { name: "Supprimer définitivement" }))
      .toBeVisible();
    expect(mocks.checkPermission).toHaveBeenCalledTimes(2);
    expect(mocks.checkPermission).toHaveBeenCalledWith({
      actorId: "member-1",
      permission: "restore_items",
      scope: { type: "backlog", backlogId: "backlog-readable" },
    });
    expect(mocks.checkPermission).toHaveBeenCalledWith({
      actorId: "member-1",
      permission: "restore_items",
      scope: { type: "backlog", backlogId: "backlog-restorable" },
    });
  });
});
