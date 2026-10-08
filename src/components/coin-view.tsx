"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Anchor, ArrowUpRight, Check, Fingerprint, Globe, Lock, MessageCircle, Send, X } from "lucide-react";
import { SCHEMES, isSchemeId } from "@/lib/pq/scheme-info";
import { verifyLaunch, type LaunchVerification } from "@/lib/pq/verify-launch";
import type { CurveState } from "@/lib/types";
import { ago, cn, num, pct, price, short, usd } from "@/lib/format";
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
    price: number;
    marketCap: number;
    liquidity: number;
    holder: number;
    v24hUSD: number;
    priceChange24hPercent: number;
    trade24h: number;
    uniqueWallet24h: number;
  } | null;
  candles: Candle[];
  curve: CurveState | null;
  solPrice: number | null;
};

export function CoinView({ mint }: { mint: string }) {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [chartLoading, setChartLoading] = useState(true);
  const [verification, setVerification] = useState<LaunchVerification | null>(null);

  useEffect(() => {
    let cancelled = false;
    setChartLoading(true);
    const load = () =>
      fetch(`/api/token/${mint}?range=1H`)
        .then((r) => r.json())
        .then((j) => {
          if (cancelled) return;
          if (j.error) setError(j.error);
          else setData(j);
        })
        .catch(() => !cancelled && setError("Failed to load"))
        .finally(() => !cancelled && setChartLoading(false));
    void load();
    const id = setInterval(load, 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [mint]);

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
  const marketCap = overview?.marketCap ?? (curve && data.solPrice ? curve.marketCapSol * data.solPrice : null);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <Link href="/" className="cursor-pointer text-[12.5px] text-muted hover:text-fg">← All coins</Link>

      <header className="mt-4 flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <img src={launch.image_url} alt="" className="h-16 w-16 rounded-xl border border-line object-cover" />
          <div>
            <h1 className="flex flex-wrap items-center gap-2 text-[22px] font-semibold">
              {launch.name}
              <span className="font-mono text-[14px] font-normal text-muted">${launch.symbol}</span>
            </h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <Pill tone="up">{schemeTag}</Pill>
              {identity.anchor_tx && <Pill>anchored root</Pill>}
              {identity.passphrase_hardened && <Pill>hardened</Pill>}
              <CopyText value={launch.mint} display={short(launch.mint, 6, 6)} className="ml-1 text-[11.5px] text-dim" />
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <a
            href={`https://pump.fun/coin/${launch.mint}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-fg px-4 py-2 text-[13px] font-medium text-bg hover:bg-white"
          >
            {/* TODO: in-app buy/sell via pump-sdk buyInstructions/sellInstructions */}
            Trade on pump.fun <ArrowUpRight size={13} />
          </a>
          <Button onClick={runVerify}>Verify</Button>
        </div>
      </header>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <Panel className="p-5">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <div className="font-mono text-[24px] text-fg">{price(overview?.price)}</div>
                <div className={cn("font-mono text-[12.5px]", change == null ? "text-dim" : up ? "text-up" : "text-down")}>
                  {pct(change)} <span className="text-dim">24h</span>
                </div>
              </div>
              <span className="font-mono text-[11px] text-dim">1h · 1m candles</span>
            </div>
            <div className="mt-4 h-[300px]">
              {chartLoading && !candles.length ? <Skeleton className="h-full w-full" /> : <PriceChart candles={candles} />}
            </div>
          </Panel>

          {verification && <LaunchVerificationView v={verification} title="Attestation verified in your browser" />}

        </div>

        <aside className="space-y-4">
          <Panel className="p-5">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-4 text-[12px]">
              <Stat k="Market cap" v={usd(marketCap)} />
              <Stat k="Liquidity" v={usd(overview?.liquidity)} />
              <Stat k="24h volume" v={usd(overview?.v24hUSD)} />
              <Stat k="Holders" v={num(overview?.holder)} />
              <Stat k="24h trades" v={num(overview?.trade24h)} />
              <Stat k="24h wallets" v={num(overview?.uniqueWallet24h)} />
            </dl>
            {!overview && <p className="mt-4 text-[11.5px] text-dim">Market data appears within a minute or so of launch.</p>}
          </Panel>

          <Panel className="p-5">
            <div className="mb-2 flex items-center justify-between text-[12px]">
              <span className="text-muted">{curve?.complete ? "Graduated to PumpSwap" : "Bonding curve"}</span>
              <span className="font-mono">{curve ? `${(curve.progress * 100).toFixed(1)}%` : "—"}</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-surface-3">
              <div className={cn("h-full rounded-full", curve?.complete ? "bg-up" : "bg-fg")} style={{ width: `${Math.max((curve?.progress ?? 0) * 100, 1)}%` }} />
            </div>
            <p className="mt-3 text-[11.5px] text-dim">
              {curve?.complete
                ? "Liquidity migrated to the pump AMM."
                : "When the curve fills, liquidity migrates to PumpSwap automatically."}
            </p>
          </Panel>

          <Panel className="p-5">
            <div className="mb-3 flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-dim">Provenance</span>
              {verification && (
                <Pill tone={verification.valid ? "up" : "down"}>
                  {verification.valid ? <Check size={10} /> : <X size={10} />} {verification.valid ? "valid" : "invalid"}
                </Pill>
              )}
            </div>
            <dl className="space-y-2 font-mono text-[11px]">
              <KV k="signer" v={<CopyText value={identity.pq_address} display={short(identity.pq_address, 8, 6)} />} />
              <KV k="creator" v={<CopyText value={launch.creator} display={short(launch.creator, 6, 6)} />} />
              <KV k="root" v={<CopyText value={identity.root} display={short(identity.root, 8, 6)} />} />
              <KV k="scheme" v={schemeInfo.name} />
              {verification?.kind === "scheme" ? (
                <KV k="certified by" v={`leaf #${verification.leaf}`} />
              ) : (
                <KV k="leaf" v={`#${launch.leaf_index} / ${1 << identity.height}`} />
              )}
              <KV k="sig size" v={`${schemeInfo.sigBytes.toLocaleString()} B`} />
              <KV k="dev buy" v={`${launch.dev_buy_sol} SOL`} />
              <KV k="launched" v={ago(launch.launched_at)} />
            </dl>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Button size="sm" onClick={runVerify}>Verify here</Button>
              {launch.metadata_uri ? (
                <a href={launch.metadata_uri} target="_blank" rel="noreferrer" className="inline-flex cursor-pointer items-center justify-center gap-1 rounded-xl border border-line px-2.5 py-1.5 text-[12px] hover:border-line-strong hover:bg-surface-2">
                  Metadata <ArrowUpRight size={11} />
                </a>
              ) : <span />}
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

function PriceChart({ candles: raw }: { candles: Candle[] }) {
  const [hover, setHover] = useState<number | null>(null);
  // A brand-new coin may have one candle; draw it as open → close.
  const candles = useMemo(() => (raw.length === 1 ? [{ ...raw[0], c: raw[0].o, v: 0 }, raw[0]] : raw), [raw]);
  const W = 1000;
  const H = 300;
  const geo = useMemo(() => {
    if (candles.length < 2) return null;
    const closes = candles.map((c) => c.c);
    const min = Math.min(...candles.map((c) => c.l));
    const max = Math.max(...candles.map((c) => c.h));
    const span = max - min || 1;
    const x = (i: number) => (i / (candles.length - 1)) * W;
    const y = (v: number) => H - 12 - ((v - min) / span) * (H - 24);
    const line = closes.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
    const vmax = Math.max(...candles.map((c) => c.v)) || 1;
    return { x, y, line, vmax, up: closes[closes.length - 1] >= closes[0] };
  }, [candles]);

  if (!geo) {
    return (
      <div className="flex h-full items-center justify-center border border-dashed border-line text-[12.5px] text-dim">
        Waiting for the first trade.
      </div>
    );
  }
  const color = geo.up ? "var(--up)" : "var(--down)";
  const h = hover != null ? candles[hover] : null;

  return (
    <div
      className="relative h-full w-full"
      onMouseMove={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const ratio = (e.clientX - rect.left) / rect.width;
        setHover(Math.max(0, Math.min(candles.length - 1, Math.round(ratio * (candles.length - 1)))));
      }}
      onMouseLeave={() => setHover(null)}
    >
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-full w-full">
        <defs>
          <linearGradient id="chart-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.18" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1="0" x2={W} y1={H * f} y2={H * f} stroke="var(--line)" strokeDasharray="3 5" vectorEffect="non-scaling-stroke" />
        ))}
        {candles.map((c, i) => (
          <rect key={i} x={geo.x(i) - 1.5} width="3" y={H - (c.v / geo.vmax) * 40} height={(c.v / geo.vmax) * 40} fill="var(--line-strong)" />
        ))}
        <path d={`${geo.line} L${W},${H} L0,${H} Z`} fill="url(#chart-fill)" />
        <path d={geo.line} fill="none" stroke={color} strokeWidth="1.75" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        {hover != null && (
          <line x1={geo.x(hover)} x2={geo.x(hover)} y1="0" y2={H} stroke="var(--muted)" strokeDasharray="2 3" vectorEffect="non-scaling-stroke" />
        )}
      </svg>
      {h && (
        <div className="pointer-events-none absolute left-2 top-2 rounded-xl border border-line bg-bg/90 px-2.5 py-1.5 font-mono text-[11px]">
          <div className="text-fg">{price(h.c)}</div>
          <div className="text-dim">{new Date(h.t * 1000).toLocaleString()}</div>
          <div className="text-dim">vol {usd(h.v)}</div>
        </div>
      )}
    </div>
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
