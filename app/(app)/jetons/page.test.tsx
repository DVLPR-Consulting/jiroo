import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listApiTokens: vi.fn(),
  requireAppPageSession: vi.fn(),
}));

vi.mock("@/components/shell/shell-breadcrumb", () => ({
  ShellBreadcrumb: () => <nav aria-label="Fil d’Ariane" />,
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", () => ({ requireAppPageSession: mocks.requireAppPageSession }));
vi.mock("@/lib/services/api-tokens", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/services/api-tokens")>()),
  listApiTokens: mocks.listApiTokens,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("@/app/actions/api-tokens", () => ({
  createApiTokenAction: vi.fn(),
  revokeApiTokenAction: vi.fn(),
}));

import ApiTokensPage from "@/app/(app)/jetons/page";

describe("ApiTokensPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAppPageSession.mockResolvedValue({ user: { id: "member-1", role: "contributor" } });
    mocks.listApiTokens.mockResolvedValue([
      {
        id: "token-1",
        userId: "member-1",
        name: "Herdr",
        tokenPrefix: "Ab3dEf9h",
        scope: "read",
        expiresAt: new Date("2027-02-10T21:00:00.000Z"),
        lastUsedAt: null,
        revokedAt: null,
        createdAt: new Date("2026-11-12T21:00:00.000Z"),
      },
    ]);
  });

  it("requires the app session and lists only the viewer's tokens", async () => {
    render(await ApiTokensPage());

    expect(mocks.requireAppPageSession).toHaveBeenCalledOnce();
    expect(mocks.listApiTokens).toHaveBeenCalledWith("member-1");
    expect(screen.getByRole("heading", { level: 1, name: "Jetons d’accès" })).toBeVisible();
    expect(screen.getByText("Herdr")).toBeVisible();
    expect(screen.getByText("jiroo_pat_Ab3dEf9h…")).toBeVisible();
  });
});
