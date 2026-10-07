"use client";

import { useState, useTransition } from "react";
import { createProjectRoleAction, deleteProjectRoleAction, updateProjectRoleAction } from "@/app/actions/authorization";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useRetainedWhileClosing } from "@/components/admin/use-retained-while-closing";

export type ProjectRoleAdminDto = { id: string; key: string; name: string; description: string | null; protected: boolean; occupancyCount: number; blockers: string[] };
export type ProjectRoleAdminProps = { roles: ProjectRoleAdminDto[] };

export function ProjectRoleAdmin({ roles }: ProjectRoleAdminProps) {
  const [drafts, setDrafts] = useState(() => Object.fromEntries(roles.map((role) => [role.id, { name: role.name, description: role.description ?? "" }])));
  const [create, setCreate] = useState({ name: "", description: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [deleting, setDeleting] = useState<ProjectRoleAdminDto | null>(null);
  const [deletionError, setDeletionError] = useState<string | null>(null);
  // Render the confirmation from the retained role, and leave its error in
  // place on close (it is cleared on open), so nothing blanks during the
  // exit animation (JIR-64).
  const shownDeleting = useRetainedWhileClosing(deleting);
  const [pending, startTransition] = useTransition();
  const run = (key: string, action: () => Promise<{ ok: boolean; error?: string }>, done?: () => void) => {
    setErrors((current) => ({ ...current, [key]: "" }));
    startTransition(async () => {
      let result: Awaited<ReturnType<typeof action>>;
      try {
        result = await action();
      } catch {
        setErrors((current) => ({ ...current, [key]: "Action impossible." }));
        return;
      }
      if (!result.ok) setErrors((current) => ({ ...current, [key]: result.error ?? "Action impossible." }));
      else done?.();
    });
  };
  const runDeletion = (role: ProjectRoleAdminDto) => {
    setDeletionError(null);
    startTransition(async () => {
      let result: Awaited<ReturnType<typeof deleteProjectRoleAction>>;
      try {
        result = await deleteProjectRoleAction({ projectRoleId: role.id });
      } catch {
        setDeletionError("Suppression impossible.");
        return;
      }
      if (!result.ok) {
        setDeletionError(result.error ?? "Action impossible.");
        return;
      }
      setDeleting(null);
    });
  };
  return <div className="space-y-4">
    <form className="grid gap-2 md:grid-cols-[1fr_1.5fr_auto]" aria-busy={pending} onSubmit={(e) => { e.preventDefault(); run("create", () => createProjectRoleAction({ name: create.name, description: create.description || null }), () => setCreate({ name: "", description: "" })); }}>
      <Input aria-label="Nom du nouveau rôle" value={create.name} onChange={(e) => setCreate((current) => ({ ...current, name: e.target.value }))} />
      <Input aria-label="Description du nouveau rôle" value={create.description} onChange={(e) => setCreate((current) => ({ ...current, description: e.target.value }))} />
      <Button type="submit" disabled={pending || !create.name.trim()} aria-busy={pending}>Créer le rôle</Button>
      {errors.create && <p role="alert" className="text-sm text-destructive md:col-span-3">{errors.create}</p>}
    </form>
    {roles.map((role) => { const draft = drafts[role.id] ?? { name: role.name, description: role.description ?? "" }; return <section role="region" aria-label={role.name} key={role.id} className="space-y-3 rounded-xl border p-4" aria-busy={pending}>
      <div className="flex gap-2"><Input aria-label="Nom du rôle" value={draft.name} disabled={role.protected || pending} onChange={(e) => setDrafts((current) => ({ ...current, [role.id]: { ...draft, name: e.target.value } }))} />{role.protected && <Badge variant="secondary">Rôle protégé</Badge>}<span className="whitespace-nowrap text-xs text-muted-foreground">{role.occupancyCount} affectation{role.occupancyCount > 1 ? "s" : ""}</span></div>
      <Input aria-label="Description du rôle" value={draft.description} disabled={role.protected || pending} onChange={(e) => setDrafts((current) => ({ ...current, [role.id]: { ...draft, description: e.target.value } }))} />
      <p className="text-sm text-muted-foreground">{role.description || "Aucune description"}</p>
      {role.blockers.length > 0 && <ul className="list-disc pl-5 text-xs text-muted-foreground">{role.blockers.map((blocker, index) => <li key={`${index}:${blocker}`}>{blocker}</li>)}</ul>}
      {errors[role.id] && <p role="alert" className="text-sm text-destructive">{errors[role.id]}</p>}
      {!role.protected && <div className="flex justify-end gap-2"><Button variant="outline" disabled={pending} onClick={() => run(role.id, () => updateProjectRoleAction({ projectRoleId: role.id, name: draft.name, description: draft.description || null }))}>Enregistrer le rôle</Button><Button variant="destructive" onClick={() => { setDeletionError(null); setDeleting(role); }} aria-label={`Supprimer ${role.name}`}>Supprimer</Button></div>}
    </section>; })}
    {roles.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">Aucun rôle de projet.</p>}
    <Dialog open={deleting !== null} onOpenChange={(open) => { if (!open && !pending) setDeleting(null); }}><DialogContent><DialogHeader><DialogTitle>Supprimer {shownDeleting?.name}</DialogTitle><DialogDescription>Vérifiez les usages avant de supprimer ce rôle.</DialogDescription></DialogHeader>{shownDeleting?.blockers.length ? <ul className="list-disc pl-5 text-sm">{shownDeleting.blockers.map((blocker, index) => <li key={`${index}:${blocker}`}>{blocker}</li>)}</ul> : null}{deletionError && <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{deletionError}</p>}<DialogFooter><Button variant="destructive" disabled={pending || Boolean(shownDeleting?.blockers.length)} aria-busy={pending} onClick={() => deleting && runDeletion(deleting)}>Confirmer la suppression</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}
