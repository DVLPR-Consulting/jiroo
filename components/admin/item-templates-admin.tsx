"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createItemTemplateAction, deleteItemTemplateAction, updateItemTemplateAction } from "@/app/actions/item-templates";
import { useRetainedWhileClosing } from "@/components/admin/use-retained-while-closing";
import { MarkdownEditor } from "@/components/markdown/markdown-editor";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectField } from "@/components/ui/select";
import { ITEM_KINDS, ITEM_KIND_LABELS, ITEM_TYPES, ITEM_TYPE_LABELS, PRIORITIES, PRIORITY_LABELS, type ItemKind, type ItemType, type Priority } from "@/lib/design/constants";
import type { ItemTemplateDto } from "@/lib/services/item-templates";
import { ITEM_DESCRIPTION_MAX, ITEM_TITLE_MAX } from "@/lib/validation/item";
import { ITEM_TEMPLATE_NAME_MAX, ITEM_TEMPLATES_PER_BACKLOG_MAX } from "@/lib/validation/item-template";

/** Shared by the settings list and the create dialog; missing labels are never applied. */
export function missingTemplateLabelsMessage(count: number): string {
  return count === 1 ? "1 label du modèle n’existe plus" : `${count} labels du modèle n’existent plus`;
}

type Draft = { name: string; itemType: ItemType | null; kind: ItemKind; title: string; description: string; priority: Priority; labelIds: string[] };
const emptyDraft = (): Draft => ({ name: "", itemType: null, kind: "feature", title: "", description: "", priority: 0, labelIds: [] });

/** Backlog administrators manage stable field defaults, without changing existing items. */
export function ItemTemplatesAdmin({ backlogId, templates, labels }: {
  backlogId: string;
  templates: ItemTemplateDto[];
  labels: { id: string; name: string; color: string }[];
}) {
  const router = useRouter();
  const [source, setSource] = useState(templates);
  const [models, setModels] = useState(templates);
  // A server refresh is authoritative, including edits in another administrator's tab.
  if (source !== templates) { setSource(templates); setModels(templates); }
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ItemTemplateDto | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [deleting, setDeleting] = useState<ItemTemplateDto | null>(null);
  const shownDeleting = useRetainedWhileClosing(deleting);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function edit(model: ItemTemplateDto | null) {
    setEditing(model);
    setDraft(model ? { name: model.name, itemType: model.itemType, kind: model.kind, title: model.title, description: model.description, priority: model.priority as Priority, labelIds: [...model.labelIds] } : emptyDraft());
    setError(null);
    setOpen(true);
  }
  function save() {
    setError(null);
    startTransition(async () => {
      try {
        const result = editing ? await updateItemTemplateAction({ id: editing.id, ...draft }) : await createItemTemplateAction({ backlogId, ...draft });
        if (!result.ok) { setError(result.error); return; }
        setModels((current) => [...current.filter((model) => model.id !== result.template.id), result.template]
          .sort((a, b) => a.name.localeCompare(b.name, "fr")));
        setOpen(false);
        router.refresh();
      } catch { setError("Action impossible. Réessayez."); }
    });
  }
  function remove() {
    if (!deleting) return;
    const id = deleting.id;
    setError(null);
    startTransition(async () => {
      try {
        const result = await deleteItemTemplateAction({ id });
        if (!result.ok) { setError(result.error); return; }
        setModels((current) => current.filter((model) => model.id !== id));
        setDeleting(null);
        router.refresh();
      } catch { setError("Action impossible. Réessayez."); }
    });
  }

  return (
    <section aria-label="Modèles de tickets" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{models.length} / {ITEM_TEMPLATES_PER_BACKLOG_MAX} modèles</p>
        <Button onClick={() => edit(null)} disabled={models.length >= ITEM_TEMPLATES_PER_BACKLOG_MAX}>Nouveau modèle</Button>
      </div>
      {models.length === 0 ? <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">Aucun modèle dans ce backlog. Les modèles fixes restent disponibles à la création.</p> : (
        <ul className="space-y-3">
          {models.map((model) => (
            <li key={model.id} className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-border bg-card p-4">
              <div className="min-w-0 flex-1 basis-48 space-y-1">
                <p className="break-words font-medium">{model.name}</p>
                <p className="text-sm text-muted-foreground">{model.itemType ? ITEM_TYPE_LABELS[model.itemType] : "Type libre"} · {ITEM_KIND_LABELS[model.kind]}</p>
                {model.missingLabelCount > 0 && <p className="text-sm text-muted-foreground">{missingTemplateLabelsMessage(model.missingLabelCount)}</p>}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" aria-label={`Modifier le modèle ${model.name}`} onClick={() => edit(model)}>Modifier</Button>
                <Button variant="ghost" size="sm" aria-label={`Supprimer le modèle ${model.name}`} onClick={() => { setError(null); setDeleting(model); }}>Supprimer</Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <Dialog open={open} onOpenChange={(next) => { if (!pending) setOpen(next); }}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Modifier le modèle" : "Nouveau modèle"}</DialogTitle>
            <DialogDescription>Ces valeurs préremplissent les nouveaux tickets. Chacun pourra les modifier avant de créer.</DialogDescription>
          </DialogHeader>
          <form aria-label="Modèle de ticket" className="space-y-4" onSubmit={(event) => { event.preventDefault(); save(); }}>
            <div className="space-y-2"><Label htmlFor="template-name">Nom du modèle</Label><Input id="template-name" value={draft.name} required maxLength={ITEM_TEMPLATE_NAME_MAX} disabled={pending} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2"><Label htmlFor="template-type">Type d’item</Label><SelectField id="template-type" value={draft.itemType ?? ""} onValueChange={(value) => setDraft({ ...draft, itemType: value === "" ? null : value as ItemType })} disabled={pending} options={[{ value: "", label: "Ne pas prédéfinir" }, ...ITEM_TYPES.map((value) => ({ value, label: ITEM_TYPE_LABELS[value] }))]} /></div>
              <div className="space-y-2"><Label htmlFor="template-kind">Nature</Label><SelectField id="template-kind" value={draft.kind} onValueChange={(kind) => setDraft({ ...draft, kind })} disabled={pending} options={ITEM_KINDS.map((value) => ({ value, label: ITEM_KIND_LABELS[value] }))} /></div>
            </div>
            <div className="space-y-2"><Label htmlFor="template-title">Titre de départ</Label><Input id="template-title" value={draft.title} maxLength={ITEM_TITLE_MAX} disabled={pending} onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></div>
            <div className="space-y-2"><Label>Description</Label><MarkdownEditor label="Description du modèle" value={draft.description} onChange={(description) => setDraft((current) => ({ ...current, description }))} maxLength={ITEM_DESCRIPTION_MAX} disabled={pending} /></div>
            <div className="space-y-2"><Label htmlFor="template-priority">Priorité</Label><SelectField id="template-priority" value={`${draft.priority}`} onValueChange={(value) => setDraft({ ...draft, priority: Number(value) as Priority })} disabled={pending} options={PRIORITIES.map((priority) => ({ value: `${priority}`, label: PRIORITY_LABELS[priority] }))} /></div>
            <fieldset className="space-y-2" disabled={pending}><legend className="mb-2 text-sm font-medium">Labels du backlog</legend>
              {labels.length === 0 ? <p className="text-sm text-muted-foreground">Aucun label dans ce backlog.</p> : <div className="flex flex-wrap gap-x-4 gap-y-2">{labels.map((label) => <label key={label.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.labelIds.includes(label.id)} onChange={(e) => setDraft({ ...draft, labelIds: e.target.checked ? [...draft.labelIds, label.id] : draft.labelIds.filter((id) => id !== label.id) })} />{label.name}</label>)}</div>}
              {editing && editing.missingLabelCount > 0 && <p className="text-sm text-muted-foreground">{missingTemplateLabelsMessage(editing.missingLabelCount)}</p>}
            </fieldset>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <DialogFooter><Button type="button" variant="outline" disabled={pending} onClick={() => setOpen(false)}>Annuler</Button><Button type="submit" disabled={pending || !draft.name.trim()}>{pending ? "Enregistrement…" : editing ? "Enregistrer" : "Créer le modèle"}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={deleting !== null} onOpenChange={(next) => { if (!next && !pending) setDeleting(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Supprimer le modèle ?</DialogTitle><DialogDescription>Le modèle « {shownDeleting?.name} » ne sera plus proposé. Les tickets déjà créés restent inchangés.</DialogDescription></DialogHeader>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <DialogFooter><Button variant="outline" disabled={pending} onClick={() => setDeleting(null)}>Annuler</Button><Button variant="destructive" disabled={pending} onClick={remove}>{pending ? "Suppression…" : "Supprimer"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
