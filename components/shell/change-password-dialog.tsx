"use client";

import { useState, useTransition } from "react";
import { changeOwnPasswordAction } from "@/app/actions/account";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/lib/toast";

const MIN_LENGTH = 8;

export function ChangePasswordDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const mismatch = confirmation.length > 0 && confirmation !== newPassword;
  const canSubmit =
    !pending &&
    currentPassword.length > 0 &&
    newPassword.length >= MIN_LENGTH &&
    confirmation === newPassword;

  function close() {
    onOpenChange(false);
    setCurrentPassword("");
    setNewPassword("");
    setConfirmation("");
    setError(null);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen) onOpenChange(true);
        else if (!pending) close();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Changer mon mot de passe</DialogTitle>
          <DialogDescription>
            Vos autres sessions ouvertes seront fermées ; vous restez connecté sur cet appareil.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!canSubmit) return;
            setError(null);
            startTransition(async () => {
              const result = await changeOwnPasswordAction({
                currentPassword,
                newPassword,
                confirmation,
              });
              if (!result.ok) {
                setError(result.error);
                return;
              }
              close();
              toast.success("Mot de passe modifié. Vos autres sessions ont été fermées.");
            });
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="current-password">Mot de passe actuel</Label>
            <Input
              id="current-password"
              type="password"
              value={currentPassword}
              autoComplete="current-password"
              onChange={(event) => setCurrentPassword(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-password">Nouveau mot de passe</Label>
            <Input
              id="new-password"
              type="password"
              value={newPassword}
              autoComplete="new-password"
              aria-describedby="new-password-hint"
              onChange={(event) => setNewPassword(event.target.value)}
            />
            <p id="new-password-hint" className="text-xs text-muted-foreground">
              8 caractères minimum.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-password-confirmation">Confirmer le nouveau mot de passe</Label>
            <Input
              id="new-password-confirmation"
              type="password"
              value={confirmation}
              autoComplete="new-password"
              aria-invalid={mismatch || undefined}
              aria-describedby={mismatch ? "new-password-mismatch" : undefined}
              onChange={(event) => setConfirmation(event.target.value)}
            />
            {mismatch && (
              <p id="new-password-mismatch" className="text-xs text-destructive">
                Les mots de passe ne correspondent pas.
              </p>
            )}
          </div>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={pending}>
                Annuler
              </Button>
            </DialogClose>
            <Button type="submit" aria-busy={pending} disabled={!canSubmit}>
              {pending ? "Modification…" : "Changer le mot de passe"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
