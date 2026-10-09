"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Anchor, ArrowUpRight, Check, Copy, Fingerprint, Globe, Loader2, Lock, MessageCircle, Send, ShieldCheck, X } from "lucide-react";
import { SCHEMES, isSchemeId } from "@/lib/pq/scheme-info";
import { verifyLaunch, type LaunchVerification } from "@/lib/pq/verify-launch";
import type { CurveState } from "@/lib/types";
import { ago, cn, coinPath, num, pct, price, short, usd, keepKnown, thumb } from "@/lib/format";
import { LaunchVerificationView } from "./verify-trace";
import { Button, CopyText, Panel, Pill, Skeleton } from "./ui";

type Candle = { t: number; o: number; h: number; l: number; c: number; v: number };

type Payload = {
  launch: {
    mint: string;
    name: string;
    symbol: string;
    description: string | null;
    image_url: string;
    metadata_uri: string | null;
    twitter: string | null;
    telegram: string | null;
    website: string | null;
    creator: string;
    leaf_index: number | null;
    scheme: string;
    attestation: unknown;
    dev_buy_sol: number;
    dev_vault: string | null;
    quote_mint: string | null;
    quote_symbol: string | null;
    quote_image: string | null;
    launched_at: string | null;
    tx_signature: string | null;
  };
  identity: {
    wallet: string;
    pq_address: string;
    root: string;
    pub_seed: string;
    height: number;
    passphrase_hardened: boolean;
    anchor_tx: string | null;
    anchored_at: string | null;
  };
  overview: {
    price: number | null;
    marketCap: number | null;
    liquidity: number | null;
    holder: number | null;
    v24hUSD: number | null;
    priceChange24hPercent: number | null;
    trade24h: number | null;
    buys24h: number | null;
    sells24h: number | null;
  } | null;
  candles: Candle[];
  vault?: { address: string; tokens: number; pctSupply: number; spent: boolean } | null;
  candlesOk?: boolean;
  curve: CurveState | null;
  solPrice: number | null;
};

export function CoinView({ mint, quantumRoute = false }: { mint: string; quantumRoute?: boolean }) {
  const router = useRouter();
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<Range>("1H");
  // Until someone picks a range, step out to the first window that has trades.
  const [autoRange, setAutoRange] = useState(true);
  const [loadedRange, setLoadedRange] = useState<Range | null>(null);
  const [verification, setVerification] = useState<LaunchVerification | null>(null);

  useEffect(() => {
    let cancelled = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const load = (): Promise<unknown> =>
      fetch(`/api/token/${mint}?range=${range}`)
        .then((r) => r.json())
        .then((j) => {
          if (cancelled) return;
          if (j.error) return setError(j.error);
          if (j.candlesOk === false) {
            // Chart source busy: keep the candles already on screen and retry on the next tick.
            setData((prev) => (prev && prev.launch.mint === mint && prev.candles.length ? { ...j, candles: prev.candles } : j));
            retry = setTimeout(load, 5_000);
            return;
          }
          // Keep the last known stats when a refresh comes back short (rate-limited lookups).
          setData((prev) => (prev && prev.launch.mint === mint ? { ...j, overview: j.overview ? keepKnown(prev.overview, j.overview) : prev.overview } : j));
          setLoadedRange(range);
          const next = RANGES[RANGES.indexOf(range) + 1];
          if (autoRange && next && (j.candles?.length ?? 0) < 2) setRange(next);
        })
        .catch(() => !cancelled && setError("Failed to load"));
    void load();
    const id = setInterval(load, 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
      clearTimeout(retry);
    };
  }, [mint, range, autoRange]);

  // Quantum coins live at /coin/q/<mint>, the rest at /coin/<mint>; old links land on the right one.
  const isQuantum = data ? Boolean(data.launch.dev_vault) : null;
  useEffect(() => {
    if (isQuantum !== null && isQuantum !== quantumRoute) router.replace(coinPath(mint, isQuantum));
  }, [isQuantum, quantumRoute, mint, router]);

  const verifiedMint = data?.launch.mint;
  useEffect(() => {
    if (verifiedMint) runVerify();
  }, [verifiedMint]);

  function runVerify() {
    if (!data) return;
    void verifyLaunch(data.launch, data.identity).then(setVerification);
  }

  if (error) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-24 text-center">
        <h1 className="font-serif text-[22px] font-bold">Coin not found</h1>
        <p className="mt-2 text-[13px] text-muted">{error}</p>
        <Link href="/" className="mt-6 inline-block cursor-pointer text-[13px] text-fg underline-offset-2 hover:underline">← Back to coins</Link>
      </div>
    );
  }

  if (!data) return <CoinSkeleton />;

  const { launch, identity, overview, curve, candles } = data;
  const schemeInfo = SCHEMES[isSchemeId(launch.scheme) ? launch.scheme : "wots"];
  const schemeTag = schemeInfo.id === "wots" ? `PQ-attested · leaf ${launch.leaf_index}` : `PQ-attested · ${schemeInfo.name}`;
  const change = overview?.priceChange24hPercent ?? null;
  const up = (change ?? 0) >= 0;
  const marketCap = overview?.marketCap ?? (curve?.marketCapSol != null && data.solPrice ? curve.marketCapSol * data.solPrice : null);

  const quantum = Boolean(launch.dev_vault);
  const vault = data.vault ?? null;
  const verifying = !verification;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <Link href="/" className="cursor-pointer text-[12.5px] text-muted hover:text-fg">← All coins</Link>

      {/* Hero */}
      <section
        className={cn("relative mt-4 rounded-2xl border bg-surface p-5 sm:p-6", quantum ? "border-line-strong" : "border-line")}
        style={quantum ? { backgroundImage: "radial-gradient(rgba(255,255,255,0.045) 1px, transparent 1px)", backgroundSize: "12px 12px" } : undefined}
      >
        {quantum && <QuantumCorners />}
        <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <img src={thumb(launch.image_url, 160)} alt="" className="h-20 w-20 shrink-0 rounded-2xl border border-line object-cover" />
            <div className="min-w-0">
              <h1 className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1 text-[26px] font-semibold leading-tight">
                <span className="truncate">{launch.name}</span>
                <span className="font-mono text-[15px] font-normal text-muted">${launch.symbol}</span>
                {launch.quote_symbol && (
                  <span className="flex items-center gap-1 font-mono text-[15px] font-normal text-dim" title={`Trades against ${launch.quote_symbol} on pump.fun`}>
                    /
                    {launch.quote_image && <img src={launch.quote_image} alt="" className="h-4 w-4 rounded-full" />}
                    <span className="text-muted">{launch.quote_symbol}</span>
                  </span>
                )}
              </h1>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {quantum && (
                  <span className="inline-flex items-center gap-1.5 bg-fg px-2 py-0.5 font-mono text-[10.5px] font-semibold tracking-[0.12em] text-bg">
                    <Lock size={10} /> QUANTUM
                  </span>
                )}
                <Pill tone="up">{schemeTag}</Pill>
                {identity.passphrase_hardened && <Pill>hardened</Pill>}
                {identity.anchor_tx && <Pill>anchored root</Pill>}
                {curve?.complete && <Pill>graduated</Pill>}
              </div>
            </div>
          </div>

          <div className="flex flex-col items-start gap-3 md:items-end">
            <div className="flex items-baseline gap-2.5">
              <span className="font-mono text-[28px] leading-none text-fg">{overview?.price != null ? price(overview.price) : marketCap != null ? usd(marketCap) : "New"}</span>
              {change != null && (
                <span className={cn("rounded-md px-2 py-0.5 font-mono text-[12px]", up ? "bg-up/10 text-up" : "bg-down/10 text-down")}>
                  {pct(change)} 24h
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <a
                href={`https://pump.fun/coin/${launch.mint}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-fg px-4 py-2 text-[13px] font-medium text-bg hover:bg-white"
              >
                Trade on pump.fun <ArrowUpRight size={13} />
              </a>
              <CopyCa mint={launch.mint} />
            </div>
          </div>
        </div>

        <dl className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-5">
          <StripCell k="Market cap" v={marketCap != null ? usd(marketCap) : "—"} />
          <StripCell k="24h volume" v={overview?.v24hUSD ? usd(overview.v24hUSD) : "—"} />
          <StripCell k="Holders" v={overview?.holder != null ? num(overview.holder) : "—"} />
          <StripCell k="Liquidity" v={overview?.liquidity ? usd(overview.liquidity) : "—"} />
          <div className="col-span-2 bg-bg px-4 py-3 sm:col-span-1">
            <dt className="text-[11px] text-dim">{curve?.complete ? "Graduated" : "Bonding curve"}</dt>
            <dd className="mt-1 flex items-center gap-2.5">
              <span className="font-mono text-[15px] text-fg">{curve ? `${(curve.progress * 100).toFixed(1)}%` : "—"}</span>
              <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-3">
                <span className={cn("block h-full rounded-full", curve?.complete ? "bg-up" : "bg-fg")} style={{ width: `${Math.max((curve?.progress ?? 0) * 100, 1)}%` }} />
              </span>
            </dd>
          </div>
        </dl>
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_330px]">
        <div className="min-w-0 space-y-6">
          <Panel className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-[11px] uppercase tracking-wider text-dim">Price</span>
              <div role="tablist" aria-label="Chart range" className="flex border border-line bg-bg p-0.5 font-mono text-[11.5px]">
                {RANGES.map((r) => (
                  <button
                    key={r}
                    role="tab"
                    aria-selected={range === r}
                    onClick={() => {
                      setAutoRange(false);
                      setRange(r);
                    }}
                    className={cn("cursor-pointer px-2.5 py-1 transition-colors", range === r ? "bg-fg text-bg" : "text-muted hover:text-fg")}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-5 h-[320px]">
              {loadedRange !== range ? (
                <Skeleton className="h-full w-full" />
              ) : (
                <PriceChart candles={candles} range={range} lastPrice={overview?.price ?? null} pairSymbol={launch.quote_symbol} />
              )}
            </div>
          </Panel>

          {verification && <LaunchVerificationView v={verification} title="Attestation verified in your browser" />}
        </div>

        <aside className="space-y-4">
          {quantum && (
            <Panel className="relative overflow-hidden border-line-strong p-5">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-dim">
                  <Lock size={11} className="text-fg" /> Quantum vault
                </span>
                <span className={cn("font-mono text-[11px]", vault?.spent ? "text-warn" : "text-up")}>{vault ? (vault.spent ? "withdrawn" : "locked") : ""}</span>
              </div>
              {vault ? (
                <>
                  <div className="mt-3 font-mono text-[26px] leading-none text-fg">
                    {vault.tokens.toLocaleString("en-US", { notation: "compact", maximumFractionDigits: 2 })}
                    <span className="ml-1.5 text-[13px] text-muted">${launch.symbol}</span>
                  </div>
                  <div className="mt-1.5 text-[12px] text-dim">{vault.pctSupply.toFixed(2)}% of supply held by the dev's vault</div>
                  <p className="mt-4 text-[12px] leading-relaxed text-muted">
                    {vault.spent
                      ? "The dev has withdrawn from this vault; what was left moved to their next vault."
                      : "The dev buy went straight into a vault that only moves with a hash-based signature, checked on-chain."}
                  </p>
                </>
              ) : (
                <div className="mt-3 space-y-2">
                  <Skeleton className="h-7 w-32" />
                  <Skeleton className="h-3 w-48" />
                </div>
              )}
              <div className="mt-4 flex items-center justify-between border-t border-line pt-3 font-mono text-[11px]">
                <CopyText value={launch.dev_vault!} display={short(launch.dev_vault!, 6, 6)} className="text-dim" />
                <a href={`https://solscan.io/account/${launch.dev_vault}`} target="_blank" rel="noreferrer" className="flex cursor-pointer items-center gap-1 text-muted hover:text-fg">
                  Solscan <ArrowUpRight size={11} />
                </a>
              </div>
            </Panel>
          )}

          <Panel className="p-5">
            <div className="text-[11px] uppercase tracking-wider text-dim">Provenance</div>
            <div className="mt-3 flex items-center gap-3">
              <span
                className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border",
                  verifying ? "border-line text-dim" : verification?.valid ? "border-up/40 bg-up/10 text-up" : "border-down/40 bg-down/10 text-down",
                )}
              >
                {verifying ? <Loader2 size={15} className="animate-spin" /> : verification?.valid ? <ShieldCheck size={16} /> : <X size={16} />}
              </span>
              <div className="min-w-0">
                <div className="text-[14px] font-medium text-fg">{verifying ? "Verifying…" : verification?.valid ? "Verified" : "Doesn't verify"}</div>
                <div className="truncate text-[11.5px] text-dim">
                  {schemeInfo.id === "wots" ? `signed with WOTS leaf #${launch.leaf_index}` : `signed with ${schemeInfo.name}`} · checked in your browser
                </div>
              </div>
            </div>
            <dl className="mt-4 space-y-2 border-t border-line pt-3 font-mono text-[11px]">
              <KV k="signer" v={<CopyText value={identity.pq_address} display={short(identity.pq_address, 8, 6)} />} />
              <KV k="creator" v={<CopyText value={launch.creator} display={short(launch.creator, 6, 6)} />} />
              <KV k="scheme" v={`${schemeInfo.name} · ${schemeInfo.sigBytes.toLocaleString()} B`} />
              <KV k="dev buy" v={`${launch.dev_buy_sol} SOL`} />
              <KV k="launched" v={ago(launch.launched_at)} />
            </dl>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Button size="sm" onClick={runVerify}>Verify again</Button>
              {launch.metadata_uri ? (
                <a href={launch.metadata_uri} target="_blank" rel="noreferrer" className="inline-flex cursor-pointer items-center justify-center gap-1 rounded-xl border border-line px-2.5 py-1.5 text-[12px] hover:border-line-strong hover:bg-surface-2">
                  Metadata <ArrowUpRight size={11} />
                </a>
              ) : <span />}
            </div>
          </Panel>

          <Panel className="p-5">
            <div className="text-[11px] uppercase tracking-wider text-dim">24h activity</div>
            <div className="mt-3">
              <MarketStats stats={[]} buys={overview?.buys24h ?? null} sells={overview?.sells24h ?? null} />
            </div>
          </Panel>

          <Panel className="p-5">
            <div className="text-[11px] uppercase tracking-wider text-dim">About</div>
            <p className={cn("mt-2 whitespace-pre-wrap text-[13px] leading-relaxed", launch.description ? "text-muted" : "italic text-dim")}>
              {launch.description || "No description provided."}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {launch.twitter && <Social href={launch.twitter} label="X" />}
              {launch.website && <Social href={launch.website} label="Website" />}
              <Social href={`https://solscan.io/token/${launch.mint}`} label="Solscan" />
            </div>
          </Panel>
        </aside>
      </div>
    </div>
  );
}

function StripCell({ k, v }: { k: string; v: string }) {
  return (
    <div className="bg-bg px-4 py-3">
      <dt className="text-[11px] text-dim">{k}</dt>
      <dd className="mt-1 truncate font-mono text-[15px] text-fg">{v}</dd>
    </div>
  );
}

function CopyCa({ mint }: { mint: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard?.writeText(mint);
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      }}
      className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-line px-3.5 py-2 font-mono text-[12.5px] text-muted transition-colors hover:border-line-strong hover:text-fg"
      title={mint}
    >
      {copied ? <Check size={13} className="text-up" /> : <Copy size={13} />}
      {copied ? "Copied" : `CA ${short(mint, 4, 4)}`}
    </button>
  );
}

/** Viewfinder corners for quantum coins, matching their grid cards. */
function QuantumCorners() {
  const c = "pointer-events-none absolute h-4 w-4 border-fg";
  return (
    <>
      <span aria-hidden className={cn(c, "-left-px -top-px rounded-tl-2xl border-l-2 border-t-2")} />
      <span aria-hidden className={cn(c, "-right-px -top-px rounded-tr-2xl border-r-2 border-t-2")} />
      <span aria-hidden className={cn(c, "-bottom-px -left-px rounded-bl-2xl border-b-2 border-l-2")} />
      <span aria-hidden className={cn(c, "-bottom-px -right-px rounded-br-2xl border-b-2 border-r-2")} />
    </>
  );
}

const RANGES = ["1H", "1D", "1W", "1M"] as const;
type Range = (typeof RANGES)[number];
const RANGE_SECONDS: Record<Range, number> = { "1H": 3600, "1D": 86_400, "1W": 7 * 86_400, "1M": 30 * 86_400 };

function axisTime(t: number, range: Range) {
  const d = new Date(t * 1000);
  return range === "1H" || range === "1D"
    ? d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function tipTime(t: number) {
  const d = new Date(t * 1000);
  return `${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })} · ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
}

/**
 * Close-price line on a real time axis. GeckoTerminal only returns intervals
 * that traded, so the line is carried flat to "now" after the last trade.
 */
function PriceChart({ candles, range, lastPrice, pairSymbol }: { candles: Candle[]; range: Range; lastPrice: number | null; pairSymbol?: string | null }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 1000;
  const H = 300;
  const VOL_H = 46;
  const PAD_T = 16;
  const PAD_B = 22;

  const geo = useMemo(() => {
    if (!candles.length) return null;
    const now = Math.floor(Date.now() / 1000);
    const t0 = Math.min(candles[0].t, now - RANGE_SECONDS[range]);
    const span = Math.max(now - t0, 1);
    const lows = candles.map((c) => c.l);
    const highs = candles.map((c) => c.h);
    let min = Math.min(...lows);
    let max = Math.max(...highs);
    if (max === min) {
      min *= 0.98;
      max *= 1.02;
    }
    const x = (t: number) => ((t - t0) / span) * W;
    const y = (v: number) => PAD_T + (1 - (v - min) / (max - min)) * (H - PAD_T - PAD_B - VOL_H * 0.4);
    const pts = candles.map((c) => [x(c.t), y(c.c)] as const);
    const last = candles[candles.length - 1];
    const line = [`M0,${y(candles[0].o).toFixed(1)}`, ...pts.map(([px, py]) => `L${px.toFixed(1)},${py.toFixed(1)}`), `L${W},${y(last.c).toFixed(1)}`].join(" ");
    const vmax = Math.max(...candles.map((c) => c.v)) || 1;
    const barW = Math.max(2, Math.min(14, (W / Math.max(candles.length, 30)) * 0.6));
    return { x, y, line, vmax, barW, min, max, t0, now, up: last.c >= candles[0].o, last };
  }, [candles, range]);

  if (!geo) {
    return (
      <div className="relative flex h-full flex-col items-center justify-center overflow-hidden border border-line bg-bg">
        <div className="absolute inset-x-0 top-1/2 border-t border-dashed border-line-strong" />
        <div className="relative bg-bg px-3 text-center font-mono text-[12px] text-muted">
          {pairSymbol
            ? "chart data not available"
            : `no trades in the last ${range === "1H" ? "hour" : range === "1D" ? "day" : range === "1W" ? "week" : "month"}`}
          {lastPrice != null && <div className="mt-1 text-[11px] text-dim">last price {price(lastPrice)}</div>}
        </div>
      </div>
    );
  }

  const color = geo.up ? "var(--up)" : "var(--down)";
  const h = hover != null ? candles[hover] : null;
  const hx = h ? geo.x(h.t) : 0;
  const hy = h ? geo.y(h.c) : 0;

  return (
    <div
      className="relative h-full w-full select-none"
      onMouseMove={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const t = geo.t0 + ((e.clientX - rect.left) / rect.width) * (geo.now - geo.t0);
        let best = 0;
        for (let i = 1; i < candles.length; i++) if (Math.abs(candles[i].t - t) < Math.abs(candles[best].t - t)) best = i;
        setHover(best);
      }}
      onMouseLeave={() => setHover(null)}
    >
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-full w-full overflow-visible">
        <defs>
          <linearGradient id="chart-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.22" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.2, 0.45, 0.7].map((f) => (
          <line key={f} x1="0" x2={W} y1={H * f} y2={H * f} stroke="var(--line)" strokeDasharray="2 6" vectorEffect="non-scaling-stroke" />
        ))}
        {candles.map((c, i) => {
          const vh = (c.v / geo.vmax) * VOL_H;
          return (
            <rect
              key={i}
              x={geo.x(c.t) - geo.barW / 2}
              width={geo.barW}
              y={H - PAD_B - vh}
              height={vh}
              fill={c.c >= c.o ? "var(--up)" : "var(--down)"}
              opacity={hover === i ? 0.7 : 0.28}
            />
          );
        })}
        <path d={`${geo.line} L${W},${H - PAD_B} L0,${H - PAD_B} Z`} fill="url(#chart-fill)" />
        <path d={geo.line} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        <line x1="0" x2={W} y1={H - PAD_B} y2={H - PAD_B} stroke="var(--line-strong)" vectorEffect="non-scaling-stroke" />
        {h && <line x1={hx} x2={hx} y1="0" y2={H - PAD_B} stroke="var(--muted)" strokeDasharray="2 3" vectorEffect="non-scaling-stroke" />}
      </svg>

      {/* Overlays in CSS pixels so text and dots never stretch with the SVG. */}
      <span className="pointer-events-none absolute right-0 top-0 font-mono text-[10.5px] text-dim">{price(geo.max)}</span>
      <span className="pointer-events-none absolute right-0 font-mono text-[10.5px] text-dim" style={{ top: `${(geo.y(geo.min) / H) * 100}%`, transform: "translateY(-100%)" }}>
        {price(geo.min)}
      </span>
      <span className="pointer-events-none absolute bottom-0 left-0 font-mono text-[10.5px] text-dim">{axisTime(geo.t0, range)}</span>
      <span className="pointer-events-none absolute bottom-0 right-0 font-mono text-[10.5px] text-dim">now</span>
      <span
        className="pointer-events-none absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{ left: `${((h ? hx : W) / W) * 100}%`, top: `${((h ? hy : geo.y(geo.last.c)) / H) * 100}%`, background: color, boxShadow: `0 0 0 3px color-mix(in srgb, ${color} 25%, transparent)` }}
      />
      {h && (
        <div className="pointer-events-none absolute left-0 top-0 border border-line bg-bg/95 px-2.5 py-1.5 font-mono text-[11px] leading-relaxed">
          <div className="text-[12.5px] text-fg">{price(h.c)}</div>
          <div className="text-dim">{tipTime(h.t)}</div>
          {h.v > 0 && <div className="text-dim">vol {usd(h.v)}</div>}
        </div>
      )}
    </div>
  );
}

function MarketStats({ stats, buys, sells }: { stats: [string, string | null][]; buys: number | null; sells: number | null }) {
  const shown = stats.filter((x): x is [string, string] => x[1] != null);
  const trades = buys != null && sells != null ? buys + sells : 0;
  if (!stats.length && !trades) return <p className="text-[12px] text-dim">No trades in the last 24 hours.</p>;
  if (!shown.length && !trades) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10" />
        <p className="text-[11.5px] text-dim">Market data appears within a minute or so of the first trade.</p>
      </div>
    );
  }
  return (
    <>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-4 text-[12px]">
        {shown.map(([k, v]) => (
          <Stat key={k} k={k} v={v} />
        ))}
      </dl>
      {trades > 0 && (
        <div className="mt-5 border-t border-line pt-4">
          <div className="flex items-baseline justify-between text-[12px]">
            <span className="text-dim">24h trades</span>
            <span className="font-mono text-[14px] text-fg">{num(trades)}</span>
          </div>
          <div className="mt-2.5 flex h-1.5 overflow-hidden bg-surface-3">
            <div className="bg-up" style={{ width: `${(buys! / trades) * 100}%` }} />
            <div className="bg-down" style={{ width: `${(sells! / trades) * 100}%` }} />
          </div>
          <div className="mt-1.5 flex justify-between font-mono text-[11px]">
            <span className="text-up">{num(buys)} buys</span>
            <span className="text-down">{num(sells)} sells</span>
          </div>
        </div>
      )}
    </>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="text-dim">{k}</dt>
      <dd className="mt-0.5 font-mono text-[14px] text-fg">{v}</dd>
    </div>
  );
}

function KV({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-dim">{k}</dt>
      <dd className="text-muted">{v}</dd>
    </div>
  );
}

function Social({ href, label, icon }: { href: string; label: string; icon?: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-line px-2.5 py-1 text-[12px] text-muted transition-colors hover:border-line-strong hover:text-fg">
      {icon}
      {label}
      <ArrowUpRight size={11} />
    </a>
  );
}

export function CoinSkeleton() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <Skeleton className="h-3 w-20" />
      <div className="mt-4 flex items-center gap-4">
        <Skeleton className="h-16 w-16" />
        <div className="space-y-2">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_320px]">
        <Skeleton className="h-[400px]" />
        <div className="space-y-4">
          <Skeleton className="h-44" />
          <Skeleton className="h-24" />
          <Skeleton className="h-56" />
        </div>
      </div>
    </div>
  );
}
