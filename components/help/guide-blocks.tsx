import type { ReactNode } from "react";
import { GUIDE_SECTIONS, type GuideSectionId } from "@/components/help/guide-sections";

/** One guide section; heading and number come from the table of contents. */
export function GuideSection({ id, children }: { id: GuideSectionId; children: ReactNode }) {
  const index = GUIDE_SECTIONS.findIndex((section) => section.id === id);
  const title = GUIDE_SECTIONS[index]!.title;
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className="scroll-mt-6 border-t border-border pt-8 first:border-t-0 first:pt-0"
    >
      <h2 id={`${id}-title`} className="t-h2 mb-4 flex items-baseline gap-2">
        <span className="font-mono text-muted-foreground">{index + 1}.</span>
        {title}
      </h2>
      <div className="space-y-6">{children}</div>
    </section>
  );
}

/** A task inside a section: « À quoi ça sert » then « Comment faire ». */
export function GuideTopic({
  title,
  purpose,
  steps,
  children,
}: {
  title: string;
  purpose: ReactNode;
  steps?: ReactNode[];
  children?: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <h3 className="t-h3">{title}</h3>
      <p className="t-body">
        <span className="font-medium">À quoi ça sert — </span>
        {purpose}
      </p>
      {steps && steps.length > 0 ? (
        <div className="t-body">
          <p className="font-medium">Comment faire</p>
          <ol className="mt-1 list-decimal space-y-1 pl-5 marker:text-muted-foreground">
            {steps.map((step, index) => (
              <li key={index}>{step}</li>
            ))}
          </ol>
        </div>
      ) : null}
      {children}
    </div>
  );
}

/** Short rule or limit worth remembering. */
export function GuideNote({ children }: { children: ReactNode }) {
  return (
    <p
      role="note"
      className="t-sm rounded-[var(--radius-md)] border border-border bg-[var(--surface-2)] px-3 py-2 text-foreground"
    >
      {children}
    </p>
  );
}

/** Exact UI label, rendered like a button caption. */
export function Ui({ children }: { children: ReactNode }) {
  return <strong className="font-semibold">« {children} »</strong>;
}

/** Keyboard key. */
export function Key({ children }: { children: ReactNode }) {
  return (
    <kbd className="font-mono text-[12px] rounded-[var(--radius-sm)] border border-[var(--border-strong)] bg-[var(--surface)] px-1.5 py-0.5">
      {children}
    </kbd>
  );
}
