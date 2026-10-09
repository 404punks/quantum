"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Search } from "lucide-react";
import { cn } from "@/lib/format";

/** A token pump.fun accepts as the quote side of a bonding curve (from /api/quotes). */
export type Pair = {
  mint: string;
  symbol: string;
  name: string;
  image: string | null;
  decimals: number;
  tokenProgram: string;
  category: "sol" | "stock" | "crypto" | "pump";
  priceUsd: number | null;
};

export const SOL_PAIR: Pair = {
  mint: "So11111111111111111111111111111111111111112",
  symbol: "SOL",
  name: "Solana",
  image: null,
  decimals: 9,
  tokenProgram: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
  category: "sol",
  priceUsd: null,
};

let listCache: Promise<Pair[]> | null = null;
function loadPairs() {
  listCache ??= fetch("/api/quotes")
    .then((r) => r.json())
    .then((j) => (j.quotes ?? []) as Pair[])
    .catch(() => {
      listCache = null;
      return [] as Pair[];
    });
  return listCache;
}

const FILTERS = [
  { id: "all", label: "All" },
  { id: "stock", label: "Stocks" },
  { id: "crypto", label: "Crypto" },
] as const;

const looksLikeMint = (q: string) => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(q);

type Check = { mint: string; state: "loading" } | { mint: string; state: "ok"; pair: Pair } | { mint: string; state: "error"; reason: string };
type Filter = (typeof FILTERS)[number]["id"];

const usdFmt = (n: number) =>
  n >= 1000 ? `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}` : n >= 1 ? `$${n.toFixed(2)}` : `$${n.toPrecision(3)}`;

export function PairIcon({ pair, size = 28 }: { pair: Pick<Pair, "symbol" | "image">; size?: number }) {
  const [broken, setBroken] = useState(false);
  if (pair.image && !broken) {
    return (
      <img
        src={pair.image}
        alt=""
        loading="lazy"
        onError={() => setBroken(true)}
        className="shrink-0 rounded-full border border-line bg-surface-2 object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full border border-line bg-surface-2 font-mono text-dim"
      style={{ width: size, height: size, fontSize: size * 0.38 }}
    >
      {pair.symbol.replace(/[^A-Za-z0-9]/g, "").slice(0, 2) || "?"}
    </span>
  );
}

/**
 * Scrollable list of every pair pump.fun accepts: SOL, USDC, tokenized
 * stocks, majors and memecoins. Searchable by ticker, name or mint.
 */
export function PairPicker({ value, onChange, disabled }: { value: Pair; onChange: (p: Pair) => void; disabled?: boolean }) {
  const [pairs, setPairs] = useState<Pair[] | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [check, setCheck] = useState<Check | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadPairs().then((p) => !cancelled && setPairs(p));
    return () => {
      cancelled = true;
    };
  }, []);

  // A pasted address that isn't in the list: ask the server whether pump.fun accepts it
  // (any pump.fun coin priced within range is allowed, not just the listed ones).
  const pasted = query.trim();
  const unlisted = looksLikeMint(pasted) && pairs !== null && !pairs.some((p) => p.mint === pasted);
  useEffect(() => {
    if (!unlisted) return setCheck(null);
    let cancelled = false;
    setCheck({ mint: pasted, state: "loading" });
    fetch(`/api/quotes/check?mint=${pasted}`)
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        setCheck(j.quote ? { mint: pasted, state: "ok", pair: j.quote } : { mint: pasted, state: "error", reason: j.error ?? "Not accepted as a pair" });
      })
      .catch(() => !cancelled && setCheck({ mint: pasted, state: "error", reason: "Couldn't check that token" }));
    return () => {
      cancelled = true;
    };
  }, [pasted, unlisted]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (pairs ?? []).filter(
      (p) =>
        (filter === "all" || p.category === filter || (filter === "crypto" && (p.category === "sol" || p.category === "pump"))) &&
        (!q || p.symbol.toLowerCase().includes(q) || p.name.toLowerCase().includes(q) || p.mint.toLowerCase() === q),
    );
  }, [pairs, filter, query]);

  const counts = useMemo(
    () => ({
      all: pairs?.length ?? 0,
      stock: pairs?.filter((p) => p.category === "stock").length ?? 0,
      crypto: pairs?.filter((p) => p.category !== "stock").length ?? 0,
    }),
    [pairs],
  );

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex border border-line bg-bg p-0.5 font-mono text-[11.5px]">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={cn("cursor-pointer px-2.5 py-1 transition-colors", filter === f.id ? "bg-fg text-bg" : "text-muted hover:text-fg")}
            >
              {f.label}
              {pairs && <span className={cn("ml-1.5", filter === f.id ? "text-bg/60" : "text-dim")}>{counts[f.id]}</span>}
            </button>
          ))}
        </div>
        <label className="flex h-[30px] min-w-0 flex-1 items-center gap-2 border border-line bg-bg px-2.5 focus-within:border-line-strong">
          <Search size={13} className="shrink-0 text-dim" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search, or paste any pump.fun coin address"
            className="min-w-0 flex-1 bg-transparent text-[12.5px] outline-none placeholder:text-dim"
          />
        </label>
      </div>

      <div className="mt-2 h-[264px] overflow-y-auto border border-line bg-bg">
        {pairs === null ? (
          <div className="space-y-px p-1">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="skeleton h-10 rounded-none" />
            ))}
          </div>
        ) : check ? (
          <div className="p-3">
            {check.state === "loading" ? (
              <div className="font-mono text-[12px] text-dim">checking whether pump.fun accepts this coin as a pair…</div>
            ) : check.state === "error" ? (
              <div className="font-mono text-[12px] leading-relaxed">
                <span className="text-down">[ NO ]</span> <span className="text-muted">{check.reason}</span>
              </div>
            ) : (
              <button
                type="button"
                disabled={disabled}
                onClick={() => onChange(check.pair)}
                className={cn(
                  "flex w-full cursor-pointer items-center gap-3 border px-3 py-2.5 text-left transition-colors",
                  value.mint === check.pair.mint ? "border-fg bg-surface-2" : "border-line hover:border-line-strong hover:bg-surface",
                )}
              >
                <PairIcon pair={check.pair} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[13px] text-fg">{check.pair.symbol}</span>
                    <span className="border border-line px-1 font-mono text-[9.5px] uppercase tracking-wider text-dim">pump.fun</span>
                  </div>
                  <div className="truncate text-[11.5px] text-dim">{check.pair.name} · accepted as a pair</div>
                </div>
                <span className="font-mono text-[11.5px] text-up">{value.mint === check.pair.mint ? "selected" : "use this coin"}</span>
              </button>
            )}
          </div>
        ) : shown.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center px-6 text-center text-[12.5px] text-dim">
            <div>No pair matches “{query}”.</div>
            <div className="mt-1 text-[11.5px]">Any established pump.fun coin works too: paste its address.</div>
          </div>
        ) : (
          <ul role="listbox" aria-label="Pair with">
            {shown.map((p) => {
              const on = p.mint === value.mint;
              return (
                <li key={p.mint}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={on}
                    disabled={disabled}
                    onClick={() => onChange(p)}
                    className={cn(
                      "flex w-full cursor-pointer items-center gap-3 border-b border-line/60 px-3 py-2 text-left transition-colors disabled:cursor-default",
                      on ? "bg-surface-2" : "hover:bg-surface",
                    )}
                  >
                    <PairIcon pair={p} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[13px] text-fg">{p.symbol}</span>
                        {p.category === "stock" && <span className="border border-line px-1 font-mono text-[9.5px] uppercase tracking-wider text-dim">stock</span>}
                        {p.category === "pump" && <span className="border border-up/40 px-1 font-mono text-[9.5px] uppercase tracking-wider text-up">featured</span>}
                      </div>
                      <div className="truncate text-[11.5px] text-dim">{p.name}</div>
                    </div>
                    {p.priceUsd != null && <span className="font-mono text-[12px] text-muted">{usdFmt(p.priceUsd)}</span>}
                    <span className={cn("flex h-4 w-4 shrink-0 items-center justify-center rounded-full border", on ? "border-fg bg-fg text-bg" : "border-line-strong")}>
                      {on && <Check size={10} strokeWidth={3} />}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

export type SwapEstimate = { out: number; minOut: number; priceImpactPct: number; route: string[] };

/** Live Jupiter estimate for a SOL dev buy on a token pair (debounced). */
export function useSwapEstimate(pair: Pair, sol: number) {
  const [estimate, setEstimate] = useState<SwapEstimate | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    setEstimate(null);
    setError(null);
    if (pair.category === "sol" || !(sol > 0)) return;
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(() => {
      fetch(`/api/quotes/estimate?mint=${pair.mint}&sol=${sol}`)
        .then((r) => r.json())
        .then((j) => {
          if (cancelled) return;
          if (j.error) setError(j.error);
          else setEstimate(j);
        })
        .catch(() => !cancelled && setError("Couldn't reach Jupiter"))
        .finally(() => !cancelled && setLoading(false));
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [pair, sol]);
  return { estimate, error, loading };
}
