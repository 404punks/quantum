"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { DIM, FG, Frame, GREEN, LINE, LINE_STRONG, MUTED, RED, SURFACE, TopBar } from "./graphics";
import { MONO, SANS } from "./fonts";
import { Scene, Shade } from "./scene-graphics";

/**
 * New token pages: a snapshot of a live quantum coin's page (hero, stats
 * strip, chart, vault and provenance cards) from /api/brand/coin.
 */

type Candle = { t: number; o: number; h: number; l: number; c: number; v: number };
type Coin = {
  launch: { name: string; symbol: string; mint: string; leaf_index: number | null; scheme: string };
  identity: { passphrase_hardened: boolean };
  overview: { price: number | null; marketCap: number | null; v24hUSD: number | null; holder: number | null; liquidity: number | null; priceChange24hPercent: number | null } | null;
  curve: { complete: boolean; progress: number } | null;
  vault: { address: string; tokens: number; pctSupply: number; spent: boolean } | null;
  candles: Candle[];
  image: string | null;
};

const BG_CARD = "#1a1918";
const usd = (n: number | null | undefined) =>
  n == null ? "—" : n >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(1)}K` : `$${n.toFixed(2)}`;
const price = (n: number | null | undefined) => (n == null ? "—" : n < 0.01 ? `$${n.toPrecision(3)}` : `$${n.toFixed(4)}`);
const short = (s: string, a = 4, b = 4) => `${s.slice(0, a)}…${s.slice(-b)}`;

function useCoin() {
  const [coin, setCoin] = useState<Coin | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/brand/coin")
      .then((r) => r.json())
      .then((j) => !cancelled && !j.error && setCoin(j))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  return coin;
}

function Card({ children, style }: { children: ReactNode; style?: React.CSSProperties }) {
  return <div style={{ background: BG_CARD, border: `1px solid ${LINE}`, borderRadius: 16, ...style }}>{children}</div>;
}

function Pill({ children, up }: { children: ReactNode; up?: boolean }) {
  return (
    <span
      style={{
        fontFamily: MONO,
        fontSize: 13,
        padding: "3px 10px",
        borderRadius: 999,
        border: `1px solid ${up ? "rgba(63,185,80,0.3)" : LINE}`,
        background: up ? "rgba(63,185,80,0.06)" : "transparent",
        color: up ? GREEN : MUTED,
      }}
    >
      {children}
    </span>
  );
}

function Chart({ candles, w, h }: { candles: Candle[]; w: number; h: number }) {
  const geo = useMemo(() => {
    if (candles.length < 2) return null;
    const t0 = candles[0].t;
    const t1 = candles[candles.length - 1].t;
    const min = Math.min(...candles.map((c) => c.l));
    const max = Math.max(...candles.map((c) => c.h));
    const x = (t: number) => ((t - t0) / Math.max(t1 - t0, 1)) * w;
    const y = (v: number) => 8 + (1 - (v - min) / (max - min || 1)) * (h - 40);
    const line = candles.map((c, i) => `${i ? "L" : "M"}${x(c.t).toFixed(1)},${y(c.c).toFixed(1)}`).join(" ");
    const vmax = Math.max(...candles.map((c) => c.v)) || 1;
    return { x, y, line, vmax, up: candles[candles.length - 1].c >= candles[0].o, last: candles[candles.length - 1] };
  }, [candles, w, h]);
  if (!geo) return <div style={{ width: w, height: h }} />;
  const color = geo.up ? GREEN : RED;
  const bar = Math.max(3, (w / candles.length) * 0.55);
  return (
    <svg width={w} height={h} style={{ display: "block", overflow: "visible" }}>
      <defs>
        <linearGradient id="cp-fill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.22" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {candles.map((c, i) => {
        const vh = (c.v / geo.vmax) * 34;
        return <rect key={i} x={geo.x(c.t) - bar / 2} width={bar} y={h - vh} height={vh} fill={c.c >= c.o ? GREEN : RED} opacity={0.28} />;
      })}
      <path d={`${geo.line} L${w},${h} L0,${h} Z`} fill="url(#cp-fill)" />
      <path d={geo.line} fill="none" stroke={color} strokeWidth={2.25} strokeLinejoin="round" />
      <circle cx={geo.x(geo.last.t)} cy={geo.y(geo.last.c)} r={8} fill={color} opacity={0.25} />
      <circle cx={geo.x(geo.last.t)} cy={geo.y(geo.last.c)} r={4} fill={color} />
    </svg>
  );
}

function CoinPage({ scene }: { scene?: boolean }) {
  const coin = useCoin();
  const o = coin?.overview ?? null;
  const change = o?.priceChange24hPercent ?? null;
  const up = (change ?? 0) >= 0;
  const cells: [string, string][] = [
    ["Market cap", usd(o?.marketCap)],
    ["24h volume", usd(o?.v24hUSD)],
    ["Holders", o?.holder != null ? o.holder.toLocaleString("en-US") : "—"],
    ["Liquidity", usd(o?.liquidity)],
  ];
  const corner = (pos: React.CSSProperties) => (
    <span style={{ position: "absolute", width: 18, height: 18, borderColor: FG, borderStyle: "solid", borderWidth: 0, ...pos }} />
  );

  return (
    <Frame w={1600} h={900} plain={scene}>
      {scene && (
        <>
          <Scene w={1600} h={900} scale={1.15} x={0.85} y={0.3} />
          <Shade style={{ background: "linear-gradient(180deg, rgba(18,17,16,0.7) 0%, rgba(18,17,16,0.9) 26%, rgba(18,17,16,0.97) 42%, rgba(18,17,16,0.97) 100%)" }} />
        </>
      )}
      <TopBar pad={96} right="new · token pages" />

      <div style={{ position: "absolute", left: 96, top: 166, display: "flex", alignItems: "center", gap: 14 }}>
        <span style={{ width: 9, height: 9, borderRadius: "50%", background: GREEN, display: "inline-block" }} />
        <span style={{ fontFamily: SANS, fontWeight: 600, fontSize: 38, color: FG, letterSpacing: -0.5 }}>Token pages, rebuilt.</span>
      </div>

      {/* Hero card */}
      <div
        style={{
          position: "absolute",
          left: 96,
          right: 96,
          top: 246,
          background: BG_CARD,
          border: `1px solid ${LINE_STRONG}`,
          borderRadius: 18,
          padding: "26px 30px",
          backgroundImage: "radial-gradient(rgba(255,255,255,0.045) 1px, transparent 1px)",
          backgroundSize: "12px 12px",
        }}
      >
        {corner({ left: -1, top: -1, borderLeftWidth: 2, borderTopWidth: 2, borderTopLeftRadius: 18 })}
        {corner({ right: -1, top: -1, borderRightWidth: 2, borderTopWidth: 2, borderTopRightRadius: 18 })}
        {corner({ left: -1, bottom: -1, borderLeftWidth: 2, borderBottomWidth: 2, borderBottomLeftRadius: 18 })}
        {corner({ right: -1, bottom: -1, borderRightWidth: 2, borderBottomWidth: 2, borderBottomRightRadius: 18 })}

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
            {coin?.image ? (
              <img src={coin.image} alt="" style={{ width: 84, height: 84, borderRadius: 18, border: `1px solid ${LINE}`, objectFit: "cover" }} />
            ) : (
              <div style={{ width: 84, height: 84, borderRadius: 18, background: SURFACE }} />
            )}
            <div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
                <span style={{ fontFamily: SANS, fontWeight: 600, fontSize: 32, color: FG }}>{coin?.launch.name ?? "…"}</span>
                <span style={{ fontFamily: MONO, fontSize: 18, color: MUTED }}>${coin?.launch.symbol ?? ""}</span>
              </div>
              <div style={{ marginTop: 10, display: "flex", gap: 8, alignItems: "center" }}>
                <span style={{ background: FG, color: "#121110", fontFamily: MONO, fontSize: 12, fontWeight: 700, letterSpacing: 1.5, padding: "3px 9px" }}>QUANTUM</span>
                <Pill up>PQ-attested{coin?.launch.leaf_index != null ? ` · leaf ${coin.launch.leaf_index}` : ""}</Pill>
                {coin?.identity.passphrase_hardened && <Pill>hardened</Pill>}
                {coin?.curve?.complete && <Pill>graduated</Pill>}
              </div>
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 12, justifyContent: "flex-end" }}>
              <span style={{ fontFamily: MONO, fontSize: 34, color: FG }}>{price(o?.price)}</span>
              {change != null && (
                <span style={{ fontFamily: MONO, fontSize: 15, padding: "3px 9px", borderRadius: 7, background: up ? "rgba(63,185,80,0.12)" : "rgba(242,85,90,0.12)", color: up ? GREEN : RED }}>
                  {up ? "+" : ""}
                  {change.toFixed(1)}% 24h
                </span>
              )}
            </div>
            <div style={{ marginTop: 12, display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <span style={{ background: FG, color: "#121110", borderRadius: 12, padding: "9px 18px", fontFamily: SANS, fontWeight: 600, fontSize: 15 }}>Trade on pump.fun ↗</span>
              <span style={{ border: `1px solid ${LINE}`, color: MUTED, borderRadius: 12, padding: "9px 14px", fontFamily: MONO, fontSize: 14 }}>CA {coin ? short(coin.launch.mint) : ""}</span>
            </div>
          </div>
        </div>

        <div style={{ marginTop: 24, display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 1, background: LINE, border: `1px solid ${LINE}`, borderRadius: 12, overflow: "hidden" }}>
          {cells.map(([k, v]) => (
            <div key={k} style={{ background: "#121110", padding: "14px 18px" }}>
              <div style={{ fontFamily: SANS, fontSize: 13, color: DIM }}>{k}</div>
              <div style={{ marginTop: 5, fontFamily: MONO, fontSize: 20, color: FG }}>{v}</div>
            </div>
          ))}
          <div style={{ background: "#121110", padding: "14px 18px" }}>
            <div style={{ fontFamily: SANS, fontSize: 13, color: DIM }}>{coin?.curve?.complete ? "Graduated" : "Bonding curve"}</div>
            <div style={{ marginTop: 9, display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontFamily: MONO, fontSize: 17, color: FG }}>{coin?.curve ? `${(coin.curve.progress * 100).toFixed(0)}%` : "—"}</span>
              <span style={{ flex: 1, height: 6, borderRadius: 999, background: "#2a2826", overflow: "hidden" }}>
                <span style={{ display: "block", height: "100%", width: `${Math.max((coin?.curve?.progress ?? 0) * 100, 2)}%`, background: coin?.curve?.complete ? GREEN : FG, borderRadius: 999 }} />
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Chart + side cards */}
      <div style={{ position: "absolute", left: 96, right: 96, top: 560, display: "grid", gridTemplateColumns: "1fr 330px 330px", gap: 18 }}>
        <Card style={{ padding: "20px 24px", height: 250 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontFamily: MONO, fontSize: 13, color: DIM }}>
            <span>PRICE · 24H</span>
            <span>1H 1D 1W 1M</span>
          </div>
          <div style={{ marginTop: 14 }}>
            <Chart candles={coin?.candles ?? []} w={640} h={180} />
          </div>
        </Card>

        <Card style={{ padding: "20px 24px", height: 250, border: `1px solid ${LINE_STRONG}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontFamily: MONO, fontSize: 13 }}>
            <span style={{ color: DIM }}>QUANTUM VAULT</span>
            <span style={{ color: coin?.vault?.spent ? "#e3b341" : GREEN }}>{coin?.vault ? (coin.vault.spent ? "withdrawn" : "locked") : ""}</span>
          </div>
          <div style={{ marginTop: 18, fontFamily: MONO, fontSize: 34, color: FG }}>
            {coin?.vault ? coin.vault.tokens.toLocaleString("en-US", { notation: "compact", maximumFractionDigits: 2 }) : "…"}
            <span style={{ marginLeft: 8, fontSize: 15, color: MUTED }}>${coin?.launch.symbol ?? ""}</span>
          </div>
          <div style={{ marginTop: 6, fontFamily: SANS, fontSize: 14, color: DIM }}>dev funds, live from chain</div>
          <div style={{ marginTop: 26, fontFamily: SANS, fontSize: 14, color: MUTED, lineHeight: 1.5 }}>Moves only with a hash-based signature.</div>
        </Card>

        <Card style={{ padding: "20px 24px", height: 250 }}>
          <div style={{ fontFamily: MONO, fontSize: 13, color: DIM }}>PROVENANCE</div>
          <div style={{ marginTop: 18, display: "flex", alignItems: "center", gap: 14 }}>
            <span style={{ width: 44, height: 44, borderRadius: "50%", border: "1px solid rgba(63,185,80,0.4)", background: "rgba(63,185,80,0.1)", color: GREEN, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>✓</span>
            <div>
              <div style={{ fontFamily: SANS, fontWeight: 600, fontSize: 20, color: FG }}>Verified</div>
              <div style={{ fontFamily: MONO, fontSize: 13, color: DIM }}>WOTS leaf #{coin?.launch.leaf_index ?? "…"}</div>
            </div>
          </div>
          <div style={{ marginTop: 28, fontFamily: SANS, fontSize: 14, color: MUTED, lineHeight: 1.5 }}>Checked in your browser, every visit.</div>
        </Card>
      </div>
    </Frame>
  );
}

export const CoinPageScene = () => <CoinPage scene />;
export const CoinPageTweet = () => <CoinPage />;
