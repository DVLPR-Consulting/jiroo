import { afterEach, describe, expect, it, vi } from "vitest";
import { installTextZoom } from "../e2e/support/text-zoom";

afterEach(() => vi.unstubAllGlobals());

describe("text zoom initialization", () => {
  it("sets 200 percent text size on an existing document root", () => {
    const target = document.implementation.createHTMLDocument("synthetic");
    vi.stubGlobal("document", target);
    installTextZoom();
    expect(target.documentElement.style.fontSize).toBe("200%");
  });

  it("handles the early init-script phase before the root exists", async () => {
    const target = document.implementation.createHTMLDocument("synthetic");
    const root = target.documentElement;
    target.removeChild(root);
    vi.stubGlobal("document", target);
    installTextZoom();
    target.appendChild(root);
    await Promise.resolve();
    expect(root.style.fontSize).toBe("200%");
  });
});
