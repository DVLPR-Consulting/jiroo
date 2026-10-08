/**
 * Link URL policy for the Markdown editor: only http(s), mailto and same-site
 * relative links are accepted. Anything else (javascript:, data:, vbscript:,
 * file:, protocol-relative…) is rejected so it can never be written into a
 * description, even though the read renderer sanitizes URLs too.
 */

const ALLOWED_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);
// A bare domain such as "exemple.fr" or "www.exemple.fr/page".
const BARE_DOMAIN = /^[\p{L}\p{N}-]+(\.[\p{L}\p{N}-]+)+(?::\d+)?(?:[/?#]\S*)?$/u;

/** Returns the URL to store, or null when it is not an allowed link. */
export function normalizeLinkUrl(input: string): string | null {
  // Browsers ignore ASCII tab/newline inside a scheme ("java\tscript:").
  const raw = input.trim();
  if (raw === "" || /[\s\u0000-\u001f]/.test(raw)) return null;

  if (raw.startsWith("/")) return raw.startsWith("//") ? null : raw;
  if (raw.startsWith("#")) return raw;

  if (/^[a-z][a-z\d+.-]*:/i.test(raw)) {
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      return null;
    }
    if (!ALLOWED_PROTOCOLS.has(url.protocol)) return null;
    if (url.protocol !== "mailto:" && url.hostname === "") return null;
    if (url.protocol === "mailto:" && url.pathname === "") return null;
    return raw;
  }

  return BARE_DOMAIN.test(raw) ? `https://${raw}` : null;
}

export function isAllowedLinkUrl(input: string): boolean {
  return normalizeLinkUrl(input) !== null;
}
