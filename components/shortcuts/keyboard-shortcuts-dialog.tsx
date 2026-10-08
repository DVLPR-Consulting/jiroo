"use client";

import Link from "next/link";
import { useId } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ShortcutList } from "@/components/shortcuts/shortcut-list";
import { useShortcutsEnabled } from "@/components/shortcuts/use-shortcuts-enabled";
import { writeShortcutsEnabled } from "@/lib/shortcuts/preferences";

/**
 * Switch for single-key shortcuts (WCAG 2.1.4: character key shortcuts can be
 * turned off). Shown in the « Raccourcis clavier » dialog and in Préférences,
 * which stays reachable with the mouse once the keys are off.
 */
export function ShortcutsToggle() {
  const enabled = useShortcutsEnabled();
  const descriptionId = useId();
  return (
    <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-border p-3">
      <span className="min-w-0 flex-1">
        <span className="block font-medium">Raccourcis à une touche</span>
        <span id={descriptionId} className="block text-xs text-muted-foreground">
          Lettres et symboles seuls (?, /, G puis B, J, K…). Les raccourcis avec ⌘/Ctrl restent actifs.
        </span>
      </span>
      <input
        type="checkbox"
        role="switch"
        checked={enabled}
        aria-describedby={descriptionId}
        onChange={(event) => writeShortcutsEnabled(event.target.checked)}
        className="size-4 cursor-pointer accent-[var(--primary)]"
      />
    </label>
  );
}

export function KeyboardShortcutsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Raccourcis clavier</DialogTitle>
          <DialogDescription>
            Les touches reprennent celles de Jira. Elles sont sans effet pendant la saisie dans un champ.{" "}
            <Link href="/aide#recherche" onClick={() => onOpenChange(false)}>
              Voir le guide
            </Link>
          </DialogDescription>
        </DialogHeader>
        <ShortcutsToggle />
        <ShortcutList idPrefix="shortcuts-dialog" />
      </DialogContent>
    </Dialog>
  );
}
