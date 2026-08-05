"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Columns3, Pencil, Plus, Trash2 } from "lucide-react";
import {
  createStatusAction,
  deleteStatusAction,
  reorderStatusesAction,
  updateStatusAction,
} from "@/app/actions/statuses";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type StatusCategory = "todo" | "in_progress" | "done";

export type ManagedStatus = {
  id: string;
  name: string;
  category: StatusCategory;
  color: string;
  order: number;
  itemCount: number;
};

const CATEGORY_LABELS: Record<StatusCategory, string> = {
  todo: "À faire",
  in_progress: "En cours",
  done: "Terminé",
};

const PRESET_COLORS = ["#9aa0a6", "#d99a2b", "#8b5cf6", "#3aa675", "#2b6cb0", "#7c3030"];

type EditorMode =
  | { type: "create" }
  | { type: "edit"; status: ManagedStatus }
  | { type: "delete"; status: ManagedStatus }
  | null;

export function StatusManagerDialog({
  backlogId,
  backlogKey,
  statuses,
}: {
  backlogId: string;
  backlogKey: string;
  statuses: ManagedStatus[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState(() => [...statuses].sort((a, b) => a.order - b.order));
  const [mode, setMode] = useState<EditorMode>(null);
  const [name, setName] = useState("");
  const [category, setCategory] = useState<StatusCategory>("in_progress");
  const [color, setColor] = useState("#8b5cf6");
  const [replacementStatusId, setReplacementStatusId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function resetEditor() {
    setMode(null);
    setName("");
    setCategory("in_progress");
    setColor("#8b5cf6");
    setReplacementStatusId("");
    setError(null);
  }

  function beginCreate() {
    resetEditor();
    setMode({ type: "create" });
  }

  function beginEdit(status: ManagedStatus) {
    resetEditor();
    setName(status.name);
    setCategory(status.category);
    setColor(status.color);
    setMode({ type: "edit", status });
  }

  function beginDelete(status: ManagedStatus) {
    resetEditor();
    setMode({ type: "delete", status });
  }

  function moveStatus(index: number, delta: -1 | 1) {
    const target = index + delta;
    if (target < 0 || target >= rows.length || pending) return;
    const previous = rows;
    const next = [...rows];
    const [moving] = next.splice(index, 1);
    next.splice(target, 0, moving!);
    const ordered = next.map((status, order) => ({ ...status, order }));
    setRows(ordered);
    setError(null);
    startTransition(async () => {
      const result = await reorderStatusesAction({
        backlogId,
        backlogKey,
        statusIds: ordered.map(({ id }) => id),
      });
      if (!result.ok) {
        setRows(previous);
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  function submitStatus() {
    if (!mode || mode.type === "delete" || pending || name.trim().length === 0) return;
    setError(null);
    startTransition(async () => {
      const result =
        mode.type === "create"
          ? await createStatusAction({
              backlogId,
              backlogKey,
              name: name.trim(),
              category,
              color,
            })
          : await updateStatusAction({
              id: mode.status.id,
              backlogId,
              backlogKey,
              name: name.trim(),
              category,
              color,
            });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (mode.type === "create") {
        setRows((current) => [
          ...current,
          { ...result.status, itemCount: 0 },
        ]);
      } else {
        setRows((current) =>
          current.map((status) =>
            status.id === mode.status.id
              ? { ...status, ...result.status, itemCount: status.itemCount }
              : status,
          ),
        );
      }
      resetEditor();
      router.refresh();
    });
  }

  function confirmDelete(status: ManagedStatus) {
    if (pending || (status.itemCount > 0 && !replacementStatusId)) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteStatusAction({
        id: status.id,
        backlogId,
        backlogKey,
        replacementStatusId: replacementStatusId || null,
      });
      if (!result.ok) {
        const currentItemCount =
          "currentItemCount" in result ? result.currentItemCount : undefined;
        if (typeof currentItemCount === "number" && currentItemCount > 0) {
          setMode({
            type: "delete",
            status: { ...status, itemCount: currentItemCount },
          });
          setRows((current) =>
            current.map((row) =>
              row.id === status.id ? { ...row, itemCount: currentItemCount } : row,
            ),
          );
        }
        setError(result.error);
        return;
      }
      setRows((current) =>
        current
          .filter(({ id }) => id !== status.id)
          .map((remaining, order) => ({ ...remaining, order })),
      );
      resetEditor();
      router.refresh();
    });
  }

  const todoCount = rows.filter(({ category: value }) => value === "todo").length;
  const doneCount = rows.filter(({ category: value }) => value === "done").length;

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) resetEditor();
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <Columns3 className="size-4" />
          Colonnes
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Gérer les colonnes</DialogTitle>
          <DialogDescription>
            Configurez les statuts de ce backlog. Leur ordre détermine celui du board.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <ol className="divide-y divide-border rounded-md border border-border">
            {rows.map((status, index) => {
              const protectedCategory =
                (status.category === "todo" && todoCount <= 1) ||
                (status.category === "done" && doneCount <= 1);
              return (
                <li key={status.id} className="flex items-center gap-3 px-3 py-2.5">
                  <span
                    className="size-3 shrink-0 rounded-full"
                    style={{ background: status.color }}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{status.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {CATEGORY_LABELS[status.category]} · {status.itemCount} item{status.itemCount > 1 ? "s" : ""}
                    </span>
                  </span>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      aria-label={`Monter ${status.name}`}
                      disabled={pending || index === 0}
                      onClick={() => moveStatus(index, -1)}
                    >
                      <ArrowUp />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      aria-label={`Descendre ${status.name}`}
                      disabled={pending || index === rows.length - 1}
                      onClick={() => moveStatus(index, 1)}
                    >
                      <ArrowDown />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      aria-label={`Modifier ${status.name}`}
                      disabled={pending}
                      onClick={() => beginEdit(status)}
                    >
                      <Pencil />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      aria-label={`Supprimer ${status.name}`}
                      title={protectedCategory ? "Le workflow doit conserver un statut initial et un statut terminé." : undefined}
                      disabled={pending || rows.length <= 1 || protectedCategory}
                      onClick={() => beginDelete(status)}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ol>

          {mode === null ? (
            <Button type="button" variant="outline" onClick={beginCreate} disabled={pending}>
              <Plus className="size-4" />
              Ajouter une colonne
            </Button>
          ) : mode.type === "delete" ? (
            <section className="space-y-4 rounded-md border border-destructive/30 bg-destructive/5 p-4">
              <div>
                <h3 className="text-sm font-medium">Supprimer {mode.status.name}</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {mode.status.itemCount > 0
                    ? mode.status.itemCount === 1
                      ? "1 item sera déplacé avant la suppression."
                      : `${mode.status.itemCount} items seront déplacés avant la suppression.`
                    : "Cette colonne est vide."}
                </p>
              </div>
              {mode.status.itemCount > 0 && (
                <div className="space-y-2">
                  <Label htmlFor="status-replacement">Statut de destination</Label>
                  <select
                    id="status-replacement"
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={replacementStatusId}
                    onChange={(event) => setReplacementStatusId(event.target.value)}
                  >
                    <option value="">Choisir une destination</option>
                    {rows
                      .filter(({ id }) => id !== mode.status.id)
                      .map((status) => (
                        <option key={status.id} value={status.id}>{status.name}</option>
                      ))}
                  </select>
                </div>
              )}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={resetEditor} disabled={pending}>Annuler</Button>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={pending || (mode.status.itemCount > 0 && !replacementStatusId)}
                  onClick={() => confirmDelete(mode.status)}
                >
                  Confirmer la suppression
                </Button>
              </div>
            </section>
          ) : (
            <form
              className="space-y-4 rounded-md border border-border p-4"
              onSubmit={(event) => {
                event.preventDefault();
                submitStatus();
              }}
            >
              <h3 className="text-sm font-medium">
                {mode.type === "create" ? "Ajouter une colonne" : `Modifier ${mode.status.name}`}
              </h3>
              <div className="space-y-2">
                <Label htmlFor="status-name">Nom</Label>
                <Input
                  id="status-name"
                  value={name}
                  maxLength={80}
                  autoFocus
                  onChange={(event) => setName(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="status-category">Catégorie</Label>
                <select
                  id="status-category"
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={category}
                  onChange={(event) => setCategory(event.target.value as StatusCategory)}
                >
                  {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                    <option
                      key={value}
                      value={value}
                      disabled={
                        mode.type === "edit" &&
                        value !== mode.status.category &&
                        ((mode.status.category === "todo" && todoCount <= 1) ||
                          (mode.status.category === "done" && doneCount <= 1))
                      }
                    >
                      {label}
                    </option>
                  ))}
                </select>
                {mode.type === "edit" &&
                  ((mode.status.category === "todo" && todoCount <= 1) ||
                    (mode.status.category === "done" && doneCount <= 1)) && (
                    <p className="text-xs text-muted-foreground">
                      Ajoutez d’abord un autre statut de cette catégorie pour pouvoir la modifier.
                    </p>
                  )}
              </div>
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">Couleur</legend>
                <div className="flex flex-wrap gap-2">
                  {PRESET_COLORS.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      aria-label={`Couleur ${preset}`}
                      className={`size-7 rounded-full ring-offset-2 ${color === preset ? "ring-2 ring-ring" : ""}`}
                      style={{ background: preset }}
                      onClick={() => setColor(preset)}
                    />
                  ))}
                </div>
              </fieldset>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={resetEditor} disabled={pending}>Annuler</Button>
                <Button type="submit" disabled={pending || name.trim().length === 0}>
                  {mode.type === "create" ? "Ajouter la colonne" : "Enregistrer"}
                </Button>
              </div>
            </form>
          )}

          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
