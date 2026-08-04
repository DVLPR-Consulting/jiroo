import { describe, expect, it } from "vitest";
import { readRecentKeys, recordRecentKey } from "@/lib/items/recent";

describe("readRecentKeys", () => {
  it("returns an empty list for invalid JSON", () => {
    expect(readRecentKeys("not-json")).toEqual([]);
  });

  it("keeps only valid item keys from an array", () => {
    expect(
      readRecentKeys(
        JSON.stringify([
          "DEMO-3",
          { key: "DEMO-2", title: "Private title" },
          null,
          42,
          "demo-2",
          "TOOLONG-1",
          "DEMO-2",
        ]),
      ),
    ).toEqual(["DEMO-3", "DEMO-2"]);
  });

  it("removes duplicates while preserving newest-first order", () => {
    expect(
      readRecentKeys(JSON.stringify(["DEMO-3", "DEMO-2", "DEMO-3", "DEMO-1"])),
    ).toEqual(["DEMO-3", "DEMO-2", "DEMO-1"]);
  });

  it("caps a stored list at eight keys", () => {
    expect(
      readRecentKeys(
        JSON.stringify([
          "DEMO-10",
          "DEMO-9",
          "DEMO-8",
          "DEMO-7",
          "DEMO-6",
          "DEMO-5",
          "DEMO-4",
          "DEMO-3",
          "DEMO-2",
          "DEMO-1",
        ]),
      ),
    ).toEqual([
      "DEMO-10",
      "DEMO-9",
      "DEMO-8",
      "DEMO-7",
      "DEMO-6",
      "DEMO-5",
      "DEMO-4",
      "DEMO-3",
    ]);
  });
});

describe("recordRecentKey", () => {
  it("moves a reopened key to the front", () => {
    expect(recordRecentKey(["DEMO-3", "DEMO-2", "DEMO-1"], "DEMO-2")).toEqual([
      "DEMO-2",
      "DEMO-3",
      "DEMO-1",
    ]);
  });

  it("caps the resulting list at eight keys", () => {
    expect(
      recordRecentKey(
        [
          "DEMO-8",
          "DEMO-7",
          "DEMO-6",
          "DEMO-5",
          "DEMO-4",
          "DEMO-3",
          "DEMO-2",
          "DEMO-1",
        ],
        "DEMO-9",
      ),
    ).toEqual([
      "DEMO-9",
      "DEMO-8",
      "DEMO-7",
      "DEMO-6",
      "DEMO-5",
      "DEMO-4",
      "DEMO-3",
      "DEMO-2",
    ]);
  });

  it("never adds an invalid key or preserves invalid existing entries", () => {
    expect(recordRecentKey(["DEMO-1", "demo-2", "bad"], "demo-3")).toEqual([
      "DEMO-1",
    ]);
  });

  it("honors a zero limit", () => {
    expect(recordRecentKey(["DEMO-1"], "DEMO-2", 0)).toEqual([]);
  });
});
