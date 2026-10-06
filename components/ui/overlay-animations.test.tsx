import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const REDUCED = [
  "motion-reduce:data-open:animate-none",
  "motion-reduce:data-closed:animate-none",
];

function renderDialog(variant: "center" | "sheet-right" | "sheet-left") {
  render(
    <Dialog open>
      <DialogContent variant={variant} aria-describedby={undefined}>
        <DialogTitle>Titre</DialogTitle>
      </DialogContent>
    </Dialog>,
  );
  return {
    content: screen.getByRole("dialog", { name: "Titre" }),
    overlay: document.querySelector('[data-slot="dialog-overlay"]'),
  };
}

describe("overlay primitives animate on Radix data-state", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fades and zooms the center dialog over a fading overlay", () => {
    const { content, overlay } = renderDialog("center");

    expect(content).toHaveAttribute("data-state", "open");
    expect(content).toHaveClass(
      "data-open:animate-in",
      "data-open:fade-in-0",
      "data-open:zoom-in-95",
      "data-closed:animate-out",
      "data-closed:fade-out-0",
      "data-closed:zoom-out-95",
      "duration-100",
      ...REDUCED,
    );
    expect(overlay).toHaveAttribute("data-state", "open");
    expect(overlay).toHaveClass(
      "data-open:animate-in",
      "data-open:fade-in-0",
      "data-closed:animate-out",
      "data-closed:fade-out-0",
      ...REDUCED,
    );
  });

  it.each([
    ["sheet-left", "from-left", "to-left"],
    ["sheet-right", "from-right", "to-right"],
  ] as const)("slides the %s without fading, with the handoff panel motion", (variant, from, to) => {
    const { content, overlay } = renderDialog(variant);

    expect(content).toHaveClass(
      "data-open:animate-in",
      `data-open:slide-in-${from}`,
      "data-closed:animate-out",
      `data-closed:slide-out-${to}`,
      "duration-[220ms]",
      "ease-[cubic-bezier(.32,.72,0,1)]",
      ...REDUCED,
    );
    expect(content.className).not.toMatch(/fade-(in|out)/);
    expect(overlay).toHaveClass("duration-[180ms]", "data-open:fade-in-0", ...REDUCED);
    expect(overlay).not.toHaveClass("duration-100");
  });

  it("animates the dropdown menu content", () => {
    render(
      <DropdownMenu open>
        <DropdownMenuTrigger>Menu</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem>Action</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    );

    const menu = screen.getByRole("menu");
    expect(menu).toHaveAttribute("data-state", "open");
    expect(menu).toHaveClass(
      "data-open:animate-in",
      "data-open:zoom-in-95",
      "data-closed:animate-out",
      ...REDUCED,
    );
  });

  it("animates the popover content", () => {
    render(
      <Popover open>
        <PopoverTrigger>Filtre</PopoverTrigger>
        <PopoverContent aria-label="Filtre">Contenu</PopoverContent>
      </Popover>,
    );

    const popover = screen.getByRole("dialog", { name: "Filtre" });
    expect(popover).toHaveAttribute("data-state", "open");
    expect(popover).toHaveClass("data-open:animate-in", "data-closed:animate-out", ...REDUCED);
  });

  it("animates the tooltip's delayed open and close, reduced-motion aware", () => {
    // jsdom lacks ResizeObserver, which the tooltip arrow measures with.
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    render(
      <TooltipProvider>
        <Tooltip open>
          <TooltipTrigger>Aide</TooltipTrigger>
          <TooltipContent>Astuce</TooltipContent>
        </Tooltip>
      </TooltipProvider>,
    );

    const tooltip = document.querySelector('[data-slot="tooltip-content"]');
    expect(tooltip).toHaveClass(
      "data-[state=delayed-open]:animate-in",
      "data-closed:animate-out",
      "motion-reduce:data-[state=delayed-open]:animate-none",
      "motion-reduce:data-closed:animate-none",
    );
  });
});
