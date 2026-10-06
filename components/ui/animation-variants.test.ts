// @vitest-environment node
import { readFile } from "node:fs/promises";
import path from "node:path";
import { compile } from "tailwindcss";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "../..");
// tw-animate-css only exports a "style" condition, so resolve it by path.
const stylesheets: Record<string, string> = {
  tailwindcss: path.join(root, "node_modules/tailwindcss/index.css"),
  "tw-animate-css": path.join(root, "node_modules/tw-animate-css/dist/tw-animate.css"),
};

/** Compiles the app's real globals.css for the given utility candidates. */
async function build(candidates: string[]) {
  const css = await readFile(path.join(root, "app/globals.css"), "utf8");
  const compiler = await compile(css, {
    base: root,
    loadStylesheet: async (id, base) => {
      const file = stylesheets[id];
      if (!file) throw new Error(`Unexpected stylesheet import: ${id}`);
      return { path: id, base, content: await readFile(file, "utf8") };
    },
  });
  return compiler.build(candidates);
}

describe("data-open / data-closed variants", () => {
  it("target Radix's data-state attribute, not bare data-open/data-closed", async () => {
    const css = await build(["data-open:animate-in", "data-closed:animate-out"]);

    expect(css).toContain('.data-open\\:animate-in[data-state="open"]');
    expect(css).toContain('.data-closed\\:animate-out[data-state="closed"]');
    expect(css).not.toMatch(/\[data-open\]|\[data-closed\]/);
  });

  it("let motion-reduce cancel the animation in each state", async () => {
    const css = await build([
      "data-open:animate-in",
      "motion-reduce:data-open:animate-none",
      "motion-reduce:data-closed:animate-none",
    ]);

    const reduced = css.slice(css.indexOf("prefers-reduced-motion: reduce"));
    expect(reduced).toContain('.motion-reduce\\:data-open\\:animate-none[data-state="open"]');
    expect(reduced).toContain(
      '.motion-reduce\\:data-closed\\:animate-none[data-state="closed"]',
    );
    // Same specificity as the animation it cancels, so it must come after it.
    expect(css.indexOf("motion-reduce\\:data-open\\:animate-none")).toBeGreaterThan(
      css.indexOf("data-open\\:animate-in["),
    );
  });
});
