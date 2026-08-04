import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { RecentItemTracker } from "@/components/items/recent-item-tracker";

describe("RecentItemTracker", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("records the mounted detail key without storing item metadata", async () => {
    localStorage.setItem("jiroo-recent-items", JSON.stringify(["DEMO-1"]));

    render(<RecentItemTracker itemKey="DEMO-2" />);

    await waitFor(() => {
      expect(localStorage.getItem("jiroo-recent-items")).toBe(
        JSON.stringify(["DEMO-2", "DEMO-1"]),
      );
    });
  });

  it("sanitizes existing storage when the mounted key is invalid", async () => {
    localStorage.setItem(
      "jiroo-recent-items",
      JSON.stringify(["DEMO-1", { key: "DEMO-2", title: "Private title" }]),
    );

    render(<RecentItemTracker itemKey="demo-3" />);

    await waitFor(() => {
      expect(localStorage.getItem("jiroo-recent-items")).toBe(
        JSON.stringify(["DEMO-1"]),
      );
    });
  });
});
