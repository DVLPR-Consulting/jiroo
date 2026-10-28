import { cn } from "@/lib/utils";

export function ItemKey({ value, className }: { value: string; className?: string }) {
  return <span className={cn("item-key", className)}>{value}</span>;
}
