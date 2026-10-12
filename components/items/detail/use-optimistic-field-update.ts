"use client";

import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { updateItemAction } from "@/app/actions/items";
import { FieldStatusContext } from "@/components/items/detail/field-status";

type UpdatePatch = Omit<
  Parameters<typeof updateItemAction>[0],
  "id" | "backlogKey"
>;

export function useOptimisticFieldUpdate<T>({
  value,
  itemId,
  backlogKey,
  toPatch,
  onSuccess,
}: {
  value: T;
  itemId: string;
  backlogKey: string;
  toPatch: (next: T) => UpdatePatch;
  onSuccess?: () => void;
}) {
  const router = useRouter();
  const [optimistic, setOptimistic] = useState(value);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirmedRef = useRef(value);
  const pendingRef = useRef(false);
  const revisionRef = useRef(0);
  const reportStatus = useContext(FieldStatusContext);

  useEffect(() => {
    reportStatus?.({ pending, error });
  }, [error, pending, reportStatus]);

  // The latest server value is always recorded as the confirmed one, even
  // while a save is pending (the drawer may refresh meanwhile): a failure
  // then falls back to it instead of an older value. The display only
  // follows it once nothing is saving.
  useEffect(() => {
    confirmedRef.current = value;
    if (pendingRef.current) return;
    setOptimistic(value);
  }, [value]);

  const update = useCallback(
    (next: T) => {
      const revision = ++revisionRef.current;
      pendingRef.current = true;
      setOptimistic(next);
      setPending(true);
      setError(null);

      void (async () => {
        try {
          const result = await updateItemAction({
            id: itemId,
            backlogKey,
            ...toPatch(next),
          });
          if (revision !== revisionRef.current) return;
          if (!result.ok) {
            setOptimistic(confirmedRef.current);
            setError(result.error);
            return;
          }
          confirmedRef.current = next;
          setOptimistic(next);
          onSuccess?.();
          router.refresh();
        } catch {
          if (revision !== revisionRef.current) return;
          setOptimistic(confirmedRef.current);
          setError("Mise à jour impossible.");
        } finally {
          if (revision === revisionRef.current) {
            pendingRef.current = false;
            setPending(false);
          }
        }
      })();
    },
    [backlogKey, itemId, onSuccess, router, toPatch],
  );

  return { value: optimistic, pending, error, update };
}
