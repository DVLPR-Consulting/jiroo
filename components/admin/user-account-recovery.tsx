"use client";

import { useState, useTransition } from "react";
import { KeyRound, MoreHorizontal, ShieldOff } from "lucide-react";
import { resetUserPasswordAction, resetUserTwoFactorAction } from "@/app/actions/users";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/lib/toast";

type RecoveryTarget = { id: string; name: string };
type OpenDialog = "password" | "two-factor" | null;

/**
 * Row-level account recovery for Jiroo administrators (JIR-61). Rendered only
 * for other users: administrators change their own password from the user menu
 * and can never reset their own second factor here. The server enforces both.
 */
export function UserAccountRecovery({ target }: { target: RecoveryTarget }) {
  const [openDialog, setOpenDialog] = useState<OpenDialog>(null);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Actions de compte pour ${target.name}`}
          >
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setOpenDialog("password")}>
            <KeyRound className="size-4" />
            Réinitialiser le mot de passe
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setOpenDialog("two-factor")}>
            <ShieldOff className="size-4" />
            Réinitialiser la double authentification
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ResetPasswordDialog
        target={target}
        open={openDialog === "password"}
        onOpenChange={(open) => setOpenDialog(open ? "password" : null)}
      />
      <ResetTwoFactorDialog
        target={target}
        open={openDialog === "two-factor"}
        onOpenChange={(open) => setOpenDialog(open ? "two-factor" : null)}
      />
    </>
  );
}

/**
 * Runs `clear` when a parent-controlled dialog opens. Clearing on open rather
 * than on close keeps the closing dialog's content intact during its exit
 * animation (JIR-64). It adjusts state during render, React's pattern for
 * reacting to a prop change, so the cleared state shows on the first frame.
 */
function useClearOnOpen(open: boolean, clear: () => void) {
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) clear();
  }
}

function ResetPasswordDialog({
  target,
  open,
  onOpenChange,
}: {
  target: RecoveryTarget;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [temporaryPassword, setTemporaryPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const inputId = `temporary-password-${target.id}`;
  useClearOnOpen(open, () => setError(null));

  function close() {
    onOpenChange(false);
    // The error is cleared on the next open so it does not blank during the
    // exit animation (JIR-64); the temporary password is dropped right away
    // so it never lingers in state between openings.
    setTemporaryPassword("");
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
          <DialogTitle>Réinitialiser le mot de passe de {target.name} ?</DialogTitle>
          <DialogDescription>
            Définissez un mot de passe temporaire et transmettez-le par un canal sûr. Toutes ses
            sessions seront fermées ; sa double authentification reste inchangée. Ce mot de passe
            reste valable jusqu’à ce qu’il le remplace depuis « Changer mon mot de passe ».
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            setError(null);
            startTransition(async () => {
              let result: Awaited<ReturnType<typeof resetUserPasswordAction>>;
              try {
                result = await resetUserPasswordAction({
                  userId: target.id,
                  temporaryPassword,
                });
              } catch {
                setError("Réinitialisation impossible.");
                return;
              }
              if (!result.ok) {
                setError(result.error);
                return;
              }
              close();
              toast.success(
                `Mot de passe de ${target.name} réinitialisé. Ses sessions ont été fermées.`,
              );
            });
          }}
        >
          <div className="space-y-2">
            <Label htmlFor={inputId}>Mot de passe temporaire</Label>
            <Input
              id={inputId}
              type="password"
              value={temporaryPassword}
              autoComplete="new-password"
              onChange={(event) => setTemporaryPassword(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">8 caractères minimum.</p>
          </div>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={pending}>
                Annuler
              </Button>
            </DialogClose>
            <Button
              type="submit"
              variant="destructive"
              aria-busy={pending}
              disabled={pending || temporaryPassword.length < 8}
            >
              {pending ? "Réinitialisation…" : "Réinitialiser le mot de passe"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ResetTwoFactorDialog({
  target,
  open,
  onOpenChange,
}: {
  target: RecoveryTarget;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  useClearOnOpen(open, () => setError(null));

  function close() {
    onOpenChange(false);
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
          <DialogTitle>Réinitialiser la double authentification de {target.name} ?</DialogTitle>
          <DialogDescription>
            {target.name} devra configurer à nouveau la double authentification à sa prochaine
            connexion. Son application d’authentification et ses codes de récupération actuels ne
            fonctionneront plus. Toutes ses sessions seront fermées.
          </DialogDescription>
        </DialogHeader>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline" disabled={pending}>
              Annuler
            </Button>
          </DialogClose>
          <Button
            type="button"
            variant="destructive"
            aria-busy={pending}
            disabled={pending}
            onClick={() => {
              setError(null);
              startTransition(async () => {
                let result: Awaited<ReturnType<typeof resetUserTwoFactorAction>>;
                try {
                  result = await resetUserTwoFactorAction({ userId: target.id });
                } catch {
                  setError("Réinitialisation impossible.");
                  return;
                }
                if (!result.ok) {
                  setError(result.error);
                  return;
                }
                close();
                toast.success(
                  `Double authentification de ${target.name} réinitialisée. Ses sessions ont été fermées.`,
                );
              });
            }}
          >
            {pending ? "Réinitialisation…" : "Réinitialiser la double authentification"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
