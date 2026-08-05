import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useMediaQuery } from "@/components/shell/use-media-query";

describe("useMediaQuery", () => {
  it("reads the initial match and reacts to media-query changes", () => {
    let matches = true;
    let listener: (() => void) | undefined;
    vi.stubGlobal("matchMedia", vi.fn(() => ({
      get matches() {
        return matches;
      },
      media: "(max-width: 767px)",
      onchange: null,
      addEventListener: (_type: string, next: () => void) => {
        listener = next;
      },
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })));

    function Probe() {
      return <output>{useMediaQuery("(max-width: 767px)") ? "mobile" : "desktop"}</output>;
    }

    render(<Probe />);
    expect(screen.getByText("mobile")).toBeVisible();

    act(() => {
      matches = false;
      listener?.();
    });
    expect(screen.getByText("desktop")).toBeVisible();

    vi.unstubAllGlobals();
  });
});
