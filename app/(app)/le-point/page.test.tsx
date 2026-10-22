import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  backlogs: vi.fn(),
  load: vi.fn(),
  viewProps: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock("@/lib/auth/session", () => ({ requireAppPageSession: async () => ({ user: { id: "reader" } }) }));
vi.mock("@/lib/services/backlogs", () => ({ listBacklogsWithStarsForUser: mocks.backlogs }));
vi.mock("@/lib/le-point/load", () => ({ loadLePoint: mocks.load }));
vi.mock("@/components/le-point/le-point-view", () => ({
  LePointView: (props: unknown) => {
    mocks.viewProps(props);
    return <p>vue</p>;
  },
}));

import LePointPage from "./page";

const open = [
  { key: "OPEN", name: "Ouvert", starred: true },
  { key: "OTHER", name: "Autre", starred: false },
];

async function page(b?: string) {
  render(await LePointPage({ searchParams: Promise.resolve(b ? { b } : {}) }));
}

describe("LePointPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.backlogs.mockResolvedValue(open);
    mocks.load.mockImplementation(async ({ backlogKey }: { backlogKey: string }) => ({ backlog: { key: backlogKey } }));
  });

  it("opens the starred backlog first, or the one asked", async () => {
    await page();
    expect(mocks.load).toHaveBeenCalledWith(expect.objectContaining({ userId: "reader", backlogKey: "OPEN" }));
    await page("other");
    expect(mocks.load).toHaveBeenLastCalledWith(expect.objectContaining({ backlogKey: "OTHER" }));
  });

  it("refuses a backlog asked by address that the reader cannot open, without showing another", async () => {
    await page("SECRET");
    expect(mocks.load).not.toHaveBeenCalled();
    expect(mocks.viewProps).not.toHaveBeenCalled();
    expect(screen.getByText(/Le backlog SECRET n’existe pas, est archivé ou ne t’est pas accessible/)).toBeVisible();
  });

  it("says so when the reader has no backlog", async () => {
    mocks.backlogs.mockResolvedValue([]);
    await page();
    expect(screen.getByText("Tu n’as accès à aucun backlog pour le moment.")).toBeVisible();
  });
});
