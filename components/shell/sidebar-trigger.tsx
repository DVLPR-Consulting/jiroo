"use client";

import { PanelLeft } from "lucide-react";
import { useSidebarState } from "@/components/shell/sidebar-state";

export function SidebarTrigger() {
  const { collapsed, mobile, mobileOpen, toggle } = useSidebarState();
  const label = mobile
    ? mobileOpen
      ? "Fermer la navigation"
      : "Ouvrir la navigation"
    : collapsed
      ? "Déplier la barre latérale"
      : "Replier la barre latérale";

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      aria-expanded={mobile ? mobileOpen : undefined}
      title={label}
      className="inline-flex size-8 shrink-0 items-center justify-center rounded-[var(--radius)] text-muted-foreground transition-colors hover:bg-[var(--muted)] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
    >
      <PanelLeft className="size-4" />
    </button>
  );
}
