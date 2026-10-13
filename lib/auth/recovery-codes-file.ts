// Client-side export of the 2FA recovery codes shown once at enrollment. Nothing
// here talks to the server: the text is built in the browser and handed to the
// clipboard or to a short-lived download.

/**
 * Account label of a TOTP key URI (`otpauth://totp/<issuer>:<account>?…`).
 * Better Auth puts the user's e-mail there, which lets the export name the
 * account without another request. Returns null when the URI has no label.
 */
export function accountFromTotpUri(totpUri: string): string | null {
  const label = /^otpauth:\/\/totp\/([^?#]+)/u.exec(totpUri)?.[1];
  if (!label) return null;
  // Issuer and account are encoded separately, so the first literal colon splits them.
  const separator = label.indexOf(":");
  const encodedAccount = separator === -1 ? label : label.slice(separator + 1);
  try {
    return decodeURIComponent(encodedAccount).trim() || null;
  } catch {
    return null;
  }
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** `jiroo-codes-recuperation-AAAA-MM-JJ.txt`, dated in the browser's time zone. */
export function recoveryCodesFileName(date: Date): string {
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  return `jiroo-codes-recuperation-${day}.txt`;
}

/** The codes alone, one per line, as copied to the clipboard. */
export function recoveryCodesClipboardText(codes: readonly string[]): string {
  return codes.join("\n");
}

/**
 * Plain-text file: account, date, one explanatory line, then the codes.
 * CRLF line endings keep it readable in every Windows editor.
 */
export function recoveryCodesFileContent({
  account,
  codes,
  date,
}: {
  account: string | null;
  codes: readonly string[];
  date: Date;
}): string {
  const generatedOn = `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
  return [
    "Jiroo — codes de récupération de la double authentification",
    `Compte : ${account ?? "non précisé"}`,
    `Générés le : ${generatedOn}`,
    "Chaque code remplace une seule fois le code à 6 chiffres de votre application ; ne les partagez avec personne.",
    "",
    ...codes,
    "",
  ].join("\r\n");
}
