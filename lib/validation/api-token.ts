import { z } from "zod";

export const API_TOKEN_NAME_MAX = 60;

/** The secret starts with this, so scanners and readers recognise it. */
export const API_TOKEN_PREFIX = "jiroo_pat_";

/** Live tokens one user may hold; bounds the budget rows and the blast radius. */
export const MAX_LIVE_TOKENS_PER_USER = 50;

// WORDING (Codex, JIR-156): user-facing messages shared by the service and the UI.
export const TOO_MANY_TOKENS_MESSAGE = `Vous avez déjà ${MAX_LIVE_TOKENS_PER_USER} jetons : révoquez-en un avant d’en créer un autre.`;
export const STALE_SESSION_MESSAGE = "Votre session a expiré. Reconnectez-vous.";

/** The durations the « Jetons d'accès » page offers, or no expiry (null). */
export const API_TOKEN_EXPIRY_DAYS = [30, 90, 365] as const;

export type ApiTokenExpiryDays = (typeof API_TOKEN_EXPIRY_DAYS)[number] | null;

export const API_TOKEN_SCOPES = ["read", "write"] as const;

export type ApiTokenScope = (typeof API_TOKEN_SCOPES)[number];

// WORDING: validation messages to be confirmed by Codex (JIR-156 wording brief).
export const createApiTokenSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Donnez un nom à ce jeton.")
    .max(API_TOKEN_NAME_MAX, `Le nom ne doit pas dépasser ${API_TOKEN_NAME_MAX} caractères.`),
  scope: z.enum(API_TOKEN_SCOPES),
  expiresInDays: z.union([z.literal(30), z.literal(90), z.literal(365), z.null()]),
});

export type CreateApiTokenInput = z.infer<typeof createApiTokenSchema>;
