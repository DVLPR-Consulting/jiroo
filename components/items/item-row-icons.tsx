"use client";

import { createContext, useContext, useId, type ReactNode } from "react";
import { GripVertical } from "lucide-react";
import { TypeIcon } from "@/components/icons/type-icon";
import { StatusDot } from "@/components/icons/status-dot";
import { PrioIcon } from "@/components/icons/prio-icon";
import {
  ITEM_TYPE_LABELS, PRIORITY_LABELS, STATUS_LABELS,
  ITEM_TYPES, PRIORITIES, STATUS_IDS,
  type ItemType, type Priority, type StatusId,
} from "@/lib/design/constants";

const IconScope = createContext<string | null>(null);

/** Reuse the existing drawings once per view, including for subsequently loaded rows.
 * The provider adds no layout box. useId isolates multiple views in one document.
 */
export function ItemRowIconProvider({ children }: { children: ReactNode }) {
  const prefix = useId();
  return (
    <IconScope value={prefix}>
      <svg aria-hidden="true" width="0" height="0" className="absolute overflow-hidden">
        <defs>
          {ITEM_TYPES.map((type) => (
            <symbol key={type} id={`${prefix}-type-${type}`} viewBox="0 0 16 16">
              <TypeIcon type={type} size={16} />
            </symbol>
          ))}
          {STATUS_IDS.map((status) => (
            <symbol key={status} id={`${prefix}-status-${status}`} viewBox="0 0 14 14">
              <StatusDot status={status} />
            </symbol>
          ))}
          {PRIORITIES.map((priority) => (
            <symbol key={priority} id={`${prefix}-priority-${priority}`} viewBox="0 0 14 14">
              <PrioIcon priority={priority} />
            </symbol>
          ))}
          <symbol id={`${prefix}-grip`} viewBox="0 0 24 24">
            <GripVertical />
          </symbol>
        </defs>
      </svg>
      {children}
    </IconScope>
  );
}

function IconUse({ id, size, viewBox, label }: {
  id: string; size: number; viewBox: string; label: string;
}) {
  return (
    <svg width={size === 14 ? undefined : size} height={size === 14 ? undefined : size} viewBox={viewBox} fill="none"
      className="ir-icon" role="img" aria-label={label}>
      <use href={`#${id}`} aria-hidden="true" />
    </svg>
  );
}

export function RowTypeIcon({ type, size = 15 }: { type: ItemType; size?: number }) {
  const prefix = useContext(IconScope);
  return prefix ? <IconUse id={`${prefix}-type-${type}`} size={size} viewBox="0 0 16 16" label={ITEM_TYPE_LABELS[type]} /> : <TypeIcon type={type} size={size} />;
}

export function RowStatusDot({ status }: { status: StatusId }) {
  const prefix = useContext(IconScope);
  return prefix ? <IconUse id={`${prefix}-status-${status}`} size={14} viewBox="0 0 14 14" label={STATUS_LABELS[status]} /> : <StatusDot status={status} />;
}

export function RowPrioIcon({ priority }: { priority: Priority }) {
  const prefix = useContext(IconScope);
  return prefix ? <IconUse id={`${prefix}-priority-${priority}`} size={14} viewBox="0 0 14 14" label={PRIORITY_LABELS[priority]} /> : <PrioIcon priority={priority} />;
}

export function RowGripIcon() {
  const prefix = useContext(IconScope);
  return prefix ? (
    <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      className="lucide lucide-grip-vertical" aria-hidden="true">
      <use href={`#${prefix}-grip`} />
    </svg>
  ) : <GripVertical aria-hidden size={15} />;
}
