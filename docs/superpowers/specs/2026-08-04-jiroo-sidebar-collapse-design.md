# Jiroo Sidebar Collapse Design

**Date:** 2026-08-04  
**Status:** Approved for implementation  
**Scope:** Authenticated application sidebar only

## Goal

Restore the familiar behavior of a SaaS left navigation: the sidebar switches
between a full navigation panel and a genuinely narrow icon rail. The control
must never render duplicate branding or duplicate toggle icons, and collapsing
must reduce the shell column rather than only hiding labels.

## Current Failure

The sidebar currently has two competing presentation authorities:

- React state hides labels and changes component classes.
- A root `data-sidebar` attribute and global CSS control the shell width and
  which of two pre-rendered logos and toggle icons is visible.

When the global selectors are not applied in step with React, the sidebar keeps
its 248 px column while its labels disappear. Both logo variants and both toggle
icons can also become visible. The redesign removes this split authority.

## Interaction Design

### Expanded state

- The shell sidebar column is exactly 248 px wide.
- The header renders one `Jiroo` wordmark, with the existing garnet accent on
  `oo`.
- The header renders one control labelled `Replier la barre latérale`.
- The active backlog selector shows its badge, name, and dropdown affordance.
- Primary navigation, personal and shared views, counts, trash,
  administration, and the user card retain their current behavior.

### Collapsed state

- The shell sidebar column is exactly 64 px wide.
- The header renders one `J` monogram and one control labelled
  `Déplier la barre latérale`.
- The active backlog selector shows only the backlog key badge.
- Primary navigation, trash, administration, and the user avatar remain as
  centered icon controls.
- Personal and shared view groups are not rendered in the rail.
- Counts and descriptive labels are visually hidden, while every remaining
  control retains an accessible name and a native title tooltip.

### Persistence

- The preference remains stored under `jiroo-sidebar-collapsed` as the string
  `true` or `false`.
- The existing pre-hydration script continues to set the root attribute. The
  provider reads it in its layout effect so the persisted preference is applied
  before the browser paints the hydrated shell.
- After hydration, the `SidebarStateProvider` is the single presentation
  authority for both the shell width and sidebar contents.

## Component Design

### `SidebarStateProvider`

The provider continues to expose `{ collapsed, toggle }`. It initializes from
the pre-hydration root attribute, persists each toggle, and keeps the root
attribute synchronized for compatibility. Consumers do not derive presentation
from that attribute after hydration.

### `AppShell`

`AppShellFrame` consumes `collapsed` directly and sets its grid columns to one
of two explicit values:

- expanded: `248px minmax(0,1fr)`;
- collapsed: `64px minmax(0,1fr)`.

The width transition remains short and affects the actual grid column.

### `Sidebar`

`Sidebar` renders mutually exclusive React branches for the brand and toggle
icon. It does not pre-render both variants and depend on CSS to hide one. The
same `collapsed` value controls child props, view-group rendering, padding, and
accessible labels.

### Global CSS

Global rules that independently set `--sidebar-width`, hide open/collapsed
variants, or restyle the sidebar from `data-sidebar` are removed. Theme and
density behavior remain unchanged.

## Accessibility

- The collapse control exposes the action it will perform, not the current
  state.
- Collapsed icon controls keep `aria-label` and `title` text.
- Hidden labels remain available to assistive technology only when required to
  name a control.
- Keyboard focus, link semantics, dropdown behavior, and active-route
  indication are preserved.
- There is only one interactive collapse control in the accessibility tree.

## Testing

Implementation follows TDD and adds regressions that fail if:

- toggling does not change the actual shell grid from 248 px to 64 px;
- the expanded header contains more than one wordmark or toggle icon;
- the collapsed header contains more than one monogram or toggle icon;
- collapsed labels or view groups remain visibly rendered;
- essential rail controls lose their accessible names;
- the preference is not persisted or restored.

Focused component tests are followed by type checking, linting, the full test
suite, and a production build. Visual acceptance covers expanded and collapsed
states at the same viewport, including a reload with the collapsed preference.

## Error Handling

If local storage is unavailable, toggling still updates the current React
session. Persistence failure is non-blocking. If no pre-hydration attribute is
present, the sidebar starts expanded.

## Out of Scope

- Mobile navigation or a drawer-based responsive redesign.
- Changing sidebar information architecture, routes, counts, saved views, or
  role visibility.
- Replacing the sidebar with a third-party navigation framework.
- Redesigning the Jiroo wordmark beyond the existing text treatment.
