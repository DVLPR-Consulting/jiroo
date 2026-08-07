"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { updateItemAction } from "@/app/actions/items";

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

  useEffect(() => {
    if (pendingRef.current) return;
    confirmedRef.current = value;
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
