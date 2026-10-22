import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  backlogs: vi.fn(),
  redirect: vi.fn((href: string) => {
    throw new Error(`redirect:${href}`);
  }),
}));
vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/auth/session", () => ({ requireAppPageSession: async () => ({ user: { id: "reader" } }) }));
vi.mock("@/lib/services/backlogs", () => ({ listBacklogsWithStarsForUser: mocks.backlogs }));

import LePointPage from "./page";

const open = [
  { key: "OPEN", name: "Ouvert", starred: true },
  { key: "OTHER", name: "Autre", starred: false },
];

const page = (b?: string) => LePointPage({ searchParams: Promise.resolve(b ? { b } : {}) });

describe("LePointPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.backlogs.mockResolvedValue(open);
  });

  it("opens Le point in the starred backlog, or the one asked, as a view of that project", async () => {
    await expect(page()).rejects.toThrow("redirect:/b/OPEN/le-point");
    await expect(page("other")).rejects.toThrow("redirect:/b/OTHER/le-point");
  });

  it("refuses a backlog asked by address that the reader cannot open, without showing another", async () => {
    render(await page("SECRET"));
    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(screen.getByText(/Le backlog SECRET n’existe pas, est archivé ou ne t’est pas accessible/)).toBeVisible();
  });

  it("says so when the reader has no backlog", async () => {
    mocks.backlogs.mockResolvedValue([]);
    render(await page());
    expect(screen.getByText("Tu n’as accès à aucun backlog pour le moment.")).toBeVisible();
  });
});
