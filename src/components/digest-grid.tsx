import { hexToBytes } from "@noble/hashes/utils.js";
import { digits } from "@/lib/pq/wots";
import { cn } from "@/lib/format";

/**
 * A launch's attestation digest as its 67 WOTS digits: 64 message digits
 * (green, brightness = how far that hash chain was walked) and 3 checksum
 * digits (amber). Every coin gets a unique fingerprint.
 */
export function DigestGrid({ digest, className, cellClass = "h-3" }: { digest?: Uint8Array | string | null; className?: string; cellClass?: string }) {
  let d: number[] | null = null;
  try {
    if (digest) d = digits(typeof digest === "string" ? hexToBytes(digest) : digest);
  } catch {
    d = null;
  }
  return (
    <div className={cn("grid gap-[3px]", className)} style={{ gridTemplateColumns: "repeat(34, minmax(0, 1fr))" }}>
      {Array.from({ length: 67 }, (_, i) => {
        const v = d?.[i];
        return (
          <div
            key={i}
            title={v == null ? undefined : `${i >= 64 ? "checksum" : "chain"} ${i}: ${v}/15`}
            className={cn(cellClass, "transition-[opacity,background-color] duration-300", v == null ? "bg-surface-3" : i >= 64 ? "bg-warn" : "bg-up")}
            style={{ opacity: v == null ? 0.5 : 0.14 + (v / 15) * 0.86 }}
          />
        );
      })}
    </div>
  );
}
