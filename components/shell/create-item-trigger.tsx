"use client";

import type { ComponentProps } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NewItemButton, type NewItemButtonProps } from "@/components/items/new-item-dialog";
import { TopbarCreate } from "@/components/shell/topbar-create";
import { shortcutById, shortcutText } from "@/lib/shortcuts/registry";

/** The top bar's primary « + Créer » button (Jira's Create), JIR-74. */
export function CreateItemTrigger(props: ComponentProps<typeof Button>) {
  return (
    <Button
      title={`Créer un item (${shortcutText(shortcutById("create"))})`}
      aria-keyshortcuts="c"
      className="h-9 gap-1.5 px-3"
      {...props}
    >
      <Plus className="size-4" aria-hidden="true" />
      Créer
    </Button>
  );
}

/**
 * The page's create dialog, landed in the top bar with « + Créer » as its
 * trigger. The trigger element is created here, on the client: an element
 * built by a server component can reach the client as a lazy reference,
 * which the dialog trigger's `asChild` slot cannot clone.
 */
export function TopbarCreateItem(props: Omit<NewItemButtonProps, "trigger" | "enableShortcut">) {
  return (
    <TopbarCreate>
      <NewItemButton {...props} trigger={<CreateItemTrigger />} enableShortcut />
    </TopbarCreate>
  );
}
