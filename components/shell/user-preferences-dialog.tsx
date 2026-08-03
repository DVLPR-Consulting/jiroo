"use client";

import { DensityToggle } from "@/components/theme/density-toggle";
import { ThemeToggle } from "@/components/theme/theme-toggle";
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
            label="Thème"
            description="Alterner entre les apparences claire et sombre."
          >
            <ThemeToggle />
          </PreferenceRow>
          <PreferenceRow
            label="Densité"
            description="Adapter l’espacement des listes et des tableaux."
          >
            <DensityToggle />
          </PreferenceRow>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PreferenceRow({
  label,
  description,
  children,
}: {
  label: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-4 rounded-lg border border-border p-3">
      <div className="min-w-0 flex-1">
        <div className="font-medium">{label}</div>
        <div className="text-xs text-muted-foreground">{description}</div>
      </div>
      {children}
    </div>
  );
}
