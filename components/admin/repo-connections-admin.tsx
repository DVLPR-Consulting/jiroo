"use client";

import { useState, useSyncExternalStore, useTransition } from "react";
import { Copy, Plus } from "lucide-react";
import {
  createRepoConnectionAction,
  deleteRepoConnectionAction,
  regenerateRepoConnectionSecretAction,
  setRepoConnectionEnabledAction,
} from "@/app/actions/repo-connections";
import { useRetainedWhileClosing } from "@/components/admin/use-retained-while-closing";
import { FORGE_LABELS, ForgeIcon } from "@/components/icons/forge-icon";
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
import { toast } from "@/lib/toast";

/**
 * Backlog settings → Développement (JIR-95): repositories connected by
 * webhook. The secret is shown once, right after it is generated.
 */

export type RepoConnectionView = {
  id: string;
  provider: "github" | "gitlab";
  instanceUrl: string;
  repositoryPath: string;
  enabled: boolean;
  lastEventAt: Date | string | null;
  lastError: string | null;
  lastErrorAt: Date | string | null;
};

type Provider = RepoConnectionView["provider"];
type Revealed = { connection: RepoConnectionView; secret: string; regenerated: boolean };
type Confirmation = { type: "regenerate" | "delete"; connection: RepoConnectionView };

const dateTimeFmt = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" });

const subscribeNever = () => () => {};

/** The page origin, empty during the server render. */
function useOrigin(): string {
  return useSyncExternalStore(subscribeNever, () => window.location.origin, () => "");
}

export function webhookPath(connection: Pick<RepoConnectionView, "id" | "provider">): string {
  return `/api/webhooks/${connection.provider}/${connection.id}`;
}

async function copy(text: string, success: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(success);
  } catch {
    toast.error("Impossible de copier.");
  }
}

function connectionStatus(connection: RepoConnectionView): {
  label: string;
  variant: "secondary" | "destructive" | "outline" | "default";
} {
  if (!connection.enabled) return { label: "Désactivée", variant: "secondary" };
  const lastEvent = connection.lastEventAt ? new Date(connection.lastEventAt).getTime() : null;
  const lastError = connection.lastErrorAt ? new Date(connection.lastErrorAt).getTime() : null;
  if (connection.lastError && lastError !== null && (lastEvent === null || lastError >= lastEvent)) {
    return { label: "Erreur", variant: "destructive" };
  }
  if (lastEvent !== null) return { label: "Active", variant: "outline" };
  return { label: "En attente d’un premier événement", variant: "outline" };
}

function CopyField({ label, value, copyLabel, success }: {
  label: string;
  value: string;
  copyLabel: string;
  success: string;
}) {
  return (
    <div className="space-y-1">
      <p className="text-sm font-medium">{label}</p>
      <div className="flex gap-2">
        <Input readOnly value={value} aria-label={label} className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
        <Button type="button" variant="outline" size="sm" onClick={() => copy(value, success)} aria-label={copyLabel}>
          <Copy className="size-4" aria-hidden />
          Copier
        </Button>
      </div>
    </div>
  );
}

function SetupSteps({ provider }: { provider: Provider }) {
  const steps = provider === "github"
    ? [
        <>Dans le dépôt GitHub : <b>Settings</b> → <b>Webhooks</b> → <b>Add webhook</b>.</>,
        <><b>Payload URL</b> : l’URL ci-dessus ; <b>Content type</b> : <code>application/json</code> ; <b>Secret</b> : le secret ci-dessus.</>,
        <><b>Let me select individual events</b> : cochez <b>Branch or tag creation</b>, <b>Pushes</b> et <b>Pull requests</b>.</>,
        <><b>Add webhook</b> : GitHub envoie un ping, la connexion affiche alors son dernier événement.</>,
      ]
    : [
        <>Dans le projet GitLab : <b>Settings</b> → <b>Webhooks</b> → <b>Add new webhook</b>.</>,
        <><b>URL</b> : l’URL ci-dessus ; <b>Secret token</b> : le secret ci-dessus.</>,
        <><b>Trigger</b> : cochez <b>Push events</b> et <b>Merge request events</b>.</>,
        <><b>Add webhook</b>, puis <b>Test</b> → <b>Push events</b> pour vérifier la connexion.</>,
      ];
  return (
    <ol className="list-decimal space-y-1 pl-5 text-sm marker:text-muted-foreground">
      {steps.map((step, index) => <li key={index}>{step}</li>)}
    </ol>
  );
}

export function RepoConnectionsAdmin({
  backlogId,
  backlogKey,
  connections,
}: {
  backlogId: string;
  backlogKey: string;
  connections: RepoConnectionView[];
}) {
  const origin = useOrigin();
  const [pending, startTransition] = useTransition();
  const [createOpen, setCreateOpen] = useState(false);
  const [provider, setProvider] = useState<Provider>("github");
  const [repositoryPath, setRepositoryPath] = useState("");
  const [instanceUrl, setInstanceUrl] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<Revealed | null>(null);
  const shownRevealed = useRetainedWhileClosing(revealed);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const shownConfirmation = useRetainedWhileClosing(confirmation);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);

  const webhookUrl = (connection: Pick<RepoConnectionView, "id" | "provider">) => `${origin}${webhookPath(connection)}`;

  function openCreate() {
    setProvider("github");
    setRepositoryPath("");
    setInstanceUrl("");
    setCreateError(null);
    setCreateOpen(true);
  }

  function submitCreate() {
    setCreateError(null);
    startTransition(async () => {
      let result: Awaited<ReturnType<typeof createRepoConnectionAction>>;
      try {
        result = await createRepoConnectionAction({
          backlogId,
          provider,
          repositoryPath,
          ...(provider === "gitlab" ? { instanceUrl } : {}),
        });
      } catch {
        setCreateError("Connexion impossible. Réessayez.");
        return;
      }
      if (!result.ok) {
        setCreateError(result.error);
        return;
      }
      setCreateOpen(false);
      setRevealed({ connection: result.connection, secret: result.secret, regenerated: false });
    });
  }

  function confirm() {
    const current = confirmation;
    if (!current) return;
    setConfirmError(null);
    startTransition(async () => {
      try {
        if (current.type === "regenerate") {
          const result = await regenerateRepoConnectionSecretAction({ backlogKey, connectionId: current.connection.id });
          if (!result.ok) {
            setConfirmError(result.error);
            return;
          }
          setConfirmation(null);
          setRevealed({ connection: result.connection, secret: result.secret, regenerated: true });
        } else {
          const result = await deleteRepoConnectionAction({ backlogKey, connectionId: current.connection.id });
          if (!result.ok) {
            setConfirmError(result.error);
            return;
          }
          setConfirmation(null);
          toast.success("Connexion supprimée.");
        }
      } catch {
        setConfirmError("Action impossible. Réessayez.");
      }
    });
  }

  function toggle(connection: RepoConnectionView) {
    setListError(null);
    startTransition(async () => {
      try {
        const result = await setRepoConnectionEnabledAction({
          backlogKey,
          connectionId: connection.id,
          enabled: !connection.enabled,
        });
        if (!result.ok) setListError(result.error);
        else toast.success(result.connection.enabled ? "Connexion activée." : "Connexion désactivée.");
      } catch {
        setListError("Action impossible. Réessayez.");
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="t-h2">Dépôts connectés</h2>
        <Button onClick={openCreate}>
          <Plus className="size-4" aria-hidden />
          Connecter un dépôt
        </Button>
      </div>

      {listError && (
        <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{listError}</p>
      )}

      {connections.length === 0 ? (
        <p className="rounded-[var(--radius)] border border-dashed border-border p-6 text-sm text-muted-foreground">
          Aucun dépôt connecté. Connectez un dépôt GitHub ou GitLab : les branches, commits et pull / merge requests
          qui citent une clé de ticket ({backlogKey}-12) apparaîtront dans son panneau Développement.
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-[var(--radius)] border border-border">
          {connections.map((connection) => {
            const status = connectionStatus(connection);
            const host = new URL(connection.instanceUrl).host;
            const name = `${FORGE_LABELS[connection.provider]} ${connection.repositoryPath}`;
            return (
              <li key={connection.id} aria-label={name} className="space-y-2 px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <ForgeIcon provider={connection.provider} className="size-4" decorative />
                  <span className="min-w-0 break-all font-medium">{connection.repositoryPath}</span>
                  {host !== "github.com" && host !== "gitlab.com" && (
                    <span className="text-xs text-muted-foreground">{host}</span>
                  )}
                  <Badge variant={status.variant}>{status.label}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {connection.lastEventAt
                    ? `Dernier événement : ${dateTimeFmt.format(new Date(connection.lastEventAt))}`
                    : "Aucun événement reçu"}
                </p>
                {connection.lastError && connection.lastErrorAt && (
                  <p className="text-xs text-destructive">
                    Dernière erreur ({dateTimeFmt.format(new Date(connection.lastErrorAt))}) : {connection.lastError}
                  </p>
                )}
                <div className="flex min-w-0 items-center gap-2">
                  <code className="min-w-0 flex-1 truncate rounded bg-[var(--muted)] px-2 py-1 text-xs" title={webhookUrl(connection)}>
                    {webhookUrl(connection)}
                  </code>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Copier l’URL du webhook de ${name}`}
                    onClick={() => copy(webhookUrl(connection), "URL du webhook copiée.")}
                  >
                    <Copy className="size-4" aria-hidden />
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" disabled={pending} onClick={() => { setConfirmError(null); setConfirmation({ type: "regenerate", connection }); }}>
                    Régénérer le secret
                  </Button>
                  <Button variant="outline" size="sm" disabled={pending} onClick={() => toggle(connection)}>
                    {connection.enabled ? "Désactiver" : "Activer"}
                  </Button>
                  <Button variant="ghost" size="sm" disabled={pending} className="text-destructive" onClick={() => { setConfirmError(null); setConfirmation({ type: "delete", connection }); }}>
                    Supprimer
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Dialog open={createOpen} onOpenChange={(open) => { if (!pending) setCreateOpen(open); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Connecter un dépôt</DialogTitle>
            <DialogDescription>
              Jiroo reçoit les webhooks du dépôt ; il n’y accède jamais et ne stocke aucun jeton d’accès.
            </DialogDescription>
          </DialogHeader>
          <form
            aria-label="Connecter un dépôt"
            className="space-y-4"
            onSubmit={(event) => { event.preventDefault(); submitCreate(); }}
          >
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Forge</legend>
              <div className="flex gap-4">
                {(["github", "gitlab"] as const).map((value) => (
                  <label key={value} className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name="provider"
                      value={value}
                      checked={provider === value}
                      onChange={() => setProvider(value)}
                    />
                    <ForgeIcon provider={value} className="size-4" decorative />
                    {FORGE_LABELS[value]}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="space-y-1">
              <label htmlFor="repo-connection-path" className="text-sm font-medium">
                {provider === "github" ? "Dépôt" : "Chemin du projet"}
              </label>
              <Input
                id="repo-connection-path"
                value={repositoryPath}
                onChange={(event) => setRepositoryPath(event.target.value)}
                placeholder={provider === "github" ? "propriétaire/dépôt" : "groupe/sous-groupe/projet"}
                autoComplete="off"
                required
              />
            </div>
            {provider === "gitlab" && (
              <div className="space-y-1">
                <label htmlFor="repo-connection-instance" className="text-sm font-medium">URL de l’instance GitLab</label>
                <Input
                  id="repo-connection-instance"
                  value={instanceUrl}
                  onChange={(event) => setInstanceUrl(event.target.value)}
                  placeholder="https://gitlab.com"
                  autoComplete="off"
                />
                <p className="text-xs text-muted-foreground">Laissez vide pour gitlab.com.</p>
              </div>
            )}
            {createError && <p role="alert" className="text-sm text-destructive">{createError}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" disabled={pending} onClick={() => setCreateOpen(false)}>Annuler</Button>
              <Button type="submit" disabled={pending || !repositoryPath.trim()}>Connecter le dépôt</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={revealed !== null} onOpenChange={(open) => { if (!open) setRevealed(null); }}>
        <DialogContent>
          {shownRevealed && (
            <>
              <DialogHeader>
                <DialogTitle>{shownRevealed.regenerated ? "Nouveau secret du webhook" : "Configurer le webhook"}</DialogTitle>
                <DialogDescription>
                  Le secret ne sera plus affiché : copiez-le maintenant dans{" "}
                  {FORGE_LABELS[shownRevealed.connection.provider]}.
                  {shownRevealed.regenerated && " L’ancien secret est déjà refusé."}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <CopyField
                  label="URL du webhook"
                  value={webhookUrl(shownRevealed.connection)}
                  copyLabel="Copier l’URL du webhook"
                  success="URL du webhook copiée."
                />
                <CopyField
                  label="Secret du webhook"
                  value={shownRevealed.secret}
                  copyLabel="Copier le secret"
                  success="Secret copié."
                />
                <SetupSteps provider={shownRevealed.connection.provider} />
              </div>
              <DialogFooter>
                <Button onClick={() => setRevealed(null)}>J’ai copié le secret</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={confirmation !== null} onOpenChange={(open) => { if (!open && !pending) setConfirmation(null); }}>
        <DialogContent>
          {shownConfirmation && (
            <>
              <DialogHeader>
                <DialogTitle>
                  {shownConfirmation.type === "regenerate" ? "Régénérer le secret ?" : "Supprimer la connexion ?"}
                </DialogTitle>
                <DialogDescription>
                  {shownConfirmation.type === "regenerate"
                    ? `L’ancien secret de ${shownConfirmation.connection.repositoryPath} sera refusé dès maintenant : reportez le nouveau dans le webhook.`
                    : `Les webhooks de ${shownConfirmation.connection.repositoryPath} seront refusés. Les références déjà créées restent sur les tickets.`}
                </DialogDescription>
              </DialogHeader>
              {confirmError && <p role="alert" className="text-sm text-destructive">{confirmError}</p>}
              <DialogFooter>
                <Button variant="outline" disabled={pending} onClick={() => setConfirmation(null)}>Annuler</Button>
                <Button
                  variant={shownConfirmation.type === "delete" ? "destructive" : "default"}
                  disabled={pending}
                  onClick={confirm}
                >
                  {shownConfirmation.type === "regenerate" ? "Régénérer" : "Supprimer"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
