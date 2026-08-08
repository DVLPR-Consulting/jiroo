"use client";

import { Button } from "@/components/ui/button";

export default function ReportsError({
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <section className="mx-auto max-w-3xl space-y-3 p-6 lg:p-8">
      <h1 className="t-h1">Impossible de charger les rapports</h1>
      <p className="text-sm text-muted-foreground">
        Une erreur temporaire empêche l’affichage de ces données.
      </p>
      <Button type="button" onClick={() => unstable_retry()}>
        Réessayer
      </Button>
    </section>
  );
}
