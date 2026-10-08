"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { ItemKey } from "@/components/jiroo/item-key";
import { useViewUrlState } from "@/components/shell/view-url-state";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";

/** Matches the sheet-right exit animation (handoff: translateX 220ms). */
export const ITEM_DETAIL_SHEET_EXIT_MS = 220;

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * The item detail drawer frame. It mounts as soon as `?item=` is in the URL and
 * stays mounted while the detail streams in (its Suspense boundary lives inside
 * `children`), so the panel slides in once instead of a loading overlay being
 * swapped for the real dialog. Closing lets the exit slide finish before the
 * URL drops `item`, because that navigation unmounts the drawer.
 */
export function ItemDetailSheet({
  itemKey,
  children,
}: {
  itemKey: string;
  children: ReactNode;
}) {
  const viewUrl = useViewUrlState();
  const [open, setOpen] = useState(true);
  const [openedKey, setOpenedKey] = useState(itemKey);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(
    typeof document !== "undefined" &&
      document.activeElement instanceof HTMLElement &&
      document.activeElement !== document.body
      ? document.activeElement
      : null,
  );

  // Another item was opened while this one was closing: show it again.
  if (openedKey !== itemKey) {
    setOpenedKey(itemKey);
    setOpen(true);
  }
  useEffect(() => {
    if (open && closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, [open]);

  useEffect(
    () => () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    },
    [],
  );

  const navigateAway = () => {
    closeTimer.current = null;
    const dropItem = (params: URLSearchParams) => {
      if (params.get("item") === itemKey) params.delete("item");
    };
    // Skip when another item replaced this one during the exit animation.
    if (viewUrl.href(dropItem) === viewUrl.href(() => {})) return;
    viewUrl.push(dropItem);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (nextOpen) return;
    if (closeTimer.current) clearTimeout(closeTimer.current);
    if (prefersReducedMotion()) {
      navigateAway();
      return;
    }
    closeTimer.current = setTimeout(navigateAway, ITEM_DETAIL_SHEET_EXIT_MS);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        variant="sheet-right"
        data-shortcut-scope="item"
        showCloseButton={false}
        aria-describedby={undefined}
        className="bg-[var(--surface)] shadow-lg"
        onCloseAutoFocus={(event) => {
          const returnTarget = returnFocusRef.current;
          if (returnTarget?.isConnected) {
            event.preventDefault();
            returnTarget.focus();
          }
        }}
        onEscapeKeyDown={(event) => {
          const target = event.target;
          if (
            target instanceof Element &&
            target.matches('[aria-label="Titre de l’item"]')
          ) {
            event.preventDefault();
          }
        }}
      >
        {children}
      </DialogContent>
    </Dialog>
  );
}

/** Drawer body for a key that no longer resolves (deleted or mistyped link). */
export function ItemDetailNotFound({ itemKey }: { itemKey: string }) {
  return (
    <>
      <DialogTitle className="sr-only">Item {itemKey} introuvable</DialogTitle>
      <header className="flex items-center gap-2 border-b border-border px-4 py-3">
        <ItemKey value={itemKey} />
        <DialogClose asChild>
          <button
            type="button"
            aria-label="Fermer"
            className="ml-auto rounded p-1 text-muted-foreground hover:bg-[var(--muted)]"
          >
            <X className="size-4" />
          </button>
        </DialogClose>
      </header>
      <p className="p-5 text-sm text-muted-foreground">
        Cet item est introuvable ou a été supprimé.
      </p>
    </>
  );
}
