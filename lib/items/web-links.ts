import { z } from "zod";

// Web links of an item (JIR-99): any page an item points to — mockups,
// specs, documents — like Jira's « Web links ». Figma only changes the icon.

const INVALID_URL = "URL invalide (http ou https).";
const LABEL_MAX = 60;

function parseHttpUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

export const addWebLinkInput = z.object({
  itemId: z.string().uuid(),
  url: z
    .string()
    .trim()
    .max(2048, INVALID_URL)
    .refine((value) => parseHttpUrl(value) !== null, INVALID_URL),
  title: z
    .string()
    .trim()
    .max(200, "Texte affiché trop long (200 caractères maximum).")
    .nullish()
    .transform((value) => value || null),
});

export type AddWebLinkInput = z.infer<typeof addWebLinkInput>;

/** The text shown for a link: its title, else its host and path. */
export function webLinkLabel(url: string, title: string | null): string {
  if (title) return title;
  const parsed = parseHttpUrl(url);
  if (!parsed) return url;
  const label = `${parsed.hostname.replace(/^www\./, "")}${parsed.pathname}`.replace(/\/+$/, "");
  return label.length > LABEL_MAX ? `${label.slice(0, LABEL_MAX - 1)}…` : label;
}

export type WebLinkKind = "figma" | "web";

export function webLinkKind(url: string): WebLinkKind {
  const host = parseHttpUrl(url)?.hostname;
  return host === "figma.com" || host?.endsWith(".figma.com") ? "figma" : "web";
}
