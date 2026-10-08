"use client";

import { DensityToggle } from "@/components/theme/density-toggle";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { ShortcutsToggle } from "@/components/shortcuts/keyboard-shortcuts-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function UserPreferencesDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Préférences</DialogTitle>
          <DialogDescription>
            Personnalisez l’apparence de Jiroo sur cet appareil.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          <PreferenceRow
            id="theme"
            label="Thème"
            description="Alterner entre les apparences claire et sombre."
          >
            <ThemeToggle />
          </PreferenceRow>
          <PreferenceRow
            id="density"
            label="Densité"
            description="Adapter l’espacement des listes et des tableaux."
          >
            <DensityToggle />
          </PreferenceRow>
          <ShortcutsToggle />
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PreferenceRow({
  id,
  label,
  description,
  children,
}: {
  id: string;
  label: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div
      role="group"
      aria-labelledby={`preference-${id}-label`}
      aria-describedby={`preference-${id}-description`}
      className="flex items-center gap-4 rounded-lg border border-border p-3"
    >
      <div className="min-w-0 flex-1">
        <div id={`preference-${id}-label`} className="font-medium">
          {label}
        </div>
        <div id={`preference-${id}-description`} className="text-xs text-muted-foreground">
          {description}
        </div>
      </div>
      {children}
    </div>
  );
}
