"use client";

import { useState, useTransition } from "react";
import { permissionHelperAction } from "@/app/actions/authorization";
import { Button } from "@/components/ui/button";
import { BACKLOG_PERMISSION_DEFINITIONS, type BacklogPermissionKey } from "@/lib/auth/permissions";

type HelperReason = { type: string; label?: string };
type HelperResult = { allowed: boolean; permission: string; reasons: HelperReason[] };

function reasonLabel(reason: HelperReason): string {
  switch (reason.type) {
    case "user_grant": return `Grant direct à ${reason.label ?? "l’utilisateur"}.`;
    case "group_grant": return `Membre du groupe ${reason.label ?? "inconnu"}.`;
    case "project_role_grant": return `Occupe le rôle ${reason.label ?? "inconnu"}.`;
    case "authenticated_user_grant": return "Grant pour tous les utilisateurs authentifiés.";
    case "missing_prerequisite": return "La permission « Consulter le backlog » est absente.";
    case "no_matching_grant": return "Aucun grant ne correspond.";
    case "platform_administrator": return "Administrateur de la plateforme : accès de récupération.";
    default: return "Raison d’autorisation indisponible.";
  }
}

export function PermissionHelper({ users, backlogs }: {
  users: Array<{ id: string; name: string }>;
  backlogs: Array<{ id: string; key: string; name: string }>;
}) {
  const [userId, setUserId] = useState("");
  const [backlogId, setBacklogId] = useState(backlogs[0]?.id ?? "");
  const [permission, setPermission] = useState<BacklogPermissionKey>("browse_backlog");
  const [result, setResult] = useState<HelperResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return <section className="space-y-4 rounded-xl border border-border p-4 bg-card" aria-labelledby="permission-helper-title">
    <div><h2 id="permission-helper-title" className="font-medium">Assistant de permissions</h2><p className="text-xs text-muted-foreground">Explique l’accès effectif avec des libellés métier.</p></div>
    <form aria-busy={pending} className="grid gap-2 md:grid-cols-3" onSubmit={(event) => { event.preventDefault(); setError(null); setResult(null); startTransition(async () => { let response: Awaited<ReturnType<typeof permissionHelperAction>>; try { response = await permissionHelperAction({ userId, backlogId, permission }); } catch { setError("Vérification impossible."); return; } if (!response.ok) setError(response.error); else setResult(response.result); }); }}>
      <select aria-label="Utilisateur à vérifier" value={userId} onChange={(e) => setUserId(e.target.value)} className="h-8 rounded-lg border bg-card px-2 text-sm"><option value="">Choisir un utilisateur…</option>{users.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}</select>
      <select aria-label="Backlog à vérifier" value={backlogId} onChange={(e) => setBacklogId(e.target.value)} className="h-8 rounded-lg border bg-card px-2 text-sm">{backlogs.map((backlog) => <option key={backlog.id} value={backlog.id}>{backlog.name} ({backlog.key})</option>)}</select>
      <select aria-label="Permission à vérifier" value={permission} onChange={(e) => setPermission(e.target.value as BacklogPermissionKey)} className="h-8 rounded-lg border bg-card px-2 text-sm">{Object.values(BACKLOG_PERMISSION_DEFINITIONS).map((definition) => <option key={definition.key} value={definition.key}>{definition.label}</option>)}</select>
      <Button className="md:col-span-3" type="submit" disabled={pending || !userId || !backlogId} aria-busy={pending}>Vérifier la permission</Button>
    </form>
    {error && <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
    {result && <div className="rounded-lg bg-muted/50 p-4"><h3 className="text-lg font-semibold">{result.allowed ? "Autorisé" : "Refusé"}</h3><ul className="mt-2 list-disc pl-5 text-sm">{result.reasons.map((reason, index) => <li key={`${reason.type}-${reason.label ?? index}`}>{reasonLabel(reason)}</li>)}</ul></div>}
  </section>;
}
