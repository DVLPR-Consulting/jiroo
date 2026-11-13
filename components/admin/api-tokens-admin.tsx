"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { revokeApiTokenAsAdministratorAction } from "@/app/actions/api-tokens";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/lib/toast";
import { API_TOKEN_PREFIX, type ApiTokenScope } from "@/lib/validation/api-token";

/** One live token as Administration shows it (JIR-161): never the secret nor its hash. */
export type AdministeredApiToken = {
  id: string;
  name: string;
  tokenPrefix: string;
  scope: ApiTokenScope;
  expiresAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
  owner: { name: string; email: string };
};

// WORDING: provisional until Codex's proposal (JIR-161); scope labels as on the personal page.
const SCOPE_LABELS: Record<ApiTokenScope, string> = { read: "Lecture", write: "Lecture et écriture" };

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR");
}

export function ApiTokensAdmin({ tokens, now }: { tokens: AdministeredApiToken[]; now: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [revoking, setRevoking] = useState<AdministeredApiToken | null>(null);
  const clock = Date.parse(now);

  function confirmRevoke(token: AdministeredApiToken) {
    startTransition(async () => {
      const result = await revokeApiTokenAsAdministratorAction({ id: token.id });
      setRevoking(null);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`Jeton « ${token.name} » de ${token.owner.name} révoqué.`);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4" data-slot="api-tokens-admin">
      <p className="t-sm text-muted-foreground">
        {tokens.length === 0
          ? "Aucun jeton actif."
          : `${tokens.length} ${tokens.length > 1 ? "jetons" : "jeton"}. Chaque utilisateur crée ses jetons depuis son menu ; un administrateur peut les révoquer ici.`}
      </p>

      {tokens.length > 0 && (
        <ul
          className="divide-y divide-border rounded-[var(--radius)] border border-border bg-card"
          aria-label="Jetons d’accès de tous les comptes"
        >
          {tokens.map((token) => {
            const expired = token.expiresAt !== null && Date.parse(token.expiresAt) <= clock;
            return (
              <li key={token.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
                <div className="min-w-0 flex-1 space-y-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="min-w-0 font-medium [overflow-wrap:anywhere]">{token.name}</span>
                    <Badge variant="outline">{SCOPE_LABELS[token.scope]}</Badge>
                    {expired && <Badge variant="destructive">Expiré</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">
                    {token.owner.name} · {token.owner.email}
                  </p>
                  <p className="font-mono text-xs text-muted-foreground">{API_TOKEN_PREFIX}{token.tokenPrefix}…</p>
                  <p className="text-xs text-muted-foreground">
                    {`Créé le ${formatDate(token.createdAt)} · `}
                    {token.expiresAt ? `${expired ? "Expiré" : "Expire"} le ${formatDate(token.expiresAt)}` : "Sans expiration"}
                    {" · "}
                    {token.lastUsedAt ? `Dernière utilisation le ${formatDate(token.lastUsedAt)}` : "Jamais utilisé"}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={pending}
                  onClick={() => setRevoking(token)}
                  aria-label={`Révoquer le jeton « ${token.name} » de ${token.owner.name}`}
                >
                  Révoquer
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      <Dialog open={revoking !== null} onOpenChange={(open) => { if (!open && !pending) setRevoking(null); }}>
        <DialogContent>
          {revoking && (
            <>
              <DialogHeader>
                <DialogTitle>Révoquer ce jeton ?</DialogTitle>
                <DialogDescription className="[overflow-wrap:anywhere]">
                  Le jeton « {revoking.name} » de {revoking.owner.name} ne permettra plus d’accéder à Jiroo.
                  Cette action est définitive et inscrite dans le journal de sécurité.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button type="button" variant="outline" disabled={pending} onClick={() => setRevoking(null)}>Annuler</Button>
                <Button type="button" variant="destructive" disabled={pending} onClick={() => confirmRevoke(revoking)}>
                  Révoquer
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
