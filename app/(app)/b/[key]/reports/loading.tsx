import { Skeleton } from "@/components/ui/skeleton";

export default function ReportsLoading() {
  return (
    <div
      aria-label="Chargement des rapports…"
      aria-live="polite"
      role="status"
      className="mx-auto max-w-7xl space-y-6 p-6 lg:p-8"
    >
      <Skeleton className="h-10 w-72" />
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-24 w-full" />
        ))}
      </div>
      <Skeleton className="h-64 w-full" />
    </div>
  );
}
