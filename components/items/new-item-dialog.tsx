"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { createItemAction } from "@/app/actions/items";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TypeIcon } from "@/components/icons/type-icon";
import {
  ITEM_TYPES,
  ITEM_TYPE_LABELS,
  PRIORITIES,
  PRIORITY_LABELS,
  type ItemType,
  type Priority,
} from "@/lib/design/constants";
import { allowedParentType } from "@/lib/tree/hierarchy";

type Item = { id: string; key: string; type: ItemType; title: string };
type Status = { id: string; name: string };

// Shared field styling — matches Input's token-based look so native selects fit in.
const FIELD =
  "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 dark:bg-input/30";

export function NewItemButton({
  backlogId,
  backlogKey,
  items,
  statuses,
}: {
  backlogId: string;
  backlogKey: string;
  items: Item[];
  statuses: Status[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  const [type, setType] = useState<ItemType>("composant");
  const [title, setTitle] = useState("");
  const [parentId, setParentId] = useState<string>("");
  const [statusId, setStatusId] = useState<string>("");
  const [priority, setPriority] = useState<Priority>(0);
  const [error, setError] = useState<string | null>(null);

  const requiredParentType = allowedParentType(type);
  const parentOptions = useMemo(
    () => (requiredParentType ? items.filter((i) => i.type === requiredParentType) : []),
    [items, requiredParentType],
  );

  function reset() {
    setType("composant");
    setTitle("");
    setParentId("");
    setStatusId("");
    setPriority(0);
    setError(null);
  }

  function handleTypeChange(next: ItemType) {
    setType(next);
    // Clear the parent if it no longer matches the new required type.
    const nextParentType = allowedParentType(next);
    if (parentId) {
      const current = items.find((i) => i.id === parentId);
      if (!nextParentType || !current || current.type !== nextParentType) {
        setParentId("");
      }
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createItemAction({
        backlogKey,
        backlogId,
        type,
        parentId: requiredParentType ? parentId || null : null,
        title: title.trim(),
        statusId: statusId || undefined,
        priority,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setOpen(false);
      reset();
      router.refresh();
    });
  }

  const parentRequired = requiredParentType !== null;
  const submitDisabled = pending || !title.trim() || (parentRequired && !parentId);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <Plus className="size-4" />
          Nouvel item
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nouvel item</DialogTitle>
        </DialogHeader>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="item-type">Type</Label>
            <select
              id="item-type"
              className={FIELD}
              value={type}
              onChange={(e) => handleTypeChange(e.target.value as ItemType)}
            >
              {ITEM_TYPES.map((t) => (
                <option key={t} value={t}>
                  {ITEM_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="item-title">Titre</Label>
            <Input
              id="item-title"
              value={title}
              placeholder="ex. Page de connexion"
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
            />
          </div>

          {parentRequired && (
            <div className="space-y-2">
              <Label htmlFor="item-parent">Parent</Label>
              <select
                id="item-parent"
                className={FIELD}
                value={parentId}
                onChange={(e) => setParentId(e.target.value)}
              >
                <option value="" disabled>
                  Choisir un {ITEM_TYPE_LABELS[requiredParentType].toLowerCase()}…
                </option>
                {parentOptions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.key} — {p.title}
                  </option>
                ))}
              </select>
              {parentOptions.length === 0 && (
                <p className="t-sm text-muted-foreground">
                  Aucun {ITEM_TYPE_LABELS[requiredParentType].toLowerCase()} disponible — créez-en un d&apos;abord.
                </p>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="item-status">Statut</Label>
            <select
              id="item-status"
              className={FIELD}
              value={statusId}
              onChange={(e) => setStatusId(e.target.value)}
            >
              <option value="">(par défaut)</option>
              {statuses.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="item-priority">Priorité</Label>
            <select
              id="item-priority"
              className={FIELD}
              value={priority}
              onChange={(e) => setPriority(Number(e.target.value) as Priority)}
            >
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_LABELS[p]}
                </option>
              ))}
            </select>
          </div>

          {error && <p className="t-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="submit" disabled={submitDisabled}>
              <TypeIcon type={type} size={14} />
              Créer
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
