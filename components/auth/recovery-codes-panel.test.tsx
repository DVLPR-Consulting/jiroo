import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RecoveryCodesPanel } from "@/components/auth/recovery-codes-panel";

const codes = ["AAAA-1111", "BBBB-2222", "CCCC-3333"];

function installClipboard(writeText: ReturnType<typeof vi.fn>) {
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
}

describe("RecoveryCodesPanel", () => {
  const writeText = vi.fn();
  const createObjectURL = vi.fn(() => "blob:codes");
  const revokeObjectURL = vi.fn();
  const fetchSpy = vi.fn();
  let clicked: HTMLAnchorElement[] = [];

  // user-event installs its own clipboard stub; replace it after setup.
  function setupUser() {
    const user = userEvent.setup();
    installClipboard(writeText);
    return user;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    writeText.mockResolvedValue(undefined);
    clicked = [];
    Object.assign(URL, { createObjectURL, revokeObjectURL });
    vi.stubGlobal("fetch", fetchSpy);
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      clicked.push(this);
    });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("shows the codes as one selectable group with a sharing warning", () => {
    render(<RecoveryCodesPanel codes={codes} account="marie@example.test" />);

    const group = screen.getByRole("group", { name: "Codes de récupération — conservez-les" });
    expect(group).toHaveClass("select-all");
    expect(group).toHaveTextContent("AAAA-1111BBBB-2222CCCC-3333");
    expect(
      screen.getByText("Ne partagez ni ces codes ni la clé : ils donnent accès à votre compte."),
    ).toBeInTheDocument();
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });

  it("copies the codes and announces it without any request", async () => {
    const user = setupUser();
    render(<RecoveryCodesPanel codes={codes} account="marie@example.test" />);

    await user.click(screen.getByRole("button", { name: "Copier les codes" }));

    expect(writeText).toHaveBeenCalledWith("AAAA-1111\nBBBB-2222\nCCCC-3333");
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Codes copiés."));
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("explains how to copy manually when the clipboard is refused", async () => {
    writeText.mockRejectedValueOnce(new Error("denied"));
    const user = setupUser();
    render(<RecoveryCodesPanel codes={codes} account="marie@example.test" />);

    await user.click(screen.getByRole("button", { name: "Copier les codes" }));

    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "Copie impossible : sélectionnez les codes ci-dessus et copiez-les manuellement.",
      ),
    );
    expect(screen.getByRole("group", { name: /Codes de récupération/ })).toHaveTextContent("AAAA-1111");
  });

  it("downloads a dated .txt with the account and codes, then revokes the URL", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 13, 9, 0));
    const user = setupUser();
    render(<RecoveryCodesPanel codes={codes} account="marie@example.test" />);

    await user.click(screen.getByRole("button", { name: "Télécharger (.txt)" }));

    expect(clicked.at(-1)?.download).toBe("jiroo-codes-recuperation-2026-10-13.txt");
    expect(clicked.at(-1)?.isConnected).toBe(false);
    const blob = (createObjectURL.mock.calls as unknown as Blob[][]).at(-1)?.[0] as Blob;
    expect(blob.type).toBe("text/plain;charset=utf-8");
    const text = await blob.text();
    expect(text).toContain("Compte : marie@example.test\r\n");
    expect(text).toContain("Générés le : 13/10/2026\r\n");
    expect(text).toContain("AAAA-1111\r\nBBBB-2222\r\nCCCC-3333\r\n");
    expect(screen.getByRole("status")).toHaveTextContent(
      "Fichier jiroo-codes-recuperation-2026-10-13.txt téléchargé.",
    );
    await waitFor(() => expect(revokeObjectURL).toHaveBeenCalledWith("blob:codes"), { timeout: 2_000 });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("cleans up the file URL when the download click fails", async () => {
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {
        throw new DOMException("blocked");
      });
    const user = setupUser();
    render(<RecoveryCodesPanel codes={codes} account="marie@example.test" />);

    await user.click(screen.getByRole("button", { name: "Télécharger (.txt)" }));

    expect(screen.getByRole("status")).toHaveTextContent(/Téléchargement impossible/);
    expect(document.querySelector('a[href="blob:codes"]')).toBeNull();
    await waitFor(() => expect(revokeObjectURL).toHaveBeenCalledWith("blob:codes"), { timeout: 2_000 });
    click.mockRestore();
  });
});
