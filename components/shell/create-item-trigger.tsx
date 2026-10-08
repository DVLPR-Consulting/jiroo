"use client";

import type { ComponentProps } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
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
