import Link from "next/link";

export function ReportPagination({
  ariaLabel,
  page,
  pageSize,
  total,
  href,
}: {
  ariaLabel: string;
  page: number;
  pageSize: number;
  total: number;
  href: (page: number) => string;
}) {
  const lastPage = Math.max(1, Math.ceil(total / pageSize));
  if (lastPage === 1) return null;
  return (
    <nav aria-label={ariaLabel} className="flex items-center gap-3 text-sm">
      {page > 1 ? (
        <Link href={href(page - 1)}>Précédent</Link>
      ) : (
        <span aria-disabled="true">Précédent</span>
      )}
      <span>Page {page} sur {lastPage}</span>
      {page < lastPage ? (
        <Link href={href(page + 1)}>Suivant</Link>
      ) : (
        <span aria-disabled="true">Suivant</span>
      )}
    </nav>
  );
}
