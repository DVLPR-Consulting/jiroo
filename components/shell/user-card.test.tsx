import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { UserCard } from "@/components/shell/user-card";
import { DensityProvider } from "@/components/theme/density-provider";
import { ThemeProvider } from "@/components/theme/theme-provider";

const mocks = vi.hoisted(() => ({ push: vi.fn(), signOut: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
}));
vi.mock("@/lib/auth/client", () => ({ signOut: mocks.signOut }));

const user = {
  name: "Ada Lovelace",
  email: "ada@example.com",
  role: "admin",
};

function renderUserCard() {
  return render(
    <ThemeProvider>
      <DensityProvider>
        <UserCard user={user} />
      </DensityProvider>
    </ThemeProvider>,
  );
}

describe("UserCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    document.documentElement.classList.remove("dark");
    document.documentElement.dataset.density = "comfy";
  });

  it("opens read-only profile details from its menu", async () => {
    const interaction = userEvent.setup();
    renderUserCard();

    await interaction.click(screen.getByRole("button", { name: "Profil de Ada Lovelace" }));
    expect(screen.getByRole("menuitem", { name: "Profil" })).toBeVisible();
    expect(screen.getByRole("menuitem", { name: "Préférences" })).toBeVisible();
    expect(screen.getByRole("menuitem", { name: "Déconnexion" })).toBeVisible();

    await interaction.click(screen.getByRole("menuitem", { name: "Profil" }));
    const dialog = await screen.findByRole("dialog", { name: "Profil" });
    expect(within(dialog).getByText("Ada Lovelace")).toBeVisible();
    expect(within(dialog).getByText("ada@example.com")).toBeVisible();
    expect(within(dialog).getByText("Administrateur")).toBeVisible();
  });

  it("opens the persisted theme and density preferences", async () => {
    const interaction = userEvent.setup();
    renderUserCard();

    await interaction.click(screen.getByRole("button", { name: "Profil de Ada Lovelace" }));
    await interaction.click(screen.getByRole("menuitem", { name: "Préférences" }));

    const dialog = await screen.findByRole("dialog", { name: "Préférences" });
    const themeGroup = within(dialog).getByRole("group", { name: "Thème" });
    expect(
      within(themeGroup).getByRole("button", { name: "Activer le thème sombre" }),
    ).toBeVisible();

    const densityGroup = within(dialog).getByRole("group", { name: "Densité" });
    expect(within(densityGroup).getByRole("radio", { name: "Confort" })).toBeChecked();
    expect(within(densityGroup).getByRole("radio", { name: "Compact" })).not.toBeChecked();

    await interaction.click(within(densityGroup).getByRole("radio", { name: "Compact" }));
    expect(within(densityGroup).getByRole("radio", { name: "Compact" })).toBeChecked();
    expect(localStorage.getItem("jiroo-density")).toBe("compact");
  });

  it("keeps sign-out and login redirection intact", async () => {
    const interaction = userEvent.setup();
    mocks.signOut.mockResolvedValue(undefined);
    renderUserCard();

    await interaction.click(screen.getByRole("button", { name: "Profil de Ada Lovelace" }));
    await interaction.click(screen.getByRole("menuitem", { name: "Déconnexion" }));

    await waitFor(() => expect(mocks.signOut).toHaveBeenCalledOnce());
    expect(mocks.push).toHaveBeenCalledWith("/login");
  });
});
