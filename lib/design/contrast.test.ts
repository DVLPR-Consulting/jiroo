import { describe, expect, it } from "vitest";
import { DARK_TEXT, LIGHT_TEXT, readableTextOn } from "@/lib/design/contrast";

describe("readableTextOn", () => {
  it.each([
    ["#7c3030", LIGHT_TEXT],
    ["#2563eb", LIGHT_TEXT],
    ["#0f766e", LIGHT_TEXT],
    ["#ffeeaa", DARK_TEXT],
    ["#ffffff", DARK_TEXT],
    ["#fde047", DARK_TEXT],
    ["#fff", DARK_TEXT],
    // Mid grey: black reaches 5.2:1, white only 4:1 (WCAG asks 4.5:1).
    ["#7f7f7f", DARK_TEXT],
  ])("picks a readable text on %s", (background, text) => {
    expect(readableTextOn(background)).toBe(text);
  });

  it("falls back to white on a value it cannot read", () => {
    expect(readableTextOn("oklch(0.5 0.1 30)")).toBe(LIGHT_TEXT);
  });
});
