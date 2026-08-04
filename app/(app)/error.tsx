"use client";

import { useEffect } from "react";
import { TriangleAlert } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";

export default function Error({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="grid h-full place-items-center p-6">
      <EmptyState
        icon={<TriangleAlert className="size-5" />}
        title="Une erreur est survenue"
        description="Nous n’avons pas pu charger cette page."
        action={
          <Button type="button" onClick={() => unstable_retry()}>
            Réessayer
          </Button>
        }
      />
    </div>
  );
}
