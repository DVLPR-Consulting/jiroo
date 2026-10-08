"use client";

import {
  useId,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { createItemAction, softDeleteItemAction } from "@/app/actions/items";
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
  ITEM_KINDS,
  ITEM_KIND_LABELS,
  ITEM_TYPES,
  ITEM_TYPE_LABELS,
  PRIORITIES,
  PRIORITY_LABELS,
  type ItemKind,
  type ItemType,
  type Priority,
} from "@/lib/design/constants";
import { ITEM_TEMPLATES, getTemplate } from "@/lib/items/templates";
import { allowedParentType } from "@/lib/tree/hierarchy";
import { toast } from "@/lib/toast";
import { ITEM_TITLE_MAX } from "@/lib/validation/item";
import { useShortcutHandler } from "@/components/shortcuts/keyboard-shortcuts-provider";
import {
  FixVersionPicker,
  type FixVersionOption,
} from "@/components/items/fix-version-picker";

type Item = { id: string; key: string; type: ItemType; title: string };
type Status = { id: string; name: string };

export type NewItemButtonProps = {
  backlogId: string;
  backlogKey: string;
  items: Item[];
  statuses: Status[];
  initialStatusId?: string;
  trigger?: ReactNode;
  onCreated?: (item: { id: string; key: string }) => void;
  enableShortcut?: boolean;
  sprintId?: string | null;
  contextLabel?: string;
  canScheduleItems?: boolean;
  releaseOptions?: FixVersionOption[];
  /** Pre-fills the title and parent when opened (« Plus d’options » of inline creation). */
  initialTitle?: string;
  initialParentId?: string;
};

// Shared field styling — matches Input's token-based look so native selects fit in.
const FIELD =
  "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 dark:bg-input/30";

export function NewItemButton({
  backlogId,
  backlogKey,
  items,
  statuses,
  initialStatusId,
  trigger,
  onCreated,
  enableShortcut = false,
  sprintId,
  contextLabel,
  canScheduleItems = true,
  releaseOptions = [],
  initialTitle,
  initialParentId,
}: NewItemButtonProps) {
  const router = useRouter();
  const contextualTask = contextLabel !== undefined;
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  const [templateId, setTemplateId] = useState<string>("");
  const [type, setType] = useState<ItemType>(contextualTask ? "tache" : "composant");
  const [kind, setKind] = useState<ItemKind>("feature");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState<string>("");
  const [parentId, setParentId] = useState<string>("");
  const [statusId, setStatusId] = useState<string>(initialStatusId ?? "");
  const [priority, setPriority] = useState<Priority>(0);
  const [fixVersionIds, setFixVersionIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [titleError, setTitleError] = useState<string | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const titleCounterId = useId();
  const titleErrorId = useId();

  // « c » (Jira's create) goes through the app-wide shortcut layer, which
  // already ignores fields, menus, IME composition, key repeat and the
  // single-key toggle. It stays off while any dialog (the item drawer
  // included) is open.
  useShortcutHandler(
    "create",
    enableShortcut &&
      (() => {
        if (document.querySelector('[role="dialog"]')) return false;
        setOpen(true);
      }),
  );

  const requiredParentType = allowedParentType(type);
  const availableItemTypes = canScheduleItems
    ? ITEM_TYPES
    : ITEM_TYPES.filter((candidate) => allowedParentType(candidate) === null);
  const parentOptions = useMemo(
    () => (requiredParentType ? items.filter((i) => i.type === requiredParentType) : []),
    [items, requiredParentType],
  );

  function reset() {
    setTemplateId("");
    setType(contextualTask ? "tache" : "composant");
    setKind("feature");
    setTitle("");
    setDescription("");
    setParentId("");
    setStatusId(initialStatusId ?? "");
    setPriority(0);
    setFixVersionIds([]);
    setError(null);
    setTitleError(null);
  }

  function handleTemplateChange(id: string) {
    setTemplateId(id);
    if (!id) {
      // "Aucun" selected — reset template-seeded fields to defaults
      setKind("feature");
      setDescription("");
      return;
    }
    const tpl = getTemplate(id);
    if (tpl) {
      setKind(tpl.kind);
      setDescription(tpl.description);
    }
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
    setTitleError(null);
    startTransition(async () => {
      const result = await createItemAction({
        backlogKey,
        backlogId,
        type,
        kind,
        parentId: requiredParentType ? parentId || null : null,
        title: title.trim(),
        description: description || null,
        statusId: statusId || undefined,
        priority,
        fixVersionIds,
        ...(contextualTask ? { sprintId: sprintId ?? null } : {}),
      });
      if (!result.ok) {
        const fieldError =
          "fieldErrors" in result ? result.fieldErrors?.title?.[0] : undefined;
        setTitleError(fieldError ?? null);
        setError(fieldError ? null : result.error);
        if (fieldError) titleRef.current?.focus();
        return;
      }
      const item = result.item;
      onCreated?.(item);
      setOpen(false);
      reset();
      toast.success("Item créé.", {
        action: {
          label: "Annuler",
          run: async () => {
            const undoResult = await softDeleteItemAction({ id: item.id, backlogKey });
            if (!undoResult.ok) throw new Error(undoResult.error);
            router.refresh();
          },
        },
      });
      router.refresh();
    });
  }

  const parentRequired = requiredParentType !== null;
  const submitDisabled = pending || !title.trim() || (parentRequired && !parentId);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        // Keep the dialog open while a request is in flight (JIR-57).
        if (!o && pending) return;
        setOpen(o);
        if (!o) reset();
        if (o && initialTitle) setTitle(initialTitle);
        if (o && initialParentId) setParentId(initialParentId);
      }}
    >
      <DialogTrigger asChild>
        {trigger ?? (
          <Button title={enableShortcut ? "Nouvel item (C)" : undefined}>
            <Plus className="size-4" />
            Nouvel item
          </Button>
        )}
      </DialogTrigger>
      <DialogContent aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>
            {contextualTask ? `Nouvelle tâche — ${contextLabel}` : "Nouvel item"}
          </DialogTitle>
        </DialogHeader>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="item-template">Modèle</Label>
            <select
              id="item-template"
              className={FIELD}
              value={templateId}
              onChange={(e) => handleTemplateChange(e.target.value)}
            >
              <option value="">Aucun</option>
              {ITEM_TEMPLATES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="item-type">Type</Label>
            <select
              id="item-type"
              className={FIELD}
              value={type}
              disabled={contextualTask}
              onChange={(e) => handleTypeChange(e.target.value as ItemType)}
            >
              {availableItemTypes.map((t) => (
                <option key={t} value={t}>
                  {ITEM_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="item-title">Titre</Label>
            <Input
              ref={titleRef}
              id="item-title"
              value={title}
              placeholder="ex. Page de connexion"
              maxLength={ITEM_TITLE_MAX}
              aria-invalid={titleError ? true : undefined}
              aria-describedby={`${titleCounterId}${titleError ? ` ${titleErrorId}` : ""}`}
              onChange={(e) => {
                setTitle(e.target.value);
                if (titleError) setTitleError(null);
              }}
              autoFocus
            />
            <div className="flex items-start justify-between gap-3">
              <span
                id={titleErrorId}
                className="t-sm text-destructive"
                role={titleError ? "alert" : undefined}
              >
                {titleError}
              </span>
              <span
                id={titleCounterId}
                className="ml-auto text-xs tabular-nums text-muted-foreground"
              >
                {title.length} / {ITEM_TITLE_MAX}
              </span>
            </div>
          </div>

          {canScheduleItems && parentRequired && (
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

          <div className="space-y-2">
            <Label htmlFor="item-kind">Nature</Label>
            <select
              id="item-kind"
              className={FIELD}
              value={kind}
              onChange={(e) => setKind(e.target.value as ItemKind)}
            >
              {ITEM_KINDS.map((k) => (
                <option key={k} value={k}>
                  {ITEM_KIND_LABELS[k]}
                </option>
              ))}
            </select>
          </div>

          {releaseOptions.length > 0 ? (
            <div className="space-y-2">
              <Label>Fix versions</Label>
              <FixVersionPicker
                value={fixVersionIds}
                options={releaseOptions}
                disabled={pending}
                onChange={setFixVersionIds}
              />
            </div>
          ) : null}

          {error && <p className="t-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="submit" disabled={submitDisabled} aria-label="Créer">
              <TypeIcon type={type} size={14} />
              Créer
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
