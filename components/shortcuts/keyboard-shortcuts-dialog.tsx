"use client";

import Link from "next/link";
import { useId, useRef } from "react";
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
import { SHORTCUT_ITEM_SELECTOR } from "@/lib/shortcuts/list-navigation";

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

/**
 * Where focus goes back once the dialog closes. The dialog opens from a global
 * key, not a trigger, so Radix has nothing to return to: restore the element
 * focused before « ? » (the selected row, typically) so j / k / o resume from
 * it. If that node was re-rendered meanwhile, fall back to the row of the same
 * item; otherwise let focus settle as Radix leaves it.
 */
function restorableFocusTarget(previous: Element | null): HTMLElement | null {
  if (!(previous instanceof HTMLElement)) return null;
  if (previous.isConnected) return previous === document.body ? null : previous;
  const key = previous.getAttribute("data-shortcut-item");
  if (!key) return null;
  return document.querySelector<HTMLElement>(
    `${SHORTCUT_ITEM_SELECTOR}[data-shortcut-item="${CSS.escape(key)}"]`,
  );
}

export function KeyboardShortcutsDialog({
  open,
  onOpenChange,
  returnFocusTo = null,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The element focused when the dialog was opened. */
  returnFocusTo?: Element | null;
}) {
  const navigating = useRef(false);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[85vh] overflow-y-auto sm:max-w-lg"
        onOpenAutoFocus={() => {
          navigating.current = false;
        }}
        onCloseAutoFocus={(event) => {
          // « Voir le guide » navigates away: the new page owns focus.
          if (navigating.current) return;
          const target = restorableFocusTarget(returnFocusTo);
          if (!target) return;
          event.preventDefault();
          target.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>Raccourcis clavier</DialogTitle>
          <DialogDescription>
            Les touches reprennent celles de Jira. Elles sont sans effet pendant la saisie dans un champ.{" "}
            <Link
              href="/aide#recherche"
              onClick={() => {
                navigating.current = true;
                onOpenChange(false);
              }}
            >
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
