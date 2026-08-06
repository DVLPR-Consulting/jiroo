"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import {
  assignBacklogRoleActorAction,
  associatePermissionSchemeAction,
  moveBacklogRoleActorAction,
  removeBacklogRoleActorAction,
  setBacklogAccessModeAction,
} from "@/app/actions/authorization";
import type { AuthorizationGroupOption, AuthorizationUserOption } from "@/components/admin/global-permission-admin";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const LAST_ADMIN_MESSAGE = "Le dernier administrateur effectif du backlog ne peut pas être retiré.";

type OccupantPrincipal =
  | { type: "user"; id: string; label: string; email: string }
  | { type: "group"; id: string; label: string };
export type BacklogAccessDto = {
  backlog: { id: string; key: string; name: string };
  scheme: { id: string; name: string; version: number };
  mode: "simple" | "advanced";
  roles: Array<{
    id: string; key: string; name: string; description: string | null; protected: boolean;
    occupants: Array<{ actorId: string; principal: OccupantPrincipal; removalBlocked: boolean }>;
  }>;
};
export type AccessAdminProps = {
  access: BacklogAccessDto;
  users: AuthorizationUserOption[];
  groups: AuthorizationGroupOption[];
  schemes: Array<{ id: string; name: string; version: number; usageCount: number }>;
  canManageMembers: boolean;
  canAdministerBacklog: boolean;
  canAdministerJiroo: boolean;
  canBrowseUsers: boolean;
};

function actionPrincipal(principal: OccupantPrincipal) {
  return principal.type === "user"
    ? { type: "user" as const, userId: principal.id }
    : { type: "group" as const, groupId: principal.id };
}

export function AccessAdmin({ access, users, groups, schemes, canManageMembers, canAdministerBacklog, canAdministerJiroo, canBrowseUsers }: AccessAdminProps) {
  const [mode, setMode] = useState(access.mode);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [additions, setAdditions] = useState<Record<string, { type: "user" | "group"; id: string }>>({});
  const protectedRoles = access.roles.filter((role) => ["administrators", "members", "viewers"].includes(role.key));
  const [simplePrincipal, setSimplePrincipal] = useState("");
  const [simpleRoleId, setSimpleRoleId] = useState(() => protectedRoles.find((role) => role.key === "members")?.id ?? protectedRoles[0]?.id ?? "");
  const run = (action: () => Promise<{ ok: boolean; error?: string }>, success?: () => void) => {
    setError(null);
    startTransition(async () => { const result = await action(); if (!result.ok) setError(result.error ?? "Action impossible."); else success?.(); });
  };
  const changeMode = (next: "simple" | "advanced") => run(
    () => setBacklogAccessModeAction({ backlogId: access.backlog.id, mode: next }),
    () => setMode(next),
  );

  return <div className="space-y-5" aria-busy={pending}>
    <div className="flex gap-2" role="group" aria-label="Mode d’administration des accès">
      <Button variant={mode === "simple" ? "default" : "outline"} disabled={!canAdministerBacklog || pending} onClick={() => changeMode("simple")}>Mode Simple</Button>
      <Button variant={mode === "advanced" ? "default" : "outline"} disabled={!canAdministerBacklog || pending} onClick={() => changeMode("advanced")}>Mode Avancé</Button>
    </div>
    {error && <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}

    {mode === "simple" ? <section className="space-y-3"><h2 className="text-lg font-medium">Accès simple</h2><p className="text-sm text-muted-foreground">Attribuez les utilisateurs et groupes aux trois rôles protégés.</p>
      <div className="divide-y rounded-xl border">{protectedRoles.flatMap((role) => role.occupants.map((occupant) => <div key={occupant.actorId} className="flex items-center gap-3 p-3"><div className="min-w-0 flex-1"><p className="font-medium">{occupant.principal.label}</p><p className="text-xs text-muted-foreground">{occupant.principal.type === "user" ? occupant.principal.email : "Groupe"}</p></div><select aria-label={`Rôle de ${occupant.principal.label}`} aria-describedby={occupant.removalBlocked ? `last-admin-${occupant.actorId}` : undefined} disabled={!canManageMembers || pending || occupant.removalBlocked} value={role.id} onChange={(event) => { const targetRoleId = event.target.value; const target = protectedRoles.find((candidate) => candidate.id === targetRoleId); if (!target) return; run(() => moveBacklogRoleActorAction({ backlogId: access.backlog.id, sourceProjectRoleId: role.id, targetProjectRoleId: target.id, principal: actionPrincipal(occupant.principal) })); }} className="h-8 rounded-lg border bg-background px-2 text-sm">{protectedRoles.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}</select>{occupant.removalBlocked && <span id={`last-admin-${occupant.actorId}`} className="max-w-52 text-xs text-muted-foreground">{LAST_ADMIN_MESSAGE}</span>}</div>))}</div>
      {canManageMembers && <div className="flex flex-wrap gap-2"><select aria-label={canBrowseUsers ? "Ajouter un utilisateur ou groupe" : "Ajouter un groupe"} value={simplePrincipal} onChange={(event) => setSimplePrincipal(event.target.value)} className="h-8 min-w-52 flex-1 rounded-lg border bg-background px-2 text-sm"><option value="">Choisir…</option>{canBrowseUsers && <optgroup label="Utilisateurs">{users.map((candidate) => <option key={`user:${candidate.id}`} value={`user:${candidate.id}`}>{candidate.name}</option>)}</optgroup>}<optgroup label="Groupes">{groups.map((candidate) => <option key={`group:${candidate.id}`} value={`group:${candidate.id}`}>{candidate.name}</option>)}</optgroup></select><select aria-label="Rôle initial" value={simpleRoleId} onChange={(event) => setSimpleRoleId(event.target.value)} className="h-8 rounded-lg border bg-background px-2 text-sm">{protectedRoles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</select><Button disabled={pending || !simplePrincipal || !simpleRoleId} onClick={() => { const separator = simplePrincipal.indexOf(":"); const type = simplePrincipal.slice(0, separator); const id = simplePrincipal.slice(separator + 1); const principal = type === "user" ? { type: "user" as const, userId: id } : { type: "group" as const, groupId: id }; run(() => assignBacklogRoleActorAction({ backlogId: access.backlog.id, projectRoleId: simpleRoleId, principal }), () => setSimplePrincipal("")); }}>Ajouter à l’accès simple</Button></div>}
    </section> : <section className="space-y-5"><div><h2 className="text-lg font-medium">Accès avancé</h2><p className="text-sm text-muted-foreground">Gérez le schéma et les occupants des rôles de ce backlog.</p></div>
      <section className="space-y-2 rounded-xl border p-4"><div className="flex flex-wrap items-center gap-2"><h3 className="font-medium">Schéma associé</h3><Badge variant="secondary">Version {access.scheme.version}</Badge>{canAdministerJiroo && <Link className="ml-auto text-sm underline" href={`/admin?tab=schemes&scheme=${access.scheme.id}`}>Ouvrir la matrice</Link>}</div><p className="text-sm">{access.scheme.name}</p>{canAdministerBacklog && <select aria-label="Schéma de permissions" value={access.scheme.id} disabled={pending} onChange={(event) => run(() => associatePermissionSchemeAction({ backlogId: access.backlog.id, schemeId: event.target.value }))} className="h-8 w-full rounded-lg border bg-background px-2 text-sm">{schemes.map((scheme) => <option key={scheme.id} value={scheme.id}>{scheme.name}{scheme.usageCount > 1 ? ` (${scheme.usageCount} backlogs)` : ""}</option>)}</select>}</section>
      <div className="space-y-3">{access.roles.map((role) => { const addition = additions[role.id] ?? { type: canBrowseUsers ? "user" as const : "group" as const, id: "" }; const candidates = addition.type === "user" ? users : groups; return <section key={role.id} role="region" aria-label={role.name} className="space-y-3 rounded-xl border p-4"><div className="flex items-center gap-2"><h3 className="font-medium">{role.name}</h3>{role.protected && <Badge variant="secondary">Rôle protégé</Badge>}</div>{role.description && <p className="text-sm text-muted-foreground">{role.description}</p>}<ul className="space-y-1">{role.occupants.map((occupant) => <li key={occupant.actorId} className="flex items-center gap-2 text-sm"><span>{occupant.principal.label}</span><span className="text-muted-foreground">{occupant.principal.type === "user" ? "Utilisateur" : "Groupe"}</span>{canManageMembers && <Button className="ml-auto" size="xs" variant="ghost" disabled={pending || occupant.removalBlocked} aria-describedby={occupant.removalBlocked ? `advanced-last-admin-${occupant.actorId}` : undefined} onClick={() => run(() => removeBacklogRoleActorAction({ backlogId: access.backlog.id, projectRoleId: role.id, principal: actionPrincipal(occupant.principal) }))} aria-label={`Retirer ${occupant.principal.label}`}>Retirer</Button>}{occupant.removalBlocked && <span id={`advanced-last-admin-${occupant.actorId}`} className="sr-only">{LAST_ADMIN_MESSAGE}</span>}</li>)}</ul>{canManageMembers && <div className="flex gap-2"><select aria-label={`Type d’occupant pour ${role.name}`} value={addition.type} onChange={(event) => setAdditions((current) => ({ ...current, [role.id]: { type: event.target.value as "user" | "group", id: "" } }))} className="h-8 rounded-lg border bg-background px-2 text-sm">{canBrowseUsers && <option value="user">Utilisateur</option>}<option value="group">Groupe</option></select><select aria-label={`Ajouter un occupant à ${role.name}`} value={addition.id} onChange={(event) => setAdditions((current) => ({ ...current, [role.id]: { ...addition, id: event.target.value } }))} className="h-8 flex-1 rounded-lg border bg-background px-2 text-sm"><option value="">Choisir…</option>{candidates.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}</select><Button size="sm" disabled={pending || !addition.id} onClick={() => { const principal = addition.type === "user" ? { type: "user" as const, userId: addition.id } : { type: "group" as const, groupId: addition.id }; run(() => assignBacklogRoleActorAction({ backlogId: access.backlog.id, projectRoleId: role.id, principal }), () => setAdditions((current) => ({ ...current, [role.id]: { ...addition, id: "" } }))); }}>Ajouter</Button></div>}</section>; })}</div>
    </section>}
  </div>;
}
