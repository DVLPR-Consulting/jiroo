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
import { ChevronDown, Plus } from "lucide-react";
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
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TypeIcon } from "@/components/icons/type-icon";
import { PrioIcon } from "@/components/icons/prio-icon";
import { LabelPill } from "@/components/items/label-pill";
import { MarkdownEditor } from "@/components/markdown/markdown-editor";
import { useOptionalViewUrlState } from "@/components/shell/view-url-state";
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
import { ITEM_DESCRIPTION_MAX, ITEM_TITLE_MAX } from "@/lib/validation/item";
import { useShortcutHandler } from "@/components/shortcuts/keyboard-shortcuts-provider";
import {
  FixVersionPicker,
  type FixVersionOption,
} from "@/components/items/fix-version-picker";

type Item = { id: string; key: string; type: ItemType; title: string };
type Status = { id: string; name: string };

/**
 * Extra fields of the « Nouvel item » dialog (Jira's Create screen). Each one
 * only shows when the view supplies it and the user may set it.
 */
export type NewItemFieldOptions = {
  /** Assignable members; the Assigné field needs `canAssign` too. */
  users?: { id: string; name: string }[];
  canAssign?: boolean;
  /** Enables « M'assigner » when this user is assignable. */
  currentUserId?: string;
  /** Open sprints a task can be planned in (needs scheduling). */
  sprints?: { id: string; name: string }[];
  labels?: { id: string; name: string; color: string }[];
};

export type NewItemButtonProps = {
  backlogId: string;
  backlogKey: string;
  items: Item[];
  statuses: Status[];
  initialStatusId?: string;
  /** Type and parent to start from (e.g. « + Créer une sous-tâche » in the drawer). */
  initialType?: ItemType;
  initialParentId?: string;
  trigger?: ReactNode;
  onCreated?: (item: { id: string; key: string }) => void;
  enableShortcut?: boolean;
  sprintId?: string | null;
  contextLabel?: string;
  canScheduleItems?: boolean;
  releaseOptions?: FixVersionOption[];
  fieldOptions?: NewItemFieldOptions;
};

/** The dialog data a view hands down to its « Nouvel item » buttons. */
export type NewItemDialogData = Pick<
  NewItemButtonProps,
  "backlogId" | "items" | "statuses" | "canScheduleItems" | "releaseOptions" | "fieldOptions"
>;

const EMPTY_FIELD_OPTIONS: NewItemFieldOptions = {};

// Shared field styling — matches Input's token-based look so native selects fit in.
const FIELD =
  "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 dark:bg-input/30";

/** One « libellé : champ » row of the field section (the drawer's Détails style). */
function FieldRow({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <>
      {htmlFor ? (
        <Label htmlFor={htmlFor} className="py-1.5 font-normal text-muted-foreground">
          {label}
        </Label>
      ) : (
        <span className="py-1.5 text-sm text-muted-foreground">{label}</span>
      )}
      <div className="flex min-w-0 flex-col gap-1">{children}</div>
    </>
  );
}

function LabelsPicker({
  labels,
  value,
  onChange,
  disabled,
}: {
  labels: { id: string; name: string; color: string }[];
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}) {
  const selected = labels.filter((label) => value.includes(label.id));
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Labels"
          disabled={disabled}
          className="flex min-h-8 w-full flex-wrap items-center gap-1.5 rounded-lg border border-input px-2.5 py-1 text-left text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
        >
          {selected.length > 0 ? (
            selected.map((label) => <LabelPill key={label.id} name={label.name} color={label.color} />)
          ) : (
            <span className="text-muted-foreground">Aucun</span>
          )}
          <ChevronDown aria-hidden className="ml-auto size-3.5 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        {labels.map((label) => (
          <DropdownMenuCheckboxItem
            key={label.id}
            checked={value.includes(label.id)}
            onSelect={(event) => event.preventDefault()}
            onCheckedChange={(checked) =>
              onChange(checked ? [...value, label.id] : value.filter((id) => id !== label.id))
            }
          >
            <span
              aria-hidden
              className="size-2 shrink-0 rounded-full"
              style={{ background: `var(${label.color})` }}
            />
            {label.name}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function NewItemButton({
  backlogId,
  backlogKey,
  items,
  statuses,
  initialStatusId,
  initialType,
  initialParentId,
  trigger,
  onCreated,
  enableShortcut = false,
  sprintId,
  contextLabel,
  canScheduleItems = true,
  releaseOptions = [],
  fieldOptions = EMPTY_FIELD_OPTIONS,
}: NewItemButtonProps) {
  const router = useRouter();
  const viewUrl = useOptionalViewUrlState();
  const contextualTask = contextLabel !== undefined;
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  const defaultType: ItemType = initialType ?? (contextualTask ? "tache" : "composant");
  const [templateId, setTemplateId] = useState<string>("");
  const [type, setType] = useState<ItemType>(defaultType);
  const [kind, setKind] = useState<ItemKind>("feature");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState<string>("");
  const [parentId, setParentId] = useState<string>(initialParentId ?? "");
  const [statusId, setStatusId] = useState<string>(initialStatusId ?? "");
  const [priority, setPriority] = useState<Priority>(0);
  const [fixVersionIds, setFixVersionIds] = useState<string[]>([]);
  const [assigneeId, setAssigneeId] = useState("");
  const [labelIds, setLabelIds] = useState<string[]>([]);
  const [dueDate, setDueDate] = useState("");
  const [points, setPoints] = useState("");
  const [plannedSprintId, setPlannedSprintId] = useState("");
  const [createAnother, setCreateAnother] = useState(false);
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
  // Only a listed parent counts: the select, the validation and the payload
  // always agree, even if a prefilled parent is not among the candidates.
  const selectedParentId = parentOptions.some((option) => option.id === parentId) ? parentId : "";
  const assignableUsers = fieldOptions.canAssign ? (fieldOptions.users ?? []) : [];
  const canAssignToMe =
    fieldOptions.currentUserId !== undefined &&
    assignableUsers.some((user) => user.id === fieldOptions.currentUserId) &&
    assigneeId !== fieldOptions.currentUserId;
  const plannableSprints = canScheduleItems ? (fieldOptions.sprints ?? []) : [];
  const backlogLabels = fieldOptions.labels ?? [];
  const isTask = type === "tache";

  /** Clears the draft; « Créer un autre » keeps everything but the text. */
  function resetText() {
    setTemplateId("");
    setTitle("");
    setDescription("");
    setError(null);
    setTitleError(null);
  }

  function reset() {
    resetText();
    setType(defaultType);
    setKind("feature");
    setParentId(initialParentId ?? "");
    setStatusId(initialStatusId ?? "");
    setPriority(0);
    setFixVersionIds([]);
    setAssigneeId("");
    setLabelIds([]);
    setDueDate("");
    setPoints("");
    setPlannedSprintId("");
    setCreateAnother(false);
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

  function openCreated(key: string) {
    if (viewUrl) {
      viewUrl.push((params) => params.set("item", key));
      return;
    }
    const url = new URL(window.location.href);
    url.searchParams.set("item", key);
    router.push(`${url.pathname}${url.search}`);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setTitleError(null);
    const sprintForTask = contextualTask ? undefined : plannedSprintId;
    startTransition(async () => {
      const result = await createItemAction({
        backlogKey,
        backlogId,
        type,
        kind,
        parentId: requiredParentType ? selectedParentId || null : null,
        title: title.trim(),
        description: description.trim() ? description : null,
        statusId: statusId || undefined,
        priority,
        fixVersionIds,
        ...(contextualTask ? { sprintId: sprintId ?? null } : {}),
        // Optional fields are sent only when set: assigning needs its own right.
        ...(assigneeId ? { assigneeId } : {}),
        ...(labelIds.length > 0 ? { labelIds } : {}),
        ...(dueDate ? { dueDate } : {}),
        ...(isTask && points.trim() !== "" ? { estimatePoints: Number(points) } : {}),
        ...(isTask && sprintForTask ? { sprintId: sprintForTask } : {}),
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
      if (createAnother) {
        // Jira's « Create another »: same type, parent, sprint and fields.
        resetText();
        titleRef.current?.focus();
      } else {
        setOpen(false);
        reset();
      }
      toast.success(`${item.key} créé`, {
        secondaryAction: { label: "Ouvrir", run: () => openCreated(item.key) },
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
  const submitDisabled = pending || !title.trim() || (parentRequired && !selectedParentId);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        // Keep the dialog open while a request is in flight (JIR-57).
        if (!o && pending) return;
        setOpen(o);
        if (!o) reset();
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
      <DialogContent
        aria-describedby={undefined}
        className="flex max-h-[min(90dvh,860px)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[760px]"
      >
        <DialogHeader className="flex-none flex-row items-center gap-2.5 border-b border-border px-6 py-4 pr-12">
          <DialogTitle className="text-lg font-semibold">
            {contextualTask ? `Nouvelle tâche — ${contextLabel}` : "Nouvel item"}
          </DialogTitle>
          <span className="rounded-[var(--radius-sm)] bg-[var(--primary)] px-1.5 py-0.5 font-mono text-[11px] text-[var(--primary-foreground)]">
            <span className="sr-only">Backlog </span>
            {backlogKey}
          </span>
        </DialogHeader>
        <form className="flex min-h-0 flex-1 flex-col" onSubmit={handleSubmit}>
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 py-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="item-type">Type</Label>
                <div className="flex items-center gap-2">
                  <TypeIcon type={type} />
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
              </div>

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
            </div>

            {canScheduleItems && parentRequired && (
              <div className="space-y-2">
                <Label htmlFor="item-parent">
                  Parent <span className="text-[var(--danger)]" aria-hidden>*</span>
                </Label>
                <select
                  id="item-parent"
                  className={FIELD}
                  value={selectedParentId}
                  required
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
              <Label htmlFor="item-title">
                Titre <span className="text-[var(--danger)]" aria-hidden>*</span>
              </Label>
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

            <div className="space-y-2">
              <span className="text-sm leading-none font-medium">Description</span>
              <MarkdownEditor
                label="Description"
                placeholder="Décrivez l’item…"
                maxLength={ITEM_DESCRIPTION_MAX}
                minHeightClassName="min-h-28"
                value={description}
                onChange={setDescription}
                disabled={pending}
              />
            </div>

            <section
              aria-label="Champs"
              className="rounded-[var(--radius-md)] border border-border bg-[var(--surface-2)]"
            >
              <h3 className="border-b border-border px-3.5 py-2.5 text-sm font-semibold">Détails</h3>
              <div className="grid grid-cols-1 gap-x-3 gap-y-1.5 p-3.5 sm:grid-cols-[104px_minmax(0,1fr)]">
                <FieldRow label="Statut" htmlFor="item-status">
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
                </FieldRow>

                {assignableUsers.length > 0 && (
                  <FieldRow label="Assigné" htmlFor="item-assignee">
                    <select
                      id="item-assignee"
                      className={FIELD}
                      value={assigneeId}
                      onChange={(e) => setAssigneeId(e.target.value)}
                    >
                      <option value="">Non assigné</option>
                      {assignableUsers.map((user) => (
                        <option key={user.id} value={user.id}>
                          {user.name}
                        </option>
                      ))}
                    </select>
                    {canAssignToMe && (
                      <button
                        type="button"
                        onClick={() => setAssigneeId(fieldOptions.currentUserId!)}
                        className="self-start text-[12.5px] text-[var(--primary)] hover:text-[var(--primary-hover)] hover:underline"
                      >
                        M’assigner
                      </button>
                    )}
                  </FieldRow>
                )}

                <FieldRow label="Priorité" htmlFor="item-priority">
                  <div className="flex items-center gap-2">
                    <PrioIcon priority={priority} />
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
                </FieldRow>

                {isTask && (
                  <FieldRow label="Points" htmlFor="item-points">
                    <input
                      id="item-points"
                      type="number"
                      min={0}
                      max={999.99}
                      step={0.01}
                      inputMode="decimal"
                      placeholder="Non estimé"
                      className={FIELD}
                      value={points}
                      onChange={(e) => setPoints(e.target.value)}
                    />
                  </FieldRow>
                )}

                {isTask && contextualTask && (
                  <FieldRow label="Sprint">
                    <span className="py-1.5 text-sm">{contextLabel}</span>
                  </FieldRow>
                )}
                {isTask && !contextualTask && plannableSprints.length > 0 && (
                  <FieldRow label="Sprint" htmlFor="item-sprint">
                    <select
                      id="item-sprint"
                      className={FIELD}
                      value={plannedSprintId}
                      onChange={(e) => setPlannedSprintId(e.target.value)}
                    >
                      <option value="">Backlog</option>
                      {plannableSprints.map((sprint) => (
                        <option key={sprint.id} value={sprint.id}>
                          {sprint.name}
                        </option>
                      ))}
                    </select>
                  </FieldRow>
                )}

                <FieldRow label="Nature" htmlFor="item-kind">
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
                </FieldRow>

                {backlogLabels.length > 0 && (
                  <FieldRow label="Labels">
                    <LabelsPicker
                      labels={backlogLabels}
                      value={labelIds}
                      onChange={setLabelIds}
                      disabled={pending}
                    />
                  </FieldRow>
                )}

                {releaseOptions.length > 0 ? (
                  <FieldRow label="Fix versions">
                    <FixVersionPicker
                      value={fixVersionIds}
                      options={releaseOptions}
                      disabled={pending}
                      onChange={setFixVersionIds}
                    />
                  </FieldRow>
                ) : null}

                <FieldRow label="Échéance" htmlFor="item-due-date">
                  <input
                    id="item-due-date"
                    type="date"
                    className={FIELD}
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                  />
                </FieldRow>
              </div>
            </section>

            {error && <p className="t-sm text-destructive">{error}</p>}
          </div>

          <DialogFooter className="m-0 flex-none flex-row items-center gap-2 rounded-none border-t border-border bg-[var(--surface)] px-6 py-3.5 sm:justify-end">
            <label className="mr-auto flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={createAnother}
                onChange={(e) => setCreateAnother(e.target.checked)}
                className="size-4 accent-[var(--primary)]"
              />
              Créer un autre
            </label>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => {
                setOpen(false);
                reset();
              }}
            >
              Annuler
            </Button>
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
