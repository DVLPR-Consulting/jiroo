import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CollapsiblePanel } from "@/components/items/detail/collapsible-panel";

afterEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe("CollapsiblePanel", () => {
  it("toggles its content with aria-expanded and remembers it on the device", async () => {
    const user = userEvent.setup();
    const { unmount } = render(
      <CollapsiblePanel id="details" title="Détails">
        <p>Contenu</p>
      </CollapsiblePanel>,
    );
    const toggle = screen.getByRole("button", { name: "Détails" });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Contenu")).toBeVisible();

    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("Contenu")).not.toBeVisible();
    unmount();

    render(
      <CollapsiblePanel id="details" title="Détails">
        <p>Contenu</p>
      </CollapsiblePanel>,
    );
    expect(screen.getByRole("button", { name: "Détails" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  it("stays usable when storage is unavailable", async () => {
    const user = userEvent.setup();
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    render(
      <CollapsiblePanel id="dev" title="Développement">
        <p>Liens</p>
      </CollapsiblePanel>,
    );
    const toggle = screen.getByRole("button", { name: "Développement" });
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });
});
