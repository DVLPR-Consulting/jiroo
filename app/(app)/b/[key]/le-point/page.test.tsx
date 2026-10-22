import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  load: vi.fn(),
  detail: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("not-found");
  }),
  drawerProps: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: "2026-10-20.2026-10-21" }) }) }));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));
vi.mock("@/lib/auth/session", () => ({ requireAppPageSession: async () => ({ user: { id: "reader" } }) }));
vi.mock("@/lib/le-point/load", () => ({ loadLePoint: mocks.load }));
vi.mock("@/lib/services/item-detail", () => ({ loadItemDetailData: mocks.detail }));
vi.mock("@/components/le-point/le-point-view", () => ({ LePointView: () => <p>vue</p> }));
vi.mock("@/components/items/item-detail-sheet", () => ({
  ItemDetailDrawer: (props: unknown) => {
    mocks.drawerProps(props);
    return null;
  },
}));

import BacklogLePointPage from "./page";

const page = (key: string, item?: string) =>
  BacklogLePointPage({ params: Promise.resolve({ key }), searchParams: Promise.resolve(item ? { item } : {}) });

describe("BacklogLePointPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.load.mockImplementation(async ({ backlogKey }: { backlogKey: string }) =>
      backlogKey === "PORT" ? { backlog: { key: "PORT", name: "Portail" } } : null);
  });

  it("reads the project of the address with the reader's rights and last visit", async () => {
    render(await page("PORT"));
    expect(screen.getByText("vue")).toBeVisible();
    expect(mocks.load).toHaveBeenCalledWith(expect.objectContaining({ userId: "reader", backlogKey: "PORT", lastVisit: "2026-10-21" }));
    expect(mocks.drawerProps).toHaveBeenCalledWith(expect.objectContaining({ backlogKey: "PORT", itemKey: null }));
  });

  it("opens a ticket in place", async () => {
    render(await page("PORT", "PORT-12"));
    expect(mocks.detail).toHaveBeenCalledWith({ userId: "reader", backlogKey: "PORT", itemKey: "PORT-12" });
  });

  it("is not found for a backlog the reader cannot open", async () => {
    await expect(page("SECRET")).rejects.toThrow("not-found");
  });
});
