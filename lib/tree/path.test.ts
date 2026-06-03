import { describe, expect, it } from "vitest";
import { ROOT_LABEL, buildPath, childDepth, ltreeLabel } from "@/lib/tree/path";

describe("ltree path helpers", () => {
  it("strips hyphens from a UUID to a single hex label", () => {
    expect(ltreeLabel("3f2a4b6c-1234-4abc-89de-0123456789ab")).toBe("3f2a4b6c12344abc89de0123456789ab");
    expect(ltreeLabel("a-b-c")).toBe("abc");
  });

  it("builds a root path under ROOT_LABEL for a null parent", () => {
    const id = "11111111-2222-3333-4444-555555555555";
    expect(buildPath(null, id)).toBe(`${ROOT_LABEL}.${ltreeLabel(id)}`);
  });

  it("appends the own id-label to a parent path", () => {
    const id = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    expect(buildPath("root.abc", id)).toBe(`root.abc.${ltreeLabel(id)}`);
  });

  it("computes child depth", () => {
    expect(childDepth(null)).toBe(0);
    expect(childDepth(0)).toBe(1);
    expect(childDepth(2)).toBe(3);
  });

  it("path always ends with the node's own id-label (self-inclusive invariant)", () => {
    const id = "12345678-90ab-cdef-1234-567890abcdef";
    expect(buildPath(null, id).endsWith(ltreeLabel(id))).toBe(true);
    expect(buildPath("root.x.y", id).endsWith(ltreeLabel(id))).toBe(true);
  });
});
