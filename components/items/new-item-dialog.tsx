"use client";

import {
  useCallback,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useTransition,
  type ReactNode,
  type RefObject,
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
import { SelectField, type SelectFieldOption } from "@/components/ui/select";
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
import { readableTextOn } from "@/lib/design/contrast";
import { ITEM_TEMPLATES, getTemplate, missingTemplateLabelsMessage } from "@/lib/items/templates";
import { isHiddenByFilters, type Filters } from "@/lib/items/filter";
import { allowedParentType } from "@/lib/tree/hierarchy";
import { toast } from "@/lib/toast";
import { ITEM_DESCRIPTION_MAX, ITEM_TITLE_MAX } from "@/lib/validation/item";
import { useShortcutHandler } from "@/components/shortcuts/keyboard-shortcuts-provider";
import {
  FixVersionPicker,
  type FixVersionOption,
} from "@/components/items/fix-version-picker";
import type { ItemTemplateDto } from "@/lib/services/item-templates";
import { AssigneePermissionHint } from "@/components/items/assignee-permission-hint";
import { ItemPicker, type ItemChoice } from "@/components/items/item-picker";

/**
 * `category` lets the dialog name the status a create without `statusId`
 * lands in (the backlog's first « todo » status, in board order).
 */
type Status = { id: string; name: string; category?: string };

/**
 * Extra fields of the « Nouvel item » dialog (Jira's Create screen). Each one
 * only shows when the view supplies it and the user may set it.
 */
export type NewItemFieldOptions = {
  /** Assignable members; the Assigné field needs `canAssign` too. */
  users?: { id: string; name: string }[];
  canAssign?: boolean;
  canBrowseUsers?: boolean;
  /** Enables « M'assigner » when this user is assignable. */
  currentUserId?: string;
  /** Open sprints a task can be planned in (needs scheduling). */
  sprints?: { id: string; name: string }[];
  labels?: { id: string; name: string; color: string }[];
};

export type NewItemButtonProps = {
  backlogId: string;
  backlogKey: string;
  /** The backlog's own color, for its key tag (the primary color otherwise). */
  backlogColor?: string;
  /**
   * The page whose drawer shows a created item (« Ouvrir »); the current page
   * by default. Pages without a drawer send it to the backlog view.
   */
  openCreatedAt?: string;
  /**
   * The backlog's Composants and Epics (few), for the choices that stay in
   * the page: the inline Epic picker and the first-steps guide. The dialog's
   * own Parent field searches the backlog on demand (JIR-118).
   */
  structure?: ItemChoice[];
  statuses: Status[];
  initialStatusId?: string;
  /** Type and parent to start from (e.g. « + Créer une sous-tâche » in the drawer). */
  initialType?: ItemType;
  initialParent?: ItemChoice | null;
  trigger?: ReactNode;
  onCreated?: (item: { id: string; key: string }) => void;
  /** The dialog really closed (cancel, Échap or a create without « Créer un autre »). */
  onClosed?: () => void;
  enableShortcut?: boolean;
  sprintId?: string | null;
  contextLabel?: string;
  canScheduleItems?: boolean;
  releaseOptions?: FixVersionOption[];
  fieldOptions?: NewItemFieldOptions;
  /** Shared backlog templates, already filtered by backlog access and live labels. */
  templates?: ItemTemplateDto[];
  /**
   * Pre-fills the title when opened (« Plus d’options » of inline creation);
   * `initialParent` is re-applied on every opening too.
   */
  initialTitle?: string;
  /**
   * The filters the view applies (JIR-92): the success message says when
   * they leave out the item just created.
   */
  viewFilters?: Filters;
};

/** The dialog data a view hands down to its « Nouvel item » buttons. */
export type NewItemDialogData = Pick<
  NewItemButtonProps,
  "backlogId" | "backlogColor" | "structure" | "statuses" | "canScheduleItems" | "releaseOptions" | "fieldOptions" | "viewFilters" | "templates"
>;

const EMPTY_FIELD_OPTIONS: NewItemFieldOptions = {};

const EMPTY_TEMPLATES: ItemTemplateDto[] = [];

const TEMPLATE_OPTIONS: SelectFieldOption[] = [
  { value: "", label: "Aucun" },
  ...ITEM_TEMPLATES.map((template) => ({ value: template.id, label: template.name })),
];
const PRIORITY_OPTIONS: SelectFieldOption<`${Priority}`>[] = PRIORITIES.map((priority) => ({
  value: `${priority}`,
  label: PRIORITY_LABELS[priority],
  icon: <PrioIcon priority={priority} />,
}));
const KIND_OPTIONS: SelectFieldOption<ItemKind>[] = ITEM_KINDS.map((kind) => ({
  value: kind,
  label: ITEM_KIND_LABELS[kind],
}));

/** Feminine type names, for their French articles (« une Epic », « aucun Composant »). */
const FEMININE_TYPES: ReadonlySet<ItemType> = new Set(["epic", "tache", "soustache"]);

/** « un Composant », « une Epic »… */
function aTypeName(type: ItemType): string {
  return `${FEMININE_TYPES.has(type) ? "une" : "un"} ${ITEM_TYPE_LABELS[type]}`;
}

/** « Aucun Composant », « Aucune Epic »… */
function noTypeName(type: ItemType): string {
  return `${FEMININE_TYPES.has(type) ? "Aucune" : "Aucun"} ${ITEM_TYPE_LABELS[type]}`;
}

/** The rule the Parent field states under itself (« Une Epic se rattache toujours à un Composant. »). */
function parentRule(type: ItemType, parentType: ItemType): string {
  const rule = `${aTypeName(type)} se rattache toujours à ${aTypeName(parentType)}.`;
  return rule.charAt(0).toUpperCase() + rule.slice(1);
}

/**
 * The status the server gives a create without `statusId`: the first
 * « todo » status in board order (`statuses` arrive in that order). Without
 * categories, the first status stands in.
 */
function defaultStatusOf(statuses: Status[]): Status | undefined {
  return statuses.find((status) => status.category === undefined || status.category === "todo");
}

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
        <Label htmlFor={htmlFor} className="font-normal text-muted-foreground sm:py-2">
          {label}
        </Label>
      ) : (
        <span className="text-sm text-muted-foreground sm:py-2">{label}</span>
      )}
      <div className="flex min-h-8 min-w-0 items-center gap-2">{children}</div>
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
          className="flex min-h-8 w-full flex-wrap items-center gap-1.5 rounded-lg border border-input bg-transparent px-2.5 py-1 text-left text-sm transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 dark:bg-input/30 dark:hover:bg-input/50"
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

/** The success message of a create the view's filters leave out (JIR-92). */
export function createdHiddenMessage(key: string): string {
  return `${key} créé — masqué par les filtres de la vue.`;
}

/**
 * The view's filters as they are now, for a create's success message read
 * after the awaited request (JIR-92): the user may change the filters while
 * it runs. `undefined` once the creating component left the view.
 */
export function useCurrentViewFilters(viewFilters: Filters | undefined) {
  const latest = useRef<{ filters: Filters | undefined; mounted: boolean }>({
    filters: viewFilters,
    mounted: false,
  });
  useLayoutEffect(() => {
    latest.current.filters = viewFilters;
  });
  useLayoutEffect(() => {
    const current = latest.current;
    current.mounted = true;
    return () => {
      current.mounted = false;
    };
  }, []);
  return useCallback(
    () => (latest.current.mounted ? latest.current.filters : undefined),
    [],
  );
}

/** « Ouvrir » of a create's success message: shows the item in the drawer. */
export function useOpenCreatedItem(openAt?: string) {
  const router = useRouter();
  const viewUrl = useOptionalViewUrlState();
  return (key: string) => {
    if (openAt) {
      router.push(`${openAt}?item=${encodeURIComponent(key)}`);
      return;
    }
    if (viewUrl) {
      viewUrl.push((params) => params.set("item", key));
      return;
    }
    const url = new URL(window.location.href);
    url.searchParams.set("item", key);
    router.push(`${url.pathname}${url.search}`);
  };
}

export function NewItemButton({
  backlogId,
  backlogKey,
  backlogColor,
  openCreatedAt,
  statuses,
  initialStatusId,
  initialType,
  initialParent,
  trigger,
  onCreated,
  onClosed,
  enableShortcut = false,
  sprintId,
  contextLabel,
  canScheduleItems = true,
  releaseOptions = [],
  fieldOptions = EMPTY_FIELD_OPTIONS,
  templates = EMPTY_TEMPLATES,
  initialTitle,
  viewFilters,
}: NewItemButtonProps) {
  const router = useRouter();
  const openCreated = useOpenCreatedItem(openCreatedAt);
  const currentViewFilters = useCurrentViewFilters(viewFilters);
  const contextualTask = contextLabel !== undefined;
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  const defaultType: ItemType = initialType ?? (contextualTask ? "tache" : "composant");
  const [templateId, setTemplateId] = useState<string>("");
  const [sharedFieldsApplied, setSharedFieldsApplied] = useState(false);
  const [missingTemplateLabelCount, setMissingTemplateLabelCount] = useState(0);
  const [type, setType] = useState<ItemType>(defaultType);
  const [kind, setKind] = useState<ItemKind>("feature");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState<string>("");
  const [parent, setParent] = useState<ItemChoice | null>(initialParent ?? null);
  // What the Parent picker found at its first look: nothing of that level.
  const [noParentCandidate, setNoParentCandidate] = useState(false);
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
  const [parentError, setParentError] = useState<string | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const typeTriggerRef = useRef<HTMLButtonElement>(null);
  const parentTriggerRef = useRef<HTMLInputElement>(null);
  // The field to focus once React has committed the change that asked for it.
  const focusAfterCommit = useRef<RefObject<HTMLElement | null> | null>(null);
  // Guarantees that commit, even when the state did not change.
  const [, setFocusRequest] = useState(0);
  const parentHintId = useId();
  const parentHelpId = useId();
  const parentErrorId = useId();
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

  const availableItemTypes = canScheduleItems
    ? ITEM_TYPES
    : ITEM_TYPES.filter((candidate) => allowedParentType(candidate) === null);
  // What is shown is what is sent: a sprint-contextual create is always a
  // task, and a type the user may not create falls back to the first one
  // offered instead of hiding behind another label.
  const effectiveType: ItemType = contextualTask
    ? "tache"
    : availableItemTypes.includes(type)
      ? type
      : availableItemTypes[0]!;
  const requiredParentType = allowedParentType(effectiveType);
  // Only a parent of the required level counts: the field, the validation
  // and the payload always agree, even if a prefilled parent is another level.
  const selectedParent = parent && parent.type === requiredParentType ? parent : null;
  // A parent already picked is a candidate, whatever the picker's first look said.
  const noCandidate = noParentCandidate && selectedParent === null;
  // No candidate for the required parent (JIR-91): the backlog has none of
  // that level yet, so the dialog offers to create it: this same draft
  // switches to the parent's type, keeping its title and description. A
  // sprint-contextual create stays a task, so it only explains.
  const canSwitchToParentType =
    requiredParentType !== null &&
    noCandidate &&
    !contextualTask &&
    availableItemTypes.includes(requiredParentType);
  const assignableUsers = fieldOptions.canAssign ? (fieldOptions.users ?? []) : [];
  const canAssignToMe =
    fieldOptions.currentUserId !== undefined &&
    assignableUsers.some((user) => user.id === fieldOptions.currentUserId) &&
    assigneeId !== fieldOptions.currentUserId;
  const plannableSprints = canScheduleItems ? (fieldOptions.sprints ?? []) : [];
  const backlogLabels = fieldOptions.labels ?? [];
  const isTask = effectiveType === "tache";
  const defaultStatus = defaultStatusOf(statuses);
  const typeLabelId = useId();

  /** Clears the draft; « Créer un autre » keeps everything but the text. */
  function resetText() {
    setTemplateId("");
    setSharedFieldsApplied(false);
    setMissingTemplateLabelCount(0);
    setTitle("");
    setDescription("");
    setError(null);
    setTitleError(null);
    setParentError(null);
  }

  function reset() {
    resetText();
    setType(defaultType);
    setKind("feature");
    setParent(initialParent ?? null);
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
    setMissingTemplateLabelCount(0);
    if (!id) {
      // Reset the stable fields that a template can prefill; unrelated choices stay.
      if (sharedFieldsApplied) {
        handleTypeChange(defaultType);
        setTitle(initialTitle ?? "");
        setPriority(0);
        setLabelIds([]);
      }
      setSharedFieldsApplied(false);
      setKind("feature");
      setDescription("");
      return;
    }
    const shared = templates.find((template) => template.id === id);
    if (shared) {
      setSharedFieldsApplied(true);
      // Templates do not grant a type forbidden by the current creation context.
      if (shared.itemType && !contextualTask && availableItemTypes.includes(shared.itemType)) handleTypeChange(shared.itemType);
      setKind(shared.kind);
      setTitle(shared.title);
      setDescription(shared.description);
      setPriority(shared.priority as Priority);
      const liveIds = shared.labelIds.filter((labelId) => backlogLabels.some((label) => label.id === labelId));
      setLabelIds(liveIds);
      setMissingTemplateLabelCount(shared.missingLabelCount + shared.labelIds.length - liveIds.length);
      return;
    }
    const fixed = getTemplate(id);
    if (fixed) { setKind(fixed.kind); setDescription(fixed.description); }
  }

  function handleTypeChange(next: ItemType) {
    setType(next);
    // The required parent changes with the type: its error no longer applies,
    // and the picker says again whether that level has candidates.
    setParentError(null);
    setNoParentCandidate(false);
    // Clear the parent if it no longer matches the new required type.
    const nextParentType = allowedParentType(next);
    if (parent && (!nextParentType || parent.type !== nextParentType)) setParent(null);
  }

  /** « Créer un Composant » (JIR-91): the same draft becomes the missing parent. */
  function switchToParentType() {
    if (!requiredParentType) return;
    handleTypeChange(requiredParentType);
    // The button goes away with the parent field: land on the type just set,
    // after the commit so the field already names it when it gets focus.
    focusOnceCommitted(typeTriggerRef);
  }

  function focusOnceCommitted(target: RefObject<HTMLElement | null>) {
    focusAfterCommit.current = target;
    setFocusRequest((request) => request + 1);
  }

  // Runs after each commit and consumes a pending focus request: the field is
  // then read out with what the commit changed (its type, its error).
  useLayoutEffect(() => {
    const target = focusAfterCommit.current;
    if (!target) return;
    focusAfterCommit.current = null;
    const trigger = target.current;
    if (trigger?.isConnected) trigger.focus();
  });

  /**
   * The new item's sprints under the Sprint filter's rule: a Tâche has the
   * sprint actually sent, a Composant or an Epic none, and a Sous-tâche its
   * parent tâche's, which the dialog does not know (`undefined`).
   */
  function createdSprintIds(): string[] | undefined {
    if (effectiveType === "soustache") return undefined;
    if (!isTask) return [];
    const sent = contextualTask ? sprintId : plannedSprintId;
    return sent ? [sent] : [];
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // Jira's required field: « Créer » says what is missing instead of
    // staying silently disabled (JIR-69). The server still checks it.
    if (requiredParentType && !selectedParent) {
      setParentError(
        noCandidate
          ? `Parent obligatoire : créez d’abord ${aTypeName(requiredParentType)}.`
          : `Parent obligatoire : choisissez ${aTypeName(requiredParentType)}.`,
      );
      focusOnceCommitted(parentTriggerRef);
      return;
    }
    setError(null);
    setTitleError(null);
    const sprintForTask = contextualTask ? undefined : plannedSprintId;
    // What the request sends, kept for the success message: the draft may
    // change while it runs (« Créer un autre » keeps the dialog open).
    const sent = { labelIds, fixVersionIds, sprintIds: createdSprintIds() };
    startTransition(async () => {
      const result = await createItemAction({
        backlogKey,
        backlogId,
        type: effectiveType,
        kind,
        parentId: requiredParentType ? (selectedParent?.id ?? null) : null,
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
      // Checked against the filters of now, not of the submit.
      const hidden = isHiddenByFilters({ ...item, ...sent }, currentViewFilters());
      onCreated?.(item);
      if (createAnother) {
        // Jira's « Create another »: same type, parent, sprint and fields.
        resetText();
        titleRef.current?.focus();
      } else {
        setOpen(false);
        reset();
        onClosed?.();
      }
      toast.success(hidden ? createdHiddenMessage(item.key) : `${item.key} créé`, {
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
  // Without the scheduling right there is no Parent field to point at: only
  // a parent handed down (« Plus d’options ») lets the task be created.
  const submitDisabled =
    pending || !title.trim() || (parentRequired && !canScheduleItems && !selectedParent);
  const parentDescribedBy = [
    parentError ? parentErrorId : null,
    // JIR-91's « Aucune Epic… » already states the rule: no second sentence.
    noCandidate ? parentHintId : parentHelpId,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        // Keep the dialog open while a request is in flight (JIR-57).
        if (!o && pending) return;
        setOpen(o);
        if (!o) {
          reset();
          onClosed?.();
        }
        if (o && initialTitle) setTitle(initialTitle);
        if (o && initialParent) setParent(initialParent);
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
        onEscapeKeyDown={(event) => {
          // Échap belongs to a widget that closes itself on it (the Parent
          // picker's open list): the dialog stays.
          const target = event.target;
          if (target instanceof Element && target.closest("[data-local-escape]")) {
            event.preventDefault();
          }
        }}
      >
        <DialogHeader className="flex-none flex-row items-center gap-2.5 border-b border-border px-6 py-4 pr-12">
          <DialogTitle className="text-lg font-semibold">
            {contextualTask ? `Nouvelle tâche — ${contextLabel}` : "Nouvel item"}
          </DialogTitle>
          <span
            className="rounded-[var(--radius-sm)] bg-[var(--primary)] px-1.5 py-0.5 font-mono text-[11px] text-[var(--primary-foreground)]"
            style={backlogColor ? { background: backlogColor, color: readableTextOn(backlogColor) } : undefined}
          >
            <span className="sr-only">Backlog </span>
            {backlogKey}
          </span>
        </DialogHeader>
        <form className="flex min-h-0 flex-1 flex-col" onSubmit={handleSubmit}>
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 py-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                {contextualTask ? (
                  <>
                    <span id={typeLabelId} className="block text-sm leading-none font-medium">
                      Type
                    </span>
                    {/* A sprint-contextual create is a task: shown, not chosen. */}
                    <div
                      role="group"
                      aria-labelledby={typeLabelId}
                      className="flex h-8 items-center gap-2 text-sm"
                    >
                      <TypeIcon type="tache" />
                      {ITEM_TYPE_LABELS.tache}
                    </div>
                  </>
                ) : (
                  <>
                    <Label htmlFor="item-type">Type</Label>
                    <SelectField
                      id="item-type"
                      triggerRef={typeTriggerRef}
                      value={effectiveType}
                      onValueChange={handleTypeChange}
                      options={availableItemTypes.map((t) => ({
                        value: t,
                        label: ITEM_TYPE_LABELS[t],
                        icon: <TypeIcon type={t} />,
                      }))}
                    />
                  </>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="item-template">Modèle</Label>
                <SelectField
                  id="item-template"
                  value={templateId}
                  onValueChange={handleTemplateChange}
                  options={[...TEMPLATE_OPTIONS, ...templates.map((template) => ({ value: template.id, label: template.name, group: "Modèles du backlog" }))]}
                />
              </div>
            </div>

            {missingTemplateLabelCount > 0 && <p role="status" className="text-sm text-muted-foreground">{missingTemplateLabelsMessage(missingTemplateLabelCount)}</p>}

            {parentRequired && canScheduleItems && (
              <div className="space-y-2">
                <Label htmlFor="item-parent">
                  Parent <span className="text-[var(--danger)]" aria-hidden>*</span>
                  <span className="sr-only">(obligatoire)</span>
                </Label>
                {/* Searched on demand (JIR-118): the page carries no candidate list. */}
                <ItemPicker
                  id="item-parent"
                  backlogKey={backlogKey}
                  types={[requiredParentType]}
                  value={selectedParent}
                  onChange={(next) => {
                    setParent(next);
                    setParentError(null);
                  }}
                  onEmptyChange={setNoParentCandidate}
                  emptyLabel={`${noTypeName(requiredParentType)} dans ce backlog.`}
                  placeholder={`Choisir ${aTypeName(requiredParentType).toLowerCase()}…`}
                  inputRef={parentTriggerRef}
                  aria-required
                  aria-invalid={parentError ? true : undefined}
                  aria-describedby={parentDescribedBy}
                />
                {parentError && (
                  <p id={parentErrorId} className="t-sm text-destructive">
                    {parentError}
                  </p>
                )}
                {!noCandidate && (
                  <p id={parentHelpId} className="t-sm text-muted-foreground">
                    {parentRule(effectiveType, requiredParentType)}
                  </p>
                )}
                {noCandidate && (
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                    <p id={parentHintId} className="t-sm min-w-0 flex-1 basis-56 text-muted-foreground">
                      {`${noTypeName(requiredParentType)} dans ce backlog : ${aTypeName(effectiveType)} se rattache toujours à ${aTypeName(requiredParentType)}.`}
                    </p>
                    {canSwitchToParentType && (
                      <Button type="button" variant="outline" size="sm" onClick={switchToParentType}>
                        <span aria-hidden>
                          <TypeIcon type={requiredParentType} size={14} />
                        </span>
                        Créer {aTypeName(requiredParentType)}
                      </Button>
                    )}
                  </div>
                )}
              </div>
            )}
            {parentRequired && !canScheduleItems && (
              <p className="t-sm text-muted-foreground">
                Une {ITEM_TYPE_LABELS[effectiveType].toLowerCase()} se rattache à un{" "}
                {ITEM_TYPE_LABELS[requiredParentType].toLowerCase()} : il faut le droit de planifier.
              </p>
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
              <div className="grid grid-cols-1 items-center gap-x-3 gap-y-1.5 p-3.5 sm:grid-cols-[104px_minmax(0,1fr)]">
                <FieldRow label="Statut" htmlFor="item-status">
                  {/* No pick sends no statusId: the trigger names the status the server will use. */}
                  <SelectField
                    id="item-status"
                    value={statusId || defaultStatus?.id || ""}
                    onValueChange={setStatusId}
                    placeholder="Statut par défaut"
                    options={statuses.map((s) => ({ value: s.id, label: s.name }))}
                  />
                </FieldRow>

                {fieldOptions.canAssign && (
                  <FieldRow label="Assigné" htmlFor="item-assignee">
                    <SelectField
                      id="item-assignee"
                      footer={fieldOptions.canBrowseUsers === false ? <AssigneePermissionHint /> : undefined}
                      value={assigneeId}
                      onValueChange={setAssigneeId}
                      options={[
                        { value: "", label: "Non assigné" },
                        ...assignableUsers.map((user) => ({ value: user.id, label: user.name })),
                      ]}
                    />
                    {canAssignToMe && (
                      <button
                        type="button"
                        onClick={() => setAssigneeId(fieldOptions.currentUserId!)}
                        className="shrink-0 rounded-sm text-[12.5px] whitespace-nowrap text-[var(--primary)] outline-none hover:text-[var(--primary-hover)] hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
                      >
                        M’assigner
                      </button>
                    )}
                  </FieldRow>
                )}

                <FieldRow label="Priorité" htmlFor="item-priority">
                  <SelectField
                    id="item-priority"
                    value={`${priority}`}
                    onValueChange={(next) => setPriority(Number(next) as Priority)}
                    options={PRIORITY_OPTIONS}
                  />
                </FieldRow>

                {isTask && (
                  <FieldRow label="Points" htmlFor="item-points">
                    <Input
                      id="item-points"
                      type="number"
                      min={0}
                      max={999.99}
                      step={0.01}
                      inputMode="decimal"
                      placeholder="Non estimé"
                      value={points}
                      onChange={(e) => setPoints(e.target.value)}
                    />
                  </FieldRow>
                )}

                {isTask && contextualTask && (
                  <FieldRow label="Sprint">
                    <span className="text-sm">{contextLabel}</span>
                  </FieldRow>
                )}
                {isTask && !contextualTask && plannableSprints.length > 0 && (
                  <FieldRow label="Sprint" htmlFor="item-sprint">
                    <SelectField
                      id="item-sprint"
                      value={plannedSprintId}
                      onValueChange={setPlannedSprintId}
                      options={[
                        { value: "", label: "Backlog" },
                        ...plannableSprints.map((sprint) => ({ value: sprint.id, label: sprint.name })),
                      ]}
                    />
                  </FieldRow>
                )}

                <FieldRow label="Nature" htmlFor="item-kind">
                  <SelectField
                    id="item-kind"
                    value={kind}
                    onValueChange={setKind}
                    options={KIND_OPTIONS}
                  />
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
                      field
                    />
                  </FieldRow>
                ) : null}

                <FieldRow label="Échéance" htmlFor="item-due-date">
                  {/* Native picker, in French like the page (dd/mm/yyyy → jj/mm/aaaa). */}
                  <Input
                    id="item-due-date"
                    type="date"
                    lang="fr"
                    className="dark:[color-scheme:dark]"
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
                onClosed?.();
              }}
            >
              Annuler
            </Button>
            <Button type="submit" disabled={submitDisabled} aria-label="Créer">
              <TypeIcon type={effectiveType} size={14} />
              Créer
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
