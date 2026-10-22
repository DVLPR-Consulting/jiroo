import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BacklogSettingsNav } from "./backlog-settings-nav";
describe("backlog settings tabs", () => {
  it("marks the templates tab current for administrators", () => {
    render(<BacklogSettingsNav backlogKey="DEMO" current="templates" canAdministerBacklog />);
    expect(screen.getByRole("link", { name: "Modèles" })).toHaveAttribute("href", "/b/DEMO/settings/templates");
    expect(screen.getByRole("link", { name: "Modèles" })).toHaveAttribute("aria-current", "page");
  });
  it("does not show settings tabs to members", () => {
    render(<BacklogSettingsNav backlogKey="DEMO" current="access" canAdministerBacklog={false} />);
    expect(screen.queryByRole("link", { name: "Modèles" })).not.toBeInTheDocument();
  });
});
