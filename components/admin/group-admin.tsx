"use client";

import { useState, useTransition } from "react";
import {
  addGroupMemberAction, createGroupAction, deleteGroupAction, removeGroupMemberAction, renameGroupAction,
} from "@/app/actions/authorization";
import { GlobalPermissionAdmin, type AuthorizationUserOption, type GlobalGrantDto } from "@/components/admin/global-permission-admin";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useRetainedWhileClosing } from "@/components/admin/use-retained-while-closing";

export type GroupAdminDto = {
  id: string; name: string; protected: boolean; memberCount: number;
  members: AuthorizationUserOption[]; blockers: string[];
  membershipRequiresPlatformAdmin: boolean;
};
export type GroupAdminProps = {
  groups: GroupAdminDto[];
  users: Array<AuthorizationUserOption & { role?: string }>;
  globalGrants: GlobalGrantDto[];
  canAdministerGlobals: boolean;
};

export function GroupAdmin({ groups, users, globalGrants, canAdministerGlobals }: GroupAdminProps) {
  const [newName, setNewName] = useState("");
  const [names, setNames] = useState<Record<string, string>>(() => Object.fromEntries(groups.map((group) => [group.id, group.name])));
  const [selectedUsers, setSelectedUsers] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<GroupAdminDto | null>(null);
  const [deletionError, setDeletionError] = useState<string | null>(null);
  // Render the confirmation from the retained group, and leave its error in
  // place on close (it is cleared on open), so nothing blanks during the
  // exit animation (JIR-64).
  const shownDeleting = useRetainedWhileClosing(deleting);
  const [pending, startTransition] = useTransition();
  const run = (action: () => Promise<{ ok: boolean; error?: string }>, onSuccess?: () => void) => {
    setError(null);
    startTransition(async () => {
      try {
        const result = await action();
        if (!result.ok) setError(result.error ?? "Action impossible.");
        else onSuccess?.();
      } catch {
        setError("Action impossible.");
      }
    });
  };
  const runDeletion = (group: GroupAdminDto) => {
    setDeletionError(null);
    startTransition(async () => {
      try {
        const result = await deleteGroupAction({ groupId: group.id });
        if (!result.ok) {
          setDeletionError(result.error ?? "Action impossible.");
          return;
        }
        setDeleting(null);
      } catch {
        setDeletionError("Suppression impossible.");
      }
    });
  };

  return <div className="space-y-6">
    <form aria-busy={pending} className="flex gap-2" onSubmit={(event) => { event.preventDefault(); run(() => createGroupAction({ name: newName }), () => setNewName("")); }}>
      <Input aria-label="Nom du nouveau groupe" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Nouveau groupe" />
      <Button type="submit" disabled={pending || !newName.trim()} aria-busy={pending}>Créer le groupe</Button>
    </form>
    {error && <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
    <div className="space-y-3">
      {groups.map((group) => {
        const available = users.filter((candidate) => !group.members.some((member) => member.id === candidate.id));
        const selected = selectedUsers[group.id] ?? "";
        const selectedLabel = users.find((candidate) => candidate.id === selected)?.name ?? "ce membre";
        const canManageMembership =
          !group.membershipRequiresPlatformAdmin || canAdministerGlobals;
        return <section role="region" aria-label={group.name} key={group.id} className="space-y-3 rounded-xl border border-border p-4" aria-busy={pending}>
          <div className="flex items-center gap-2">
            <Input aria-label="Nom du groupe" value={names[group.id] ?? group.name} disabled={group.protected || pending} onChange={(e) => setNames((current) => ({ ...current, [group.id]: e.target.value }))} />
            <Button size="sm" variant="outline" disabled={group.protected || pending} onClick={() => run(() => renameGroupAction({ groupId: group.id, name: names[group.id] ?? group.name }))}>Renommer</Button>
            {group.protected && <Badge variant="secondary">Groupe protégé</Badge>}
            {!group.protected && <Button className="ml-auto" size="sm" variant="destructive" onClick={() => { setDeletionError(null); setDeleting(group); }}>Supprimer le groupe</Button>}
          </div>
          <p className="text-xs text-muted-foreground">{group.memberCount} membre{group.memberCount > 1 ? "s" : ""}</p>
          <ul className="space-y-1">{group.members.map((member) => <li key={member.id} className="flex items-center gap-2 text-sm"><span>{member.name}</span>{canManageMembership && <Button className="ml-auto" size="xs" variant="ghost" disabled={pending} onClick={() => run(() => removeGroupMemberAction({ groupId: group.id, userId: member.id }))} aria-label={`Retirer ${member.name}`}>Retirer</Button>}</li>)}</ul>
          {canManageMembership && <div className="flex gap-2">
            <select aria-label="Ajouter un membre" value={selected} onChange={(e) => setSelectedUsers((current) => ({ ...current, [group.id]: e.target.value }))} className="h-8 flex-1 rounded-lg border border-input bg-background px-2 text-sm"><option value="">Choisir…</option>{available.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}</select>
            <Button size="sm" disabled={!selected || pending} onClick={() => run(() => addGroupMemberAction({ groupId: group.id, userId: selected }), () => setSelectedUsers((current) => ({ ...current, [group.id]: "" })))} aria-label={`Ajouter ${selectedLabel}`}>Ajouter</Button>
          </div>}
          {group.blockers.length > 0 && <ul className="list-disc pl-5 text-xs text-muted-foreground">{group.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul>}
        </section>;
      })}
      {groups.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">Aucun groupe.</p>}
    </div>
    <GlobalPermissionAdmin grants={globalGrants} users={users} groups={groups} canManage={canAdministerGlobals} />
    <Dialog open={deleting !== null} onOpenChange={(open) => { if (!open && !pending) setDeleting(null); }}><DialogContent><DialogHeader><DialogTitle>Supprimer {shownDeleting?.name}</DialogTitle><DialogDescription>Cette suppression est définitive.</DialogDescription></DialogHeader>{shownDeleting?.blockers.length ? <ul className="list-disc pl-5 text-sm">{shownDeleting.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul> : null}{deletionError && <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{deletionError}</p>}<DialogFooter><Button variant="destructive" disabled={pending || Boolean(shownDeleting?.blockers.length)} aria-busy={pending} onClick={() => deleting && runDeletion(deleting)}>Confirmer la suppression</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}
