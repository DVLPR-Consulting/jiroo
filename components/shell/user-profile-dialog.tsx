"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const ROLE_LABELS: Record<string, string> = {
  admin: "Administrateur Jiroo",
  contributor: "Contributeur",
  viewer: "Lecteur",
};

export function UserProfileDialog({
  open,
  onOpenChange,
  user,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: { name: string; email: string; role: string };
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Profil</DialogTitle>
          <DialogDescription>Informations associées à votre compte Jiroo.</DialogDescription>
        </DialogHeader>
        <dl className="grid gap-3 rounded-lg border border-border bg-[var(--surface-2)] p-3">
          <ProfileField label="Nom" value={user.name} />
          <ProfileField label="E-mail" value={user.email} />
          <ProfileField label="Rôle" value={ROLE_LABELS[user.role] ?? user.role} />
        </dl>
      </DialogContent>
    </Dialog>
  );
}

function ProfileField({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-0.5">
      <dt className="t-meta">{label}</dt>
      <dd className="text-sm font-medium">{value}</dd>
    </div>
  );
}
