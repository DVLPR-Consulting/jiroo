"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { createUserAction } from "@/app/actions/users";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/lib/toast";

export function UserCreateDialog() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function reset() {
    setName("");
    setEmail("");
    setPassword("");
    setError(null);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        // Keep the dialog open while a request is in flight (JIR-57).
        if (!nextOpen && pending) return;
        // Reset on open rather than on close so the fields do not blank
        // during the exit animation (JIR-64). The initial password alone is
        // dropped on close: it should not linger in state between openings.
        if (nextOpen) reset();
        else setPassword("");
        setOpen(nextOpen);
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <Plus className="size-4" />
          Nouvel utilisateur
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nouvel utilisateur</DialogTitle>
          <DialogDescription>
            Créez un compte sans accès aux backlogs. Attribuez ensuite ses accès par groupes et rôles.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            setError(null);
            startTransition(async () => {
              let result: Awaited<ReturnType<typeof createUserAction>>;
              try {
                result = await createUserAction({ name, email, password });
              } catch {
                setError("Création impossible.");
                return;
              }
              if (!result.ok) {
                setError(result.error);
                return;
              }
              setOpen(false);
              setPassword("");
              toast.success("Utilisateur créé.");
            });
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="new-user-name">Nom</Label>
            <Input
              id="new-user-name"
              value={name}
              autoComplete="name"
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-user-email">E-mail</Label>
            <Input
              id="new-user-email"
              type="email"
              value={email}
              autoComplete="email"
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-user-password">Mot de passe initial</Label>
            <Input
              id="new-user-password"
              type="password"
              value={password}
              autoComplete="new-password"
              onChange={(event) => setPassword(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">8 caractères minimum.</p>
          </div>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button
              aria-busy={pending}
              type="submit"
              disabled={pending || !name.trim() || !email.trim() || password.length < 8}
            >
              {pending ? "Création…" : "Créer l’utilisateur"}
            </Button>
          </DialogFooter>
        </form>
        <p className="text-sm text-muted-foreground">
          Aucun droit global ne sera attribué directement à ce compte ; il bénéficiera des droits accordés à tous les utilisateurs authentifiés. Ajoutez-le à un groupe (par exemple les administrateurs Jiroo) pour lui en donner d’autres.{" "}
          <Link href="/admin?tab=groups" className="underline">Ouvrir les groupes</Link>.
        </p>
      </DialogContent>
    </Dialog>
  );
}
