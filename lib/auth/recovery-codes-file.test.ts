import { describe, expect, it } from "vitest";
import {
  accountFromTotpUri,
  recoveryCodesClipboardText,
  recoveryCodesFileContent,
  recoveryCodesFileName,
} from "@/lib/auth/recovery-codes-file";

describe("accountFromTotpUri", () => {
  it("reads the e-mail from the key URI label", () => {
    expect(
      accountFromTotpUri("otpauth://totp/Jiroo:marie%40example.test?secret=ABCDEF&issuer=Jiroo"),
    ).toBe("marie@example.test");
  });

  it("splits on the literal colon even when the issuer encodes one", () => {
    expect(accountFromTotpUri("otpauth://totp/Cour%3ATest:paul%40example.test?secret=A")).toBe(
      "paul@example.test",
    );
  });

  it("accepts a label without issuer", () => {
    expect(accountFromTotpUri("otpauth://totp/marie%40example.test?secret=A")).toBe(
      "marie@example.test",
    );
  });

  it("returns null for a malformed URI", () => {
    expect(accountFromTotpUri("")).toBeNull();
    expect(accountFromTotpUri("otpauth://totp/?secret=A")).toBeNull();
    expect(accountFromTotpUri("otpauth://totp/Jiroo:%E0%A4%A?secret=A")).toBeNull();
  });
});

describe("recovery codes export", () => {
  const date = new Date(2026, 9, 3, 23, 30);
  const codes = ["AAAA-1111", "BBBB-2222"];

  it("dates the file name in local time", () => {
    expect(recoveryCodesFileName(date)).toBe("jiroo-codes-recuperation-2026-10-03.txt");
  });

  it("copies the codes alone, one per line", () => {
    expect(recoveryCodesClipboardText(codes)).toBe("AAAA-1111\nBBBB-2222");
  });

  it("writes the account, the date, an explanation and the codes", () => {
    expect(recoveryCodesFileContent({ account: "marie@example.test", codes, date })).toBe(
      [
        "Jiroo — codes de récupération de la double authentification",
        "Compte : marie@example.test",
        "Générés le : 03/10/2026",
        "Chaque code remplace une seule fois le code à 6 chiffres de votre application ; ne les partagez avec personne.",
        "",
        "AAAA-1111",
        "BBBB-2222",
        "",
      ].join("\r\n"),
    );
  });

  it("still produces a file when the account is unknown", () => {
    expect(recoveryCodesFileContent({ account: null, codes, date })).toContain(
      "Compte : non précisé\r\n",
    );
  });
});
