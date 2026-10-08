"use client";

import { createContext } from "react";

export type FieldStatus = { pending: boolean; error: string | null };

/**
 * Lets an editor's optimistic update report its save state to the row that
 * hosts it (the « Détails » panel), so a pending save or its failure stays
 * visible after the row went back to read mode.
 */
export const FieldStatusContext = createContext<((status: FieldStatus) => void) | null>(null);

/**
 * Whether the hosting row is in edit mode. Outside a « Détails » row the
 * editor is always shown, hence the default.
 */
export const FieldEditingContext = createContext(true);
