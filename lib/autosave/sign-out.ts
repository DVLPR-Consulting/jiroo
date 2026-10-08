import { clearDrafts, flushAllDrafts, hasUnsavedDrafts } from "@/lib/autosave/registry";

export const UNSAVED_DRAFTS_SIGN_OUT_MESSAGE =
  "Des modifications de description n’ont pas été enregistrées. Se déconnecter quand même ?";

/**
 * Before signing out: saves pending drafts, asks before dropping those that
 * still could not be saved, then forgets every draft so the next account
 * never sees them. Returns false when the user chose to stay.
 */
export async function prepareSignOut(): Promise<boolean> {
  await flushAllDrafts();
  if (hasUnsavedDrafts() && !window.confirm(UNSAVED_DRAFTS_SIGN_OUT_MESSAGE)) return false;
  clearDrafts();
  return true;
}
