"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/format";

type PairUse = { mint: string; symbol: string; image: string | null; count: number };
type Summary = { sol: number; token: number; pairs: PairUse[] };

/** "all", "sol", "token" (any non-SOL pair) or a specific pair mint. */
export type PairFilterValue = string;

function Icon({ image, label, size = 16 }: { image?: string | null; label: string; size?: number }) {
  const [broken, setBroken] = useState(false);
  if (image && !broken) {
    return <img src={image} alt="" onError={() => setBroken(true)} className="shrink-0 rounded-full border border-line object-cover" style={{ width: size, height: size }} />;
  }
  return (
    <span className="flex shrink-0 items-center justify-center rounded-full border border-line bg-surface-2 font-mono text-dim" style={{ width: size, height: size, fontSize: size * 0.45 }}>
      {label.replace(/[^A-Za-z0-9]/g, "").slice(0, 1) || "?"}
    </span>
  );
}

/**
 * Filter the grid by what coins are paired with: everything, SOL only, any
 * token pair, or one pair asset (only pairs live coins actually use are listed).
 */
export function PairFilter({ value, onChange }: { value: PairFilterValue; onChange: (v: PairFilterValue) => void }) {
  const [open, setOpen] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/launches/pairs")
      .then((r) => r.json())
      .then((j) => !j.error && setSummary(j))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const selectedPair = summary?.pairs.find((p) => p.mint === value);
  const label = value === "all" ? "All pairs" : value === "sol" ? "SOL" : value === "token" ? "Token pairs" : (selectedPair?.symbol ?? "Pair");
  const pick = (v: PairFilterValue) => {
    onChange(v);
    setOpen(false);
  };

  const Row = ({ v, children, count }: { v: PairFilterValue; children: React.ReactNode; count?: number }) => (
    <button
      type="button"
      role="option"
      aria-selected={value === v}
      onClick={() => pick(v)}
      className={cn(
        "flex w-full cursor-pointer items-center gap-2.5 rounded-[4px] px-2.5 py-1.5 text-left text-[12.5px] transition-colors",
        value === v ? "bg-surface-2 text-fg" : "text-muted hover:bg-surface-2 hover:text-fg",
      )}
    >
      {children}
      {count != null && <span className="ml-auto font-mono text-[11px] text-dim">{count}</span>}
      <Check size={12} className={cn("shrink-0", value === v ? "text-fg" : "invisible")} />
    </button>
  );

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          "flex h-[38px] cursor-pointer items-center gap-2 rounded-md border bg-surface px-3 text-[12.5px] font-medium transition-colors hover:border-line-strong",
          value === "all" ? "border-line text-muted hover:text-fg" : "border-line-strong text-fg",
        )}
      >
        <span className="text-dim">Pair</span>
        {selectedPair && <Icon image={selectedPair.image} label={selectedPair.symbol} />}
        <span>{label}</span>
        <ChevronDown size={13} className={cn("text-dim transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div role="listbox" className="absolute right-0 top-full z-30 mt-1.5 w-64 rounded-md border border-line-strong bg-surface p-1 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.8)]">
          <Row v="all" count={summary ? summary.sol + summary.token : undefined}>
            All pairs
          </Row>
          <Row v="sol" count={summary?.sol}>
            <Icon label="SOL" image="https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png" />
            SOL
          </Row>
          <Row v="token" count={summary?.token}>
            <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-dashed border-line-strong" />
            Any token pair
          </Row>
          {summary && summary.pairs.length > 0 && (
            <>
              <div className="mx-2.5 mb-1 mt-2 border-t border-line pt-2 font-mono text-[10.5px] uppercase tracking-wider text-dim">Paired with</div>
              <div className="max-h-56 overflow-y-auto">
                {summary.pairs.map((p) => (
                  <Row key={p.mint} v={p.mint} count={p.count}>
                    <Icon image={p.image} label={p.symbol} />
                    <span className="truncate">{p.symbol}</span>
                  </Row>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
