import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const classes = vi.hoisted(() => ({
  ResourceNotFoundError: class ResourceNotFoundError extends Error {
    constructor(readonly resourceType: string, readonly resourceId: string) {
      super("resource not found");
    }
  },
}));

const mocks = vi.hoisted(() => ({
  adminProps: vi.fn(),
  checkPermission: vi.fn(),
  getBacklogSummary: vi.fn(),
  listRepoConnections: vi.fn(),
  notFound: vi.fn(),
  redirect: vi.fn(),
  requireBacklogReadPermissionByKey: vi.fn(),
  requireSession: vi.fn(),
}));
vi.mock("@/components/shell/shell-breadcrumb", () => ({ ShellBreadcrumb: () => <nav aria-label="Fil d’Ariane" /> }));
vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound, redirect: mocks.redirect }));
vi.mock("@/lib/auth/session", () => ({ requireAppPageSession: mocks.requireSession }));
vi.mock("@/lib/auth/action-authorization", () => ({ requireBacklogReadPermissionByKey: mocks.requireBacklogReadPermissionByKey }));
vi.mock("@/lib/auth/authorization", () => ({
  checkPermission: mocks.checkPermission,
  ResourceNotFoundError: classes.ResourceNotFoundError,
}));
vi.mock("@/lib/services/backlogs", () => ({ getBacklogSummary: mocks.getBacklogSummary }));
vi.mock("@/lib/services/repo-connections", () => ({ listRepoConnections: mocks.listRepoConnections }));
vi.mock("@/components/admin/repo-connections-admin", () => ({
  RepoConnectionsAdmin: (props: unknown) => {
    mocks.adminProps(props);
    return null;
  },
}));

import DevelopmentSettingsPage from "@/app/(app)/b/[key]/settings/development/page";

describe("backlog Développement settings route (JIR-95)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSession.mockResolvedValue({ user: { id: "u1" } });
    mocks.requireBacklogReadPermissionByKey.mockResolvedValue({ backlogId: "b1", backlogKey: "DEMO", resourceId: "b1" });
    mocks.getBacklogSummary.mockResolvedValue({ id: "b1", key: "DEMO", name: "Démo" });
    mocks.listRepoConnections.mockResolvedValue([{
      id: "c1", backlogId: "b1", provider: "github", instanceUrl: "https://github.com", repositoryPath: "acme/api",
      enabled: true, lastEventAt: null, lastError: null, lastErrorAt: null, createdAt: new Date(),
    }]);
    mocks.redirect.mockImplementation((path: string) => { throw new Error(`redirect:${path}`); });
    mocks.notFound.mockImplementation(() => { throw new Error("not-found"); });
  });

  it("requires administer_backlog before reading any connection", async () => {
    mocks.checkPermission.mockImplementation(async ({ permission }: { permission: string }) => ({ allowed: permission !== "administer_backlog" }));
    await expect(DevelopmentSettingsPage({ params: Promise.resolve({ key: "demo" }) })).rejects.toThrow("redirect:/b/DEMO");
    expect(mocks.requireBacklogReadPermissionByKey).toHaveBeenCalledWith({ actorId: "u1", backlogKey: "demo", permission: "browse_backlog" });
    expect(mocks.listRepoConnections).not.toHaveBeenCalled();
  });

  it("hides a backlog the user cannot browse", async () => {
    mocks.requireBacklogReadPermissionByKey.mockRejectedValue(new classes.ResourceNotFoundError("backlog", "DEMO"));
    await expect(DevelopmentSettingsPage({ params: Promise.resolve({ key: "demo" }) })).rejects.toThrow("not-found");
  });

  it("lists the connections for an administrator, with the settings tabs", async () => {
    mocks.checkPermission.mockResolvedValue({ allowed: true });
    render(await DevelopmentSettingsPage({ params: Promise.resolve({ key: "DEMO" }) }));
    expect(screen.getByRole("heading", { level: 1, name: "Développement — Démo" })).toBeInTheDocument();
    const tabs = screen.getByRole("navigation", { name: "Réglages du backlog" });
    expect(tabs).toHaveTextContent("Accès");
    expect(screen.getByRole("link", { name: "Développement" })).toHaveAttribute("aria-current", "page");
    expect(mocks.listRepoConnections).toHaveBeenCalledWith("b1");
    expect(mocks.adminProps).toHaveBeenCalledWith({
      backlogId: "b1",
      backlogKey: "DEMO",
      connections: [{
        id: "c1", provider: "github", instanceUrl: "https://github.com", repositoryPath: "acme/api",
        enabled: true, lastEventAt: null, lastError: null, lastErrorAt: null,
      }],
    });
  });
});
