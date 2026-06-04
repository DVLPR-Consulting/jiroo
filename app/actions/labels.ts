"use server";

import { revalidatePath } from "next/cache";
import { type Role, canWriteItems } from "@/lib/auth/rbac";
import { getSession } from "@/lib/auth/session";
import { createLabel } from "@/lib/services/labels";

// Auth gate — creating a label is a write operation.
async function requireWriter(): Promise<string> {
  const session = await getSession();
  const role = (session?.user as { role?: Role } | undefined)?.role;
  if (!session || !role || !canWriteItems(role)) throw new Error("Forbidden");
  return session.user.id;
}

function mapError(e: unknown): string {
  const s = String(e);
  // Surface a name-length hint when Zod rejects the name field.
  if (s.includes("max") || s.includes("50")) return "Le nom du label ne peut pas dépasser 50 caractères.";
  if (s.includes("min") || s.includes("Required") || s.includes("trop court")) return "Le nom du label ne peut pas être vide.";
  return "Création du label impossible.";
}

export async function createLabelAction(input: {
  backlogKey: string;
  backlogId: string;
  name: string;
}) {
  await requireWriter();
  try {
    const label = await createLabel({ backlogId: input.backlogId, name: input.name });
    revalidatePath(`/b/${input.backlogKey}`);
    return { ok: true as const, label };
  } catch (e) {
    return { ok: false as const, error: mapError(e) };
  }
}
