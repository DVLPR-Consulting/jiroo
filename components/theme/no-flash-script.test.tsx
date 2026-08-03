import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it } from "vitest";
import { NoFlashScript } from "@/components/theme/no-flash-script";

describe("NoFlashScript", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("jiroo-theme", "light");
    delete document.documentElement.dataset.sidebar;
  });

  it.each([
    ["true", "collapsed"],
    ["false", "open"],
  ])("applies sidebar preference %s before hydration", (stored, expected) => {
    localStorage.setItem("jiroo-sidebar-collapsed", stored);
    const host = document.createElement("div");
    host.innerHTML = renderToStaticMarkup(<NoFlashScript />);
    const code = host.querySelector("script")?.textContent;
    if (!code) throw new Error("Le script anti-flash doit être rendu.");

    // The observable contract is the DOM effect of the real inline script.
    window.eval(code);

    expect(document.documentElement.dataset.sidebar).toBe(expected);
  });
});
