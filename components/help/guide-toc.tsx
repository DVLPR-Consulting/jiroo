import { GUIDE_SECTIONS } from "@/components/help/guide-sections";

function TocLinks() {
  return (
    <ol className="t-sm space-y-0.5">
      {GUIDE_SECTIONS.map((section, index) => (
        <li key={section.id}>
          <a
            href={`#${section.id}`}
            className="flex gap-2 rounded-[var(--radius-sm)] px-2 py-1 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:outline-none"
          >
            <span className="font-mono">{index + 1}.</span>
            <span>{section.title}</span>
          </a>
        </li>
      ))}
    </ol>
  );
}

/**
 * Table of contents: sticky column on large screens, collapsible block on
 * small screens, hidden when printing.
 */
export function GuideToc() {
  return (
    <nav aria-label="Sommaire du guide" className="print:hidden">
      <details className="rounded-[var(--radius-md)] border border-border bg-[var(--surface)] lg:hidden">
        <summary className="t-label cursor-pointer px-3 py-2">Sommaire</summary>
        <div className="border-t border-border p-1">
          <TocLinks />
        </div>
      </details>
      <div className="sticky top-6 hidden lg:block">
        <p className="t-meta mb-2 px-2">Sommaire</p>
        <TocLinks />
      </div>
    </nav>
  );
}
