"use client";

import { useState } from "react";
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

export type ViewSaveDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "rename";
  /** Prefill the name input (e.g. rename → current name; create → ""). */
  initialName?: string;
  /** Prefill the shared checkbox (create mode only); default false. */
  initialShared?: boolean;
  /** Disable inputs + submit while a server action runs. */
  pending?: boolean;
  /** Server error to show inline. */
  error?: string | null;
  onSubmit: (values: { name: string; shared: boolean }) => void;
};

/**
 * Controlled inner form.
 *
 * Rendered as a separate component so that React remounts it (resetting all
 * local state) every time the dialog opens or seed values change — the `key`
 * prop on the wrapping DialogContent handles this cleanly without needing a
 * useEffect that calls setState (which triggers cascading renders).
 */
function ViewSaveForm({
  mode,
  initialName,
  initialShared,
  pending,
  error,
  onCancel,
  onSubmit,
}: {
  mode: "create" | "rename";
  initialName: string;
  initialShared: boolean;
  pending: boolean;
  error?: string | null;
  onCancel: () => void;
  onSubmit: (values: { name: string; shared: boolean }) => void;
}) {
  const [name, setName] = useState(initialName);
  const [shared, setShared] = useState(initialShared);

  const submitLabel = mode === "create" ? "Enregistrer" : "Renommer";
  const submitDisabled = pending || name.trim() === "";

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitDisabled) return;
    onSubmit({ name: name.trim(), shared });
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      {/* Name field */}
      <div className="space-y-2">
        <Label htmlFor="view-name">Nom de la vue</Label>
        <Input
          id="view-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="ex. Mes tickets en cours"
          disabled={pending}
          autoFocus
        />
      </div>

      {/* Shared checkbox — create mode only */}
      {mode === "create" && (
        <div className="flex items-center gap-2">
          <input
            id="view-shared"
            type="checkbox"
            checked={shared}
            onChange={(e) => setShared(e.target.checked)}
            disabled={pending}
            className="h-4 w-4 rounded border border-input accent-primary disabled:pointer-events-none disabled:opacity-50"
          />
          <Label htmlFor="view-shared">Partager avec l&apos;équipe</Label>
        </div>
      )}

      {/* Inline server error */}
      {error && <p className="t-sm text-destructive">{error}</p>}

      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={onCancel}
        >
          Annuler
        </Button>
        <Button type="submit" disabled={submitDisabled}>
          {submitLabel}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function ViewSaveDialog({
  open,
  onOpenChange,
  mode,
  initialName = "",
  initialShared = false,
  pending = false,
  error,
  onSubmit,
}: ViewSaveDialogProps) {
  const title = mode === "create" ? "Enregistrer la vue" : "Renommer la vue";

  // The `key` prop on ViewSaveForm forces a full remount of the inner form
  // whenever the dialog opens or the seed values change, resetting local field
  // state without any setState-in-effect pattern. It stays OFF DialogContent so
  // Radix keeps its stable Presence lifecycle and the exit animation runs.
  const formKey = `${open ? "open" : "closed"}-${initialName}-${String(initialShared)}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {mode === "create"
              ? "Donnez un nom à cette vue pour la retrouver facilement."
              : "Modifiez le nom de la vue."}
          </DialogDescription>
        </DialogHeader>

        <ViewSaveForm
          key={formKey}
          mode={mode}
          initialName={initialName}
          initialShared={initialShared}
          pending={pending}
          error={error}
          onCancel={() => onOpenChange(false)}
          onSubmit={onSubmit}
        />
      </DialogContent>
    </Dialog>
  );
}
