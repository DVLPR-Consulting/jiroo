"use client";

import { useState, useTransition } from "react";
import {
  addGlobalPermissionGrantAction,
  removeGlobalPermissionGrantAction,
} from "@/app/actions/authorization";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { GLOBAL_PERMISSION_DEFINITIONS, type GlobalPermissionKey } from "@/lib/auth/permissions";

export type AuthorizationUserOption = { id: string; name: string };
export type AuthorizationGroupOption = { id: string; name: string };
export type GlobalGrantDto = {
  id: string;
  permission: string;
  permissionLabel: string;
  principal: { type: "user" | "group"; id: string; label: string };
};

export function GlobalPermissionAdmin({ grants, users, groups, canManage }: {
  grants: GlobalGrantDto[];
  users: AuthorizationUserOption[];
  groups: AuthorizationGroupOption[];
  canManage: boolean;
}) {
  const [permission, setPermission] = useState<GlobalPermissionKey>("browse_users");
  const [principalType, setPrincipalType] = useState<"user" | "group">("user");
  const [principalId, setPrincipalId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<GlobalGrantDto | null>(null);
  // The remove confirmation owns its error: an add-form error must never
  // surface in it, and it starts clean on every open (JIR-64).
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const options = principalType === "user" ? users : groups;

  return (
    <section aria-labelledby="global-permissions-title" className="space-y-3 rounded-xl border border-border p-4">
      <div>
        <h2 id="global-permissions-title" className="font-medium">Permissions globales</h2>
        <p className="text-xs text-muted-foreground">Les permissions s’additionnent entre utilisateurs et groupes.</p>
      </div>
      <ul className="space-y-2">
        {grants.map((grant) => (
          <li key={grant.id} className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2 text-sm">
            <span className="font-medium">{grant.permissionLabel}</span>
            <span className="text-muted-foreground">{grant.principal.label}</span>
            {canManage && (
              <Button className="ml-auto" size="sm" variant="ghost" onClick={() => { setRemoveError(null); setRemoving(grant); }} disabled={pending}
                aria-label={`Retirer ${grant.permissionLabel} pour ${grant.principal.label}`}>
                Retirer
              </Button>
            )}
          </li>
        ))}
        {grants.length === 0 && <li className="text-sm text-muted-foreground">Aucune permission globale attribuée.</li>}
      </ul>
      {canManage && (
        <form aria-busy={pending} className="grid gap-2 md:grid-cols-[1fr_0.8fr_1fr_auto]" onSubmit={(event) => {
          event.preventDefault();
          setError(null);
          startTransition(async () => {
            const principal = principalType === "user"
              ? { type: "user" as const, userId: principalId }
              : { type: "group" as const, groupId: principalId };
            try {
              const result = await addGlobalPermissionGrantAction({ permission, principal });
              if (!result.ok) setError(result.error);
              else setPrincipalId("");
            } catch {
              setError("Ajout impossible.");
            }
          });
        }}>
          <select aria-label="Permission globale" value={permission} onChange={(e) => setPermission(e.target.value as GlobalPermissionKey)} className="h-8 rounded-lg border border-input bg-background px-2 text-sm">
            {Object.values(GLOBAL_PERMISSION_DEFINITIONS).map((definition) => <option key={definition.key} value={definition.key}>{definition.label}</option>)}
          </select>
          <select aria-label="Type de principal" value={principalType} onChange={(e) => { setPrincipalType(e.target.value as "user" | "group"); setPrincipalId(""); }} className="h-8 rounded-lg border border-input bg-background px-2 text-sm">
            <option value="user">Utilisateur</option><option value="group">Groupe</option>
          </select>
          <select aria-label="Principal" value={principalId} onChange={(e) => setPrincipalId(e.target.value)} className="h-8 rounded-lg border border-input bg-background px-2 text-sm">
            <option value="">Choisir…</option>
            {options.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
          </select>
          <Button type="submit" disabled={pending || !principalId} aria-busy={pending}>Ajouter la permission</Button>
          {error && <p role="alert" className="text-sm text-destructive md:col-span-4">{error}</p>}
        </form>
      )}
      <Dialog open={removing !== null} onOpenChange={(open) => { if (!open && !pending) setRemoving(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Retirer la permission globale</DialogTitle><DialogDescription>Cette modification prend effet immédiatement.</DialogDescription></DialogHeader>
          {removeError && <p role="alert" className="text-sm text-destructive">{removeError}</p>}
          <DialogFooter>
            <Button variant="destructive" disabled={pending} aria-busy={pending} onClick={() => {
              if (!removing) return;
              setRemoveError(null);
              startTransition(async () => {
                try {
                  const result = await removeGlobalPermissionGrantAction({ grantId: removing.id });
                  if (!result.ok) setRemoveError(result.error); else setRemoving(null);
                } catch {
                  setRemoveError("Retrait impossible.");
                }
              });
            }}>Confirmer le retrait</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
