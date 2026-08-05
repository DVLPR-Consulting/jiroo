export type SelectionState = {
  selectedIds: ReadonlySet<string>;
  anchorId: string | null;
};

export function emptySelection(): SelectionState {
  return { selectedIds: new Set<string>(), anchorId: null };
}

export function toggleItemSelection(
  state: SelectionState,
  visibleIds: string[],
  id: string,
  extendRange: boolean,
): SelectionState {
  const next = new Set(state.selectedIds);
  const anchorIndex = state.anchorId
    ? visibleIds.indexOf(state.anchorId)
    : -1;
  const itemIndex = visibleIds.indexOf(id);

  if (extendRange && anchorIndex >= 0 && itemIndex >= 0) {
    const start = Math.min(anchorIndex, itemIndex);
    const end = Math.max(anchorIndex, itemIndex);
    return {
      selectedIds: new Set(visibleIds.slice(start, end + 1)),
      anchorId: state.anchorId,
    };
  }

  if (next.has(id)) next.delete(id);
  else next.add(id);

  return {
    selectedIds: next,
    anchorId: next.size === 0 ? null : id,
  };
}

export function selectAllVisible(visibleIds: string[]): SelectionState {
  return {
    selectedIds: new Set(visibleIds),
    anchorId: visibleIds[0] ?? null,
  };
}

export function reconcileSelection(
  state: SelectionState,
  visibleIds: string[],
): SelectionState {
  const visible = new Set(visibleIds);
  const selectedIds = new Set(
    [...state.selectedIds].filter((id) => visible.has(id)),
  );
  return {
    selectedIds,
    anchorId:
      state.anchorId && visible.has(state.anchorId) ? state.anchorId : null,
  };
}
