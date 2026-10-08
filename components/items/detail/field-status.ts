"use client";

import { createContext } from "react";

export type FieldStatus = { pending: boolean; error: string | null };

/**
 * Lets an editor's optimistic update report its save state to the row that
 * hosts it (the « Détails » panel), so a pending save or its failure stays
 * visible after the row went back to read mode.
 */
export const FieldStatusContext = createContext<((status: FieldStatus) => void) | null>(null);
