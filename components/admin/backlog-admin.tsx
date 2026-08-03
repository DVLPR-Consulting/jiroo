"use client";

import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import {
  archiveBacklogAction,
  createBacklogAction,
  updateBacklogAction,
} from "@/app/actions/backlogs";
import { Badge } from "@/components/ui/badge";
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

export type Backlog = {
  id: string;
  key: string;
  name: string;
  color: string;
  archivedAt: Date | string | null;
};

const DEFAULT_COLOR = "#7c3030";
const PRESET_COLORS = [
  DEFAULT_COLOR,
  "#2b6cb0",
  "#2f855a",
  "#b7791f",
  "#6b46c1",
  "#475569",
];

function ColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (color: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {PRESET_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          aria-label={`Couleur ${c}`}
          onClick={() => onChange(c)}
          className={`size-7 rounded-full ring-offset-2 ring-offset-background transition ${
            value === c ? "ring-2 ring-[var(--ring)]" : ""
          }`}
          style={{ background: c }}
        />
      ))}
    </div>
  );
}

function BacklogDialog({
  trigger,
  title,
  initialKey = "",
  initialName = "",
  initialColor = DEFAULT_COLOR,
  keyEditable = true,
  onSubmit,
  pending,
}: {
  trigger: React.ReactNode;
  title: string;
  initialKey?: string;
  initialName?: string;
  initialColor?: string;
  keyEditable?: boolean;
  onSubmit: (
    values: { key: string; name: string; color: string },
    close: () => void,
    setError: (msg: string | null) => void,
  ) => void;
  pending: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState(initialKey);
  const [name, setName] = useState(initialName);
  const [color, setColor] = useState(initialColor);
  const [error, setError] = useState<string | null>(null);
  const [confirmKeyChange, setConfirmKeyChange] = useState(false);

  function reset() {
    setKey(initialKey);
    setName(initialName);
    setColor(initialColor);
    setError(null);
    setConfirmKeyChange(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Renseignez une clé, un nom et une couleur pour ce backlog.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            const normalizedKey = key.trim();
            if (initialKey && normalizedKey !== initialKey && !confirmKeyChange) {
              setConfirmKeyChange(true);
              return;
            }
            onSubmit(
              { key: normalizedKey, name: name.trim(), color },
              () => setOpen(false),
              setError,
            );
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="backlog-key">Clé</Label>
            <Input
              id="backlog-key"
              value={key}
              maxLength={6}
              disabled={!keyEditable}
              placeholder="ex. WEB"
              onChange={(e) => {
                setKey(e.target.value.toUpperCase());
                setConfirmKeyChange(false);
              }}
            />
            <p className="t-sm text-muted-foreground">En majuscules, 6 caractères max.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="backlog-name">Nom</Label>
            <Input
              id="backlog-name"
              value={name}
              placeholder="ex. Site web"
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Couleur</Label>
            <ColorPicker value={color} onChange={setColor} />
          </div>
          {confirmKeyChange && (
            <p className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              La clé et toutes les clés d’items seront renommées. Les anciens liens ne fonctionneront
              plus.
            </p>
          )}
          {error && <p className="t-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="submit" disabled={pending || !name || (keyEditable && !key)}>
              {confirmKeyChange ? "Confirmer le renommage" : "Enregistrer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function BacklogAdmin({ backlogs }: { backlogs: Backlog[] }) {
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <BacklogDialog
          title="Nouveau backlog"
          pending={pending}
          trigger={
            <Button>
              <Plus className="size-4" />
              Nouveau backlog
            </Button>
          }
          onSubmit={(values, close, setError) => {
            startTransition(async () => {
              const result = await createBacklogAction(values);
              if (!result.ok) {
                setError(result.error);
                return;
              }
              close();
            });
          }}
        />
      </div>

      <ul className="divide-y divide-border rounded-[var(--radius)] border border-border">
        {backlogs.map((b) => {
          const archived = b.archivedAt != null;
          return (
            <li key={b.id} className="flex items-center gap-3 px-4 py-3">
              <span
                className="rounded px-1.5 py-0.5 text-[11px] font-medium text-white"
                style={{ background: b.color }}
              >
                {b.key}
              </span>
              <span className="truncate font-medium">{b.name}</span>
              <span
                className="size-4 shrink-0 rounded-full border border-border"
                style={{ background: b.color }}
                aria-hidden
              />
              {archived && (
                <Badge variant="secondary" className="ml-1">
                  Archivé
                </Badge>
              )}
              <div className="ml-auto flex items-center gap-2">
                {!archived && (
                  <>
                    <BacklogDialog
                      title="Modifier le backlog"
                      pending={pending}
                      initialKey={b.key}
                      initialName={b.name}
                      initialColor={b.color}
                      trigger={
                        <Button variant="ghost" size="sm" disabled={pending}>
                          Modifier
                        </Button>
                      }
                      onSubmit={(values, close, setError) => {
                        startTransition(async () => {
                          const result = await updateBacklogAction({
                            id: b.id,
                            key: values.key,
                            name: values.name,
                            color: values.color,
                          });
                          if (!result.ok) {
                            setError(result.error);
                            return;
                          }
                          close();
                        });
                      }}
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={pending}
                      onClick={() => {
                        startTransition(async () => {
                          await archiveBacklogAction(b.id);
                        });
                      }}
                    >
                      Archiver
                    </Button>
                  </>
                )}
              </div>
            </li>
          );
        })}
        {backlogs.length === 0 && (
          <li className="px-4 py-6 text-center text-sm text-muted-foreground">
            Aucun backlog pour le moment.
          </li>
        )}
      </ul>
    </div>
  );
}
