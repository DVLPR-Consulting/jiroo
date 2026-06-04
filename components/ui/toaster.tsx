"use client";

import { useEffect, useSyncExternalStore } from "react";
import { subscribe, getSnapshot, dismiss } from "@/lib/toast";
import type { Toast } from "@/lib/toast";

// ---------------------------------------------------------------------------
// ToastCard — individual card with auto-dismiss timer
// ---------------------------------------------------------------------------

function ToastCard({ toast: t }: { toast: Toast }) {
  useEffect(() => {
    const timer = setTimeout(() => dismiss(t.id), 4000);
    return () => clearTimeout(timer);
  }, [t.id]);

  const isError = t.variant === "error";

  return (
    <div
      className="pointer-events-auto flex items-start gap-2 rounded-md border px-3 py-2 text-sm shadow animate-in fade-in slide-in-from-bottom-2"
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
