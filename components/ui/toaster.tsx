"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { subscribe, getSnapshot, dismiss, toast } from "@/lib/toast";
import type { Toast } from "@/lib/toast";

// ---------------------------------------------------------------------------
// ToastCard — individual card with auto-dismiss timer
// ---------------------------------------------------------------------------

function ToastCard({ toast: t }: { toast: Toast }) {
  const [actionPending, setActionPending] = useState(false);

  useEffect(() => {
    if (actionPending) return;
    const timer = setTimeout(() => dismiss(t.id), 4000);
    return () => clearTimeout(timer);
  }, [actionPending, t.id]);

  const isError = t.variant === "error";

  async function handleAction() {
    if (!t.action || actionPending) return;
    setActionPending(true);
    try {
      await t.action.run();
      dismiss(t.id);
    } catch {
      setActionPending(false);
      toast.error("Annulation impossible.");
    }
  }

  return (
    <div
      className="pointer-events-auto flex items-start gap-2 rounded-md border px-3 py-2 text-sm shadow animate-in fade-in slide-in-from-bottom-2 motion-reduce:animate-none"
      style={
        isError
          ? {
              background: "color-mix(in oklch, var(--danger) 12%, var(--surface))",
              borderColor: "color-mix(in oklch, var(--danger) 30%, transparent)",
              color: "var(--danger)",
            }
          : {
              background: "color-mix(in oklch, var(--success) 12%, var(--surface))",
              borderColor: "color-mix(in oklch, var(--success) 30%, transparent)",
              color: "var(--success)",
            }
      }
    >
      <span className="flex-1">{t.message}</span>
      {t.action && (
        <button
          type="button"
          onClick={handleAction}
          disabled={actionPending}
          className="shrink-0 rounded border border-current px-2 py-0.5 font-medium hover:bg-current/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:cursor-wait disabled:opacity-50"
        >
          {t.action.label}
        </button>
      )}
      <button
        type="button"
        onClick={() => dismiss(t.id)}
        aria-label="Fermer"
        className="shrink-0 opacity-60 hover:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
      >
        ×
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Toaster — fixed stack, bottom-right
// ---------------------------------------------------------------------------

export function Toaster() {
  const toasts = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  // The live region is always mounted so screen readers reliably announce
  // toasts inserted after mount (some readers skip content added at the same
  // time the region appears). It is pointer-events-none and visually empty.
  return (
    <div
      className="pointer-events-none fixed bottom-4 right-4 z-[100] flex flex-col gap-2"
      role="status"
      aria-live="polite"
    >
      {toasts.map((t) => (
        <ToastCard key={t.id} toast={t} />
      ))}
    </div>
  );
}
