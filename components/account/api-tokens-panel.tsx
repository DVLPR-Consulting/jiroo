"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy, Plus } from "lucide-react";
import { createApiTokenAction, revokeApiTokenAction } from "@/app/actions/api-tokens";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectField } from "@/components/ui/select";
import { API_TOKEN_PREFIX } from "@/lib/services/api-tokens";
import { toast } from "@/lib/toast";
import {
  API_TOKEN_NAME_MAX,
  type ApiTokenExpiryDays,
  type ApiTokenScope,
} from "@/lib/validation/api-token";

export type ApiTokenView = {
  id: string;
  name: string;
  tokenPrefix: string;
  scope: ApiTokenScope;
  expiresAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
};

type Revealed = { token: string; name: string };

// WORDING: every label below is provisional until Codex's proposal (JIR-156).
const SCOPE_LABELS: Record<ApiTokenScope, string> = {
  read: "Lecture",
  write: "Lecture et écriture",
};

const SCOPE_OPTIONS = [
  { value: "read", label: "Lecture : consulter les backlogs et les items" },
  { value: "write", label: "Lecture et écriture : créer, modifier, commenter" },
] as const;

type ExpiryChoice = "30" | "90" | "365" | "never";

const EXPIRY_OPTIONS: readonly { value: ExpiryChoice; label: string }[] = [
  { value: "30", label: "30 jours" },
  { value: "90", label: "90 jours" },
  { value: "365", label: "1 an" },
  { value: "never", label: "Sans expiration" },
];

function expiryDays(choice: ExpiryChoice): ApiTokenExpiryDays {
  return choice === "never" ? null : (Number(choice) as 30 | 90 | 365);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR");
}

function expiryLabel(token: ApiTokenView, now: number): { text: string; expired: boolean } {
  if (!token.expiresAt) return { text: "Sans expiration", expired: false };
  const expired = new Date(token.expiresAt).getTime() <= now;
  return { text: expired ? `Expiré le ${formatDate(token.expiresAt)}` : `Expire le ${formatDate(token.expiresAt)}`, expired };
}

async function copyToClipboard(value: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(value);
    toast.success("Jeton copié.");
  } catch {
    toast.error("Copie impossible : sélectionnez le jeton et copiez-le.");
  }
}

export function ApiTokensPanel({ tokens }: { tokens: ApiTokenView[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [scope, setScope] = useState<ApiTokenScope>("read");
  const [expiry, setExpiry] = useState<ExpiryChoice>("90");
  const [createError, setCreateError] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<Revealed | null>(null);
  const [revoking, setRevoking] = useState<ApiTokenView | null>(null);
  // Read once per mount: the list is re-rendered by router.refresh() anyway.
  const [now] = useState(() => Date.now());

  function resetCreateForm() {
    setName("");
    setScope("read");
    setExpiry("90");
    setCreateError(null);
  }

  function submitCreate() {
    setCreateError(null);
    startTransition(async () => {
      const result = await createApiTokenAction({ name, scope, expiresInDays: expiryDays(expiry) });
      if (!result.ok) {
        setCreateError(result.error);
        return;
      }
      setCreateOpen(false);
      resetCreateForm();
      setRevealed({ token: result.token, name: result.row.name });
      router.refresh();
    });
  }

  function confirmRevoke(token: ApiTokenView) {
    startTransition(async () => {
      const result = await revokeApiTokenAction({ id: token.id });
      setRevoking(null);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`Jeton « ${token.name} » révoqué.`);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4" data-slot="api-tokens-panel">
      <div className="flex items-center justify-between gap-4">
        <p className="t-sm text-muted-foreground">
          {tokens.length === 0
            ? "Vous n’avez aucun jeton."
            : `${tokens.length} ${tokens.length > 1 ? "jetons actifs" : "jeton actif"}.`}
        </p>
        <Button type="button" size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="size-4" aria-hidden />
          Créer un jeton
        </Button>
      </div>

      {tokens.length > 0 && (
        <ul className="divide-y divide-border rounded-[var(--radius)] border border-border" aria-label="Jetons d’accès">
          {tokens.map((token) => {
            const expiryState = expiryLabel(token, now);
            return (
              <li key={token.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
                <div className="min-w-0 flex-1 space-y-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{token.name}</span>
                    <Badge variant="outline">{SCOPE_LABELS[token.scope]}</Badge>
                    {expiryState.expired && <Badge variant="destructive">Expiré</Badge>}
                  </div>
                  <p className="font-mono text-xs text-muted-foreground">
                    {API_TOKEN_PREFIX}{token.tokenPrefix}…
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {`Créé le ${formatDate(token.createdAt)} · ${expiryState.text} · `}
                    {token.lastUsedAt ? `Dernier usage le ${formatDate(token.lastUsedAt)}` : "Jamais utilisé"}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={pending}
                  onClick={() => setRevoking(token)}
                  aria-label={`Révoquer le jeton ${token.name}`}
                >
                  Révoquer
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          if (open) setCreateOpen(true);
          else if (!pending) {
            setCreateOpen(false);
            resetCreateForm();
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Créer un jeton d’accès</DialogTitle>
            <DialogDescription>
              Le jeton agit en votre nom, avec vos droits. Il ne sera affiché qu’une seule fois.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (!pending && name.trim().length > 0) submitCreate();
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="api-token-name">Nom</Label>
              <Input
                id="api-token-name"
                value={name}
                maxLength={API_TOKEN_NAME_MAX}
                placeholder="Herdr, Claude Code, script de reporting…"
                autoComplete="off"
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="api-token-scope">Portée</Label>
              <SelectField
                id="api-token-scope"
                value={scope}
                onValueChange={(value) => setScope(value)}
                options={SCOPE_OPTIONS}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="api-token-expiry">Expiration</Label>
              <SelectField
                id="api-token-expiry"
                value={expiry}
                onValueChange={(value) => setExpiry(value)}
                options={EXPIRY_OPTIONS}
              />
            </div>
            {createError && <p role="alert" className="text-sm text-destructive">{createError}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" disabled={pending} onClick={() => { setCreateOpen(false); resetCreateForm(); }}>
                Annuler
              </Button>
              <Button type="submit" disabled={pending || name.trim().length === 0}>
                Créer le jeton
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={revealed !== null} onOpenChange={(open) => { if (!open) setRevealed(null); }}>
        <DialogContent>
          {revealed && (
            <>
              <DialogHeader>
                <DialogTitle>Jeton « {revealed.name} » créé</DialogTitle>
                <DialogDescription>
                  Copiez-le maintenant : il ne sera plus jamais affiché. En cas de perte, révoquez-le
                  et créez-en un nouveau.
                </DialogDescription>
              </DialogHeader>
              <div className="flex gap-2">
                <Input
                  readOnly
                  value={revealed.token}
                  aria-label="Jeton d’accès"
                  className="font-mono text-xs"
                  onFocus={(event) => event.currentTarget.select()}
                />
                <Button type="button" variant="outline" size="sm" onClick={() => copyToClipboard(revealed.token)} aria-label="Copier le jeton">
                  <Copy className="size-4" aria-hidden />
                  Copier
                </Button>
              </div>
              <DialogFooter>
                <Button type="button" onClick={() => setRevealed(null)}>J’ai copié le jeton</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={revoking !== null} onOpenChange={(open) => { if (!open && !pending) setRevoking(null); }}>
        <DialogContent>
          {revoking && (
            <>
              <DialogHeader>
                <DialogTitle>Révoquer le jeton « {revoking.name} » ?</DialogTitle>
                <DialogDescription>
                  Les outils qui l’utilisent seront refusés dès maintenant. Cette action est définitive.
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
