"use client";

import { backlogRoleLabel } from "@/lib/items/users";

import { useMemo, useState, useTransition } from "react";
import {
  addSchemeGrantAction,
  clonePermissionSchemeAction,
  removeSchemeGrantAction,
} from "@/app/actions/authorization";
import type { AuthorizationGroupOption, AuthorizationUserOption } from "@/components/admin/global-permission-admin";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useRetainedWhileClosing } from "@/components/admin/use-retained-while-closing";
import { BACKLOG_PERMISSION_DEFINITIONS, type BacklogPermissionKey } from "@/lib/auth/permissions";

type SchemePrincipal = { type: "user" | "group" | "project_role" | "authenticated_user"; id: string; label: string };
export type PermissionSchemeGrantDto = { id: string; permission: string; permissionLabel: string; category: string; principal: SchemePrincipal };
export type PermissionSchemeAdminDto = {
  id: string; name: string; description: string | null; protected: boolean; version: number; usageCount: number;
  affectedBacklogs: Array<{ id: string; key: string; name: string }>;
  grants: PermissionSchemeGrantDto[];
};
export type PermissionSchemeAdminProps = {
  schemes: PermissionSchemeAdminDto[];
  users: AuthorizationUserOption[];
  groups: AuthorizationGroupOption[];
  roles: Array<{ id: string; name: string; key?: string }>;
  initialSchemeId?: string;
};

type StagedChange =
  | { type: "remove"; scheme: PermissionSchemeAdminDto; grantId: string }
  | { type: "add"; scheme: PermissionSchemeAdminDto; permission: BacklogPermissionKey; principal: { type: "user"; userId: string } | { type: "group"; groupId: string } | { type: "project_role"; projectRoleId: string } | { type: "authenticated_user" } };

function categoryForPermission(key: BacklogPermissionKey): string {
  if (["browse_backlog", "administer_backlog", "manage_members"].includes(key)) return "Accès";
  if (["manage_workflows", "manage_sprints", "manage_releases"].includes(key)) return "Administration du backlog";
  if (key.includes("comments")) return "Commentaires";
  if (key.includes("views")) return "Vues";
  return "Éléments";
}

const MATRIX_ROWS = Object.values(BACKLOG_PERMISSION_DEFINITIONS).map((definition) => ({
  ...definition,
  category: categoryForPermission(definition.key as BacklogPermissionKey),
}));
const MATRIX_CATEGORIES = [...new Set(MATRIX_ROWS.map((row) => row.category))];

function affectedBacklogIds(scheme: PermissionSchemeAdminDto): string[] {
  return scheme.affectedBacklogs.map((backlog) => backlog.id).sort();
}

function isKnownPermission(permission: string): permission is BacklogPermissionKey {
  return Object.prototype.hasOwnProperty.call(BACKLOG_PERMISSION_DEFINITIONS, permission);
}

export function PermissionSchemeAdmin({ schemes, users, groups, roles, initialSchemeId }: PermissionSchemeAdminProps) {
  const [matrix, setMatrix] = useState<PermissionSchemeAdminDto | null>(() => schemes.find((scheme) => scheme.id === initialSchemeId) ?? null);
  const [clone, setClone] = useState<PermissionSchemeAdminDto | null>(null);
  const [cloneName, setCloneName] = useState("");
  const [cloneDescription, setCloneDescription] = useState("");
  const [principalType, setPrincipalType] = useState<SchemePrincipal["type"]>("user");
  const [principalSearch, setPrincipalSearch] = useState("");
  const [projectRoleId, setProjectRoleId] = useState("");
  const [permission, setPermission] = useState<BacklogPermissionKey>("browse_backlog");
  const [staged, setStaged] = useState<StagedChange | null>(null);
  const [matrixError, setMatrixError] = useState<string | null>(null);
  const [cloneError, setCloneError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // Render the matrix and the shared-scheme confirmation from retained
  // values so their content does not blank during the exit animation (JIR-64).
  const shownMatrix = useRetainedWhileClosing(matrix);
  const shownStaged = useRetainedWhileClosing(staged);

  const principalOptions = useMemo(() => {
    if (principalType === "user") return users.map((entry) => ({ id: entry.id, label: entry.name }));
    if (principalType === "group") return groups.map((entry) => ({ id: entry.id, label: entry.name }));
    if (principalType === "project_role") return roles.map((entry) => ({
      id: entry.id,
      label: entry.key === "administrators" ? `${backlogRoleLabel(entry)} (rôle protégé)` : entry.name,
    }));
    return [{ id: "authenticated_user", label: "Tous les utilisateurs authentifiés" }];
  }, [groups, principalType, roles, users]);

  const principalLabel = (principal: SchemePrincipal) => principal.type === "project_role"
    ? backlogRoleLabel(roles.find((role) => role.id === principal.id) ?? { name: principal.label })
    : principal.label;

  const execute = (change: StagedChange) => {
    setMatrixError(null);
    startTransition(async () => {
      let result: Awaited<ReturnType<typeof removeSchemeGrantAction | typeof addSchemeGrantAction>>;
      try {
        result = change.type === "remove"
          ? await removeSchemeGrantAction({ schemeId: change.scheme.id, grantId: change.grantId, expectedVersion: change.scheme.version, expectedAffectedBacklogIds: affectedBacklogIds(change.scheme) })
          : await addSchemeGrantAction({ schemeId: change.scheme.id, permission: change.permission, principal: change.principal, expectedVersion: change.scheme.version, expectedAffectedBacklogIds: affectedBacklogIds(change.scheme) });
      } catch {
        setStaged(null);
        setMatrixError("Modification impossible.");
        return;
      }
      if (!result.ok) {
        if ("confirmationRequired" in result && result.confirmationRequired) {
          const refreshedScheme = {
            ...change.scheme,
            usageCount: result.affectedBacklogs.length,
            affectedBacklogs: result.affectedBacklogs,
          };
          setMatrix((current) => current?.id === refreshedScheme.id ? refreshedScheme : current);
          setStaged({ ...change, scheme: refreshedScheme });
          return;
        }
        setStaged(null);
        setMatrixError(result.error);
        return;
      }
      setStaged(null);
      setMatrix((current) => {
        if (!current || current.id !== change.scheme.id) return current;
        if (change.type === "remove") {
          return {
            ...current,
            version: result.grant.version,
            grants: current.grants.filter((grant) => grant.id !== change.grantId),
          };
        }
        const principalInput = change.principal;
        let principal: SchemePrincipal;
        if (principalInput.type === "user") {
          const id = principalInput.userId;
          principal = { type: "user", id, label: users.find((entry) => entry.id === id)?.name ?? "Utilisateur" };
        } else if (principalInput.type === "group") {
          const id = principalInput.groupId;
          principal = { type: "group", id, label: groups.find((entry) => entry.id === id)?.name ?? "Groupe" };
        } else if (principalInput.type === "project_role") {
          const id = principalInput.projectRoleId;
          principal = { type: "project_role", id, label: backlogRoleLabel(roles.find((entry) => entry.id === id) ?? { name: "Rôle de projet" }) };
        } else {
          principal = { type: "authenticated_user", id: "authenticated_user", label: "Tous les utilisateurs authentifiés" };
        }
        const definition = BACKLOG_PERMISSION_DEFINITIONS[change.permission];
        return {
          ...current,
          version: result.grant.version,
          grants: [...current.grants, {
            id: result.grant.id,
            permission: change.permission,
            permissionLabel: definition.label,
            category: categoryForPermission(change.permission),
            principal,
          }],
        };
      });
    });
  };
  const requestChange = (change: StagedChange) => {
    // The matrix content stays mounted from its retained value during the
    // exit animation; a change requested from it once closed is ignored.
    if (matrix === null) return;
    if (change.scheme.usageCount > 1) setStaged(change); else execute(change);
  };

  return <div className="space-y-3">
    {schemes.map((scheme) => <section key={scheme.id} className="space-y-3 rounded-xl border border-border p-4 bg-card">
      <div className="flex flex-wrap items-center gap-2"><h2 className="font-medium">{scheme.name}</h2>{scheme.protected && <Badge variant="secondary">Schéma protégé</Badge>}<span className="text-xs text-muted-foreground">Version {scheme.version}</span><span className="text-xs text-muted-foreground">{scheme.usageCount} backlog{scheme.usageCount > 1 ? "s" : ""}</span></div>
      <p className="text-sm text-muted-foreground">{scheme.description || "Aucune description"}</p>
      <ul className="text-xs text-muted-foreground">{scheme.affectedBacklogs.map((backlog) => <li key={backlog.id}>{backlog.name} ({backlog.key})</li>)}</ul>
      <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => { setClone(scheme); setCloneName(`${scheme.name} — copie`); setCloneDescription(scheme.description ?? ""); }} aria-label={`Cloner ${scheme.name}`}>Cloner</Button><Button onClick={() => { setMatrix(scheme); setMatrixError(null); }} aria-label={`Modifier la matrice de ${scheme.name}`}>Modifier la matrice</Button></div>
    </section>)}
    {schemes.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">Aucun schéma de permissions.</p>}

    <Dialog open={matrix !== null} onOpenChange={(open) => { if (!open && !pending) setMatrix(null); }}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>Matrice de {shownMatrix?.name}</DialogTitle><DialogDescription>Les grants sont additifs. La consultation du backlog reste un prérequis.</DialogDescription></DialogHeader>
      {shownMatrix && <div className="space-y-5">
        <Badge variant="secondary">Version {shownMatrix.version}</Badge>
        {MATRIX_CATEGORIES.map((category) => <section key={category} className="space-y-2"><h3 className="font-medium">{category}</h3><div className="space-y-2">{MATRIX_ROWS.filter((row) => row.category === category).map((row) => { const rowGrants = shownMatrix.grants.filter((grant) => grant.permission === row.key); return <div key={row.key} className="flex flex-wrap items-center gap-2 text-sm"><span className="min-w-44">{row.label}</span>{rowGrants.length === 0 ? <span className="text-xs text-muted-foreground">Aucun grant</span> : rowGrants.map((grant) => <span key={grant.id} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1">{principalLabel(grant.principal)}<button type="button" className="rounded px-1 hover:bg-background" aria-label={`Retirer ${principalLabel(grant.principal)} de ${row.label}`} onClick={() => requestChange({ type: "remove", scheme: shownMatrix, grantId: grant.id })}>×</button></span>)}</div>; })}</div></section>)}
        {shownMatrix.grants.some((grant) => !isKnownPermission(grant.permission)) && <section role="region" aria-labelledby={`invalid-configuration-${shownMatrix.id}`} className="space-y-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3"><h3 id={`invalid-configuration-${shownMatrix.id}`} className="font-medium text-destructive">Configuration invalide</h3><p className="text-xs text-muted-foreground">Ces permissions ne figurent plus dans le catalogue et doivent être retirées.</p><ul className="space-y-2">{shownMatrix.grants.filter((grant) => !isKnownPermission(grant.permission)).map((grant) => <li key={grant.id} className="flex flex-wrap items-center gap-2 text-sm"><code>{grant.permission}</code><span>{principalLabel(grant.principal)}</span><Button size="xs" variant="outline" aria-label={`Retirer ${principalLabel(grant.principal)} de ${grant.permission}`} onClick={() => requestChange({ type: "remove", scheme: shownMatrix, grantId: grant.id })}>Retirer</Button></li>)}</ul></section>}
        <form aria-busy={pending} className="grid gap-2 md:grid-cols-2" onSubmit={(event) => { event.preventDefault(); const found = principalType === "project_role" ? principalOptions.find((entry) => entry.id === projectRoleId) : principalOptions.find((entry) => entry.label.toLocaleLowerCase("fr") === principalSearch.trim().toLocaleLowerCase("fr")) ?? (principalType === "authenticated_user" ? principalOptions[0] : undefined); if (!found) { setMatrixError("Sélectionnez un principal proposé."); return; } const principal = principalType === "user" ? { type: "user" as const, userId: found.id } : principalType === "group" ? { type: "group" as const, groupId: found.id } : principalType === "project_role" ? { type: "project_role" as const, projectRoleId: found.id } : { type: "authenticated_user" as const }; requestChange({ type: "add", scheme: shownMatrix, permission, principal }); }}>
          <select aria-label="Permission de backlog" value={permission} onChange={(e) => setPermission(e.target.value as BacklogPermissionKey)} className="h-8 rounded-lg border bg-card px-2 text-sm">{Object.values(BACKLOG_PERMISSION_DEFINITIONS).map((definition) => <option key={definition.key} value={definition.key}>{definition.label}</option>)}</select>
          <select aria-label="Type de principal" value={principalType} onChange={(e) => { const type = e.target.value as SchemePrincipal["type"]; setPrincipalType(type); setProjectRoleId(""); setPrincipalSearch(type === "authenticated_user" ? "Tous les utilisateurs authentifiés" : ""); }} className="h-8 rounded-lg border bg-card px-2 text-sm"><option value="user">Utilisateur</option><option value="group">Groupe</option><option value="project_role">Rôle de projet</option><option value="authenticated_user">Utilisateur authentifié</option></select>
          {principalType === "project_role" ? (
            <select aria-label="Rôle de backlog" value={projectRoleId} onChange={(event) => setProjectRoleId(event.target.value)} className="h-8 rounded-lg border bg-card px-2 text-sm">
              <option value="">Choisir un rôle…</option>
              {principalOptions.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}
            </select>
          ) : (
            <><Input role="combobox" aria-label="Rechercher un principal" list="scheme-principals" value={principalSearch} onChange={(e) => setPrincipalSearch(e.target.value)} /><datalist id="scheme-principals">{principalOptions.map((entry) => <option key={entry.id} value={entry.label} />)}</datalist></>
          )}
          <Button type="submit" disabled={pending} aria-busy={pending}>Ajouter le grant</Button>
        </form>
        {matrixError && <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{matrixError}</p>}
      </div>}
    </DialogContent></Dialog>

    <Dialog open={staged !== null} onOpenChange={(open) => !open && !pending && setStaged(null)}><DialogContent><DialogHeader><DialogTitle>Modifier un schéma partagé</DialogTitle><DialogDescription>Cette modification affectera tous les backlogs ci-dessous.</DialogDescription></DialogHeader><ul className="text-sm">{shownStaged?.scheme.affectedBacklogs.map((backlog) => <li key={backlog.id}>{backlog.name} ({backlog.key})</li>)}</ul><DialogFooter><Button disabled={pending} aria-busy={pending} onClick={() => staged && execute(staged)}>Confirmer la modification</Button></DialogFooter></DialogContent></Dialog>

    <Dialog open={clone !== null} onOpenChange={(open) => { if (!open && !pending) setClone(null); }}><DialogContent><DialogHeader><DialogTitle>Cloner le schéma</DialogTitle><DialogDescription>Le clone reçoit la même matrice et n’est associé à aucun backlog.</DialogDescription></DialogHeader><Input aria-label="Nom du clone" value={cloneName} onChange={(e) => setCloneName(e.target.value)} /><Input aria-label="Description du clone" value={cloneDescription} onChange={(e) => setCloneDescription(e.target.value)} />{cloneError && <p role="alert" className="text-sm text-destructive">{cloneError}</p>}<DialogFooter><Button disabled={pending || !cloneName.trim()} aria-busy={pending} onClick={() => { if (!clone) return; setCloneError(null); startTransition(async () => { let result: Awaited<ReturnType<typeof clonePermissionSchemeAction>>; try { result = await clonePermissionSchemeAction({ sourceSchemeId: clone.id, name: cloneName, description: cloneDescription || null }); } catch { setCloneError("Clonage impossible."); return; } if (!result.ok) setCloneError(result.error); else setClone(null); }); }}>Cloner</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}
