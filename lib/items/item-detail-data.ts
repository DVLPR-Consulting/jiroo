import type { ComponentProps } from "react";
import type { ItemDetailPanel } from "@/components/items/item-detail-panel";

export type ItemDetailPanelProps = ComponentProps<typeof ItemDetailPanel>;

/**
 * What the item drawer renders: the detail panel's props, or why there is
 * none. Loaded by `loadItemDetailData` (lib/services/item-detail).
 */
export type ItemDetailData =
  | { kind: "item"; panel: ItemDetailPanelProps }
  | { kind: "not-found"; itemKey: string };
