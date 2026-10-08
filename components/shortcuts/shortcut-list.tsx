import {
  SHORTCUT_GROUPS,
  shortcutKeyParts,
  shortcutsInGroup,
  shortcutText,
  type ShortcutDefinition,
} from "@/lib/shortcuts/registry";

const KBD_CLASS =
  "font-mono text-[12px] rounded-[var(--radius-sm)] border border-[var(--border-strong)] bg-[var(--surface)] px-1.5 py-0.5";

/** The keys of one shortcut as `<kbd>` elements (« G puis B », « ⌘/Ctrl + K »). */
export function ShortcutKeys({ shortcut }: { shortcut: ShortcutDefinition }) {
  const { keys, joiner, alternative } = shortcutKeyParts(shortcut);
  return (
    // `relative` keeps the absolutely positioned sr-only text inside the
    // scrolling guide; otherwise it stretches the document and the page scrolls.
    <span className="relative inline-flex flex-wrap items-center gap-1">
      <span className="sr-only">{shortcutText(shortcut)}</span>
      {keys.map((key, index) => (
        <span key={index} className="inline-flex items-center gap-1" aria-hidden="true">
          {index > 0 ? <span className="text-xs text-muted-foreground">{joiner}</span> : null}
          <kbd className={KBD_CLASS}>{key}</kbd>
        </span>
      ))}
      {alternative ? (
        <span className="inline-flex items-center gap-1" aria-hidden="true">
          <span className="text-xs text-muted-foreground">ou</span>
          <kbd className={KBD_CLASS}>{alternative}</kbd>
        </span>
      ) : null}
    </span>
  );
}

/**
 * Every registry shortcut, grouped. Shared by the « Raccourcis clavier »
 * dialog and the /aide guide so both always list the same keys.
 */
export function ShortcutList({
  headingLevel = 3,
  idPrefix,
}: {
  headingLevel?: 3 | 4;
  idPrefix: string;
}) {
  const Heading = headingLevel === 3 ? "h3" : "h4";
  return (
    <div className="grid gap-5">
      {SHORTCUT_GROUPS.map((group) => {
        const headingId = `${idPrefix}-${group.id}`;
        return (
          <section key={group.id} aria-labelledby={headingId} className="grid gap-2">
            <Heading id={headingId} className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {group.title}
            </Heading>
            <dl className="grid gap-1.5">
              {shortcutsInGroup(group.id).map((shortcut) => (
                <div
                  key={shortcut.id}
                  className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1"
                >
                  <dt className="t-sm">{shortcut.label}</dt>
                  <dd>
                    <ShortcutKeys shortcut={shortcut} />
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        );
      })}
    </div>
  );
}
