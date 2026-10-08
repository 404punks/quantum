"use client";

import { cn } from "@/lib/format";
import type { LeafUse } from "./identity";

/** 256 one-time keys as a 16×16 grid: burned, next, free, or still being generated. */
export function KeyGrid({
  total = 256,
  built = total,
  leaves = [],
  next,
  highlight,
  className,
}: {
  total?: number;
  built?: number;
  leaves?: LeafUse[];
  next?: number;
  highlight?: number;
  className?: string;
}) {
  const used = new Map(leaves.map((l) => [l.leaf_index, l]));
  return (
    <div className={cn("grid grid-cols-16 gap-[3px]", className)} style={{ gridTemplateColumns: "repeat(16, minmax(0, 1fr))" }}>
      {Array.from({ length: total }, (_, i) => {
        const use = used.get(i);
        const isBuilt = i < built;
        return (
          <div
            key={i}
            title={use ? `Leaf ${i}: ${use.purpose}` : i === next ? `Leaf ${i}: next to sign` : `Leaf ${i}: unused`}
            className={cn(
              "aspect-square rounded-[1.5px] transition-colors",
              !isBuilt && "bg-surface-2",
              isBuilt && !use && i !== next && i !== highlight && "leaf-in bg-surface-3",
              use?.purpose === "genesis" && "bg-fg",
              use?.purpose === "launch" && "bg-up",
              use?.purpose === "proof" && "bg-up/45",
              !use && i === next && "animate-pulse border border-fg bg-transparent",
              i === highlight && "bg-warn",
            )}
          />
        );
      })}
    </div>
  );
}

export function KeyLegend() {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted">
      <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-[1px] bg-fg" /> genesis</span>
      <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-[1px] bg-up" /> launch</span>
      <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-[1px] bg-up/45" /> proof</span>
      <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-[1px] border border-fg" /> next</span>
      <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-[1px] bg-surface-3" /> unused</span>
    </div>
  );
}
