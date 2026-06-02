import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { OtpInput } from "@/components/auth/otp-input";

describe("OtpInput", () => {
  it("renders 6 boxes", () => {
    render(<OtpInput onComplete={vi.fn()} />);
    expect(screen.getAllByRole("textbox")).toHaveLength(6);
  });

  it("auto-advances and calls onComplete with the typed code", async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    render(<OtpInput onComplete={onComplete} />);
    const boxes = screen.getAllByRole("textbox") as HTMLInputElement[];
    for (let i = 0; i < 6; i++) {
      await user.type(boxes[i]!, String(i + 1));
    }
    expect(onComplete).toHaveBeenLastCalledWith("123456");
  });

  it("ignores non-digit input", async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    render(<OtpInput onComplete={onComplete} />);
    const boxes = screen.getAllByRole("textbox") as HTMLInputElement[];
    await user.type(boxes[0]!, "a");
    expect(boxes[0]!.value).toBe("");
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("moves focus to the previous box on backspace when empty", async () => {
    const user = userEvent.setup();
    render(<OtpInput onComplete={vi.fn()} />);
    const boxes = screen.getAllByRole("textbox") as HTMLInputElement[];
    await user.type(boxes[0]!, "1");
    boxes[1]!.focus();
    await user.keyboard("{Backspace}");
    expect(boxes[0]!).toHaveFocus();
  });

  it("fills all boxes from a pasted code", async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    render(<OtpInput onComplete={onComplete} />);
    const boxes = screen.getAllByRole("textbox") as HTMLInputElement[];
    boxes[0]!.focus();
    await user.paste("123456");
    expect(onComplete).toHaveBeenCalledWith("123456");
    expect(boxes[5]!.value).toBe("6");
  });
});
