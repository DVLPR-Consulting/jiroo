import { Bug } from "lucide-react";
import type { ItemKind } from "@/lib/design/constants";

/**
 * KindIcon — renders a Bug marker for bug items; returns null for features
 * (features are the default kind and carry no visual marker).
 */
export function KindIcon({ kind }: { kind: ItemKind }) {
  if (kind !== "bug") return null;
  return (
    <Bug
      size={14}
      aria-label="Bug"
      style={{ color: "var(--danger)", flexShrink: 0 }}
    />
  );
}
