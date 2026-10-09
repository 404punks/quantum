"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { num, pct, price, usd } from "@/lib/format";
import { DIM, FG, Frame, GREEN, LINE, LINE_STRONG, MUTED, RED, SURFACE } from "./graphics";
import { MONO, SANS } from "./fonts";

/**
 * $PQC as a snippet of its coin page: header, live chart, stats. Data comes
 * from our own /api/token on render, so every export is current.
 */

const PQC_MINT = "7K52aYQW9rWGjwZmQ7o2d1P6E7bji6hSMsqaLy5EcxLh";
const SURFACE_3 = "#2a2826";

type Candle = { t: number; o: number; h: number; l: number; c: number; v: number };
type TokenData = {
  launch: { name: string; symbol: string; leaf_index: number | null; scheme: string };
  candles: Candle[];
  overview: {
    price: number | null;
    marketCap: number | null;
    liquidity: number | null;
    v24hUSD: number | null;
    holder: number | null;
    priceChange24hPercent: number | null;
    buys24h: number | null;
    sells24h: number | null;
  } | null;
  curve: { complete: boolean; progress: number } | null;
};

function useToken(mint: string) {
  const [data, setData] = useState<TokenData | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/token/${mint}?range=1D`)
      .then((r) => r.json())
      .then((j) => !cancelled && !j.error && setData(j))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [mint]);
  return data;
}

function Panel({ children, style }: { children: ReactNode; style?: React.CSSProperties }) {
  return <div style={{ background: SURFACE, border: `1px solid ${LINE}`, borderRadius: 12, ...style }}>{children}</div>;
}

function Pill({ children, up }: { children: ReactNode; up?: boolean }) {
  return (
    <span
      style={{
        fontFamily: MONO,
        fontSize: 14,
        padding: "3px 10px",
        borderRadius: 999,
        border: `1px solid ${up ? "rgba(63,185,80,0.3)" : LINE}`,
        background: up ? "rgba(63,185,80,0.05)" : "transparent",
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
    const volH = 64;
    const padB = 30;
    const x = (t: number) => ((t - t0) / Math.max(t1 - t0, 1)) * w;
    const y = (v: number) => 14 + (1 - (v - min) / (max - min || 1)) * (h - 14 - padB - volH * 0.45);
    const line = candles.map((c, i) => `${i ? "L" : "M"}${x(c.t).toFixed(1)},${y(c.c).toFixed(1)}`).join(" ");
    const vmax = Math.max(...candles.map((c) => c.v)) || 1;
    return { x, y, line, vmax, volH, padB, min, max, up: candles[candles.length - 1].c >= candles[0].o, last: candles[candles.length - 1] };
  }, [candles, w, h]);

  if (!geo) return <div style={{ width: w, height: h }} />;
  const color = geo.up ? GREEN : RED;
  const base = h - geo.padB;
  const bar = Math.max(3, (w / candles.length) * 0.55);
  const label = { position: "absolute" as const, fontFamily: MONO, fontSize: 13, color: DIM };

  return (
    <div style={{ position: "relative", width: w, height: h }}>
      <svg width={w} height={h} style={{ display: "block", overflow: "visible" }}>
        <defs>
          <linearGradient id="pqc-snippet-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.22" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.2, 0.45, 0.7].map((f) => (
          <line key={f} x1="0" x2={w} y1={base * f} y2={base * f} stroke={LINE} strokeDasharray="2 6" />
        ))}
        {candles.map((c, i) => {
          const vh = (c.v / geo.vmax) * geo.volH;
          return <rect key={i} x={geo.x(c.t) - bar / 2} width={bar} y={base - vh} height={vh} fill={c.c >= c.o ? GREEN : RED} opacity={0.28} />;
        })}
        <path d={`${geo.line} L${w},${base} L0,${base} Z`} fill="url(#pqc-snippet-fill)" />
        <path d={geo.line} fill="none" stroke={color} strokeWidth={2.25} strokeLinejoin="round" />
        <line x1="0" x2={w} y1={base} y2={base} stroke={LINE_STRONG} />
        <circle cx={geo.x(geo.last.t)} cy={geo.y(geo.last.c)} r={8} fill={color} opacity={0.25} />
        <circle cx={geo.x(geo.last.t)} cy={geo.y(geo.last.c)} r={4} fill={color} />
      </svg>
      <span style={{ ...label, right: 0, top: -2 }}>{price(geo.max)}</span>
      <span style={{ ...label, right: 0, top: geo.y(geo.min) - 20 }}>{price(geo.min)}</span>
      <span style={{ ...label, left: 0, bottom: 0 }}>24h ago</span>
      <span style={{ ...label, right: 0, bottom: 0 }}>now</span>
    </div>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <div style={{ fontFamily: SANS, fontSize: 15, color: DIM }}>{k}</div>
      <div style={{ fontFamily: MONO, fontSize: 24, color: FG, marginTop: 4 }}>{v}</div>
    </div>
  );
}

export function PqcTokenTweet() {
  const data = useToken(PQC_MINT);
  const o = data?.overview ?? null;
  const change = o?.priceChange24hPercent ?? null;
  const buys = o?.buys24h ?? 0;
  const sells = o?.sells24h ?? 0;
  const trades = buys + sells;
  const curve = data?.curve ?? null;
  const stats: [string, string | null][] = [
    ["Market cap", o?.marketCap ? usd(o.marketCap) : null],
    ["24h volume", o?.v24hUSD ? usd(o.v24hUSD) : null],
    ["Holders", o?.holder != null ? num(o.holder) : null],
    ["Liquidity", o?.liquidity ? usd(o.liquidity) : null],
  ];

  return (
    <Frame w={1600} h={900} plain>
      {/* Coin header */}
      <div style={{ position: "absolute", left: 72, right: 72, top: 76, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <img src="/logo-mark.png" alt="" style={{ width: 76, height: 76, borderRadius: 14, border: `1px solid ${LINE}`, background: SURFACE }} />
          <div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
              <span style={{ fontFamily: SANS, fontWeight: 600, fontSize: 34, color: FG }}>{data?.launch.name ?? "pqc.market"}</span>
              <span style={{ fontFamily: MONO, fontSize: 20, color: MUTED }}>${data?.launch.symbol ?? "PQC"}</span>
            </div>
            <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
              <Pill up>PQ-attested{data?.launch.leaf_index != null ? ` · leaf ${data.launch.leaf_index}` : ""}</Pill>
              {curve?.complete && <Pill>graduated</Pill>}
            </div>
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontFamily: MONO, fontSize: 40, color: FG, lineHeight: 1 }}>{o?.price != null ? price(o.price) : ""}</div>
          {change != null && <div style={{ marginTop: 10, fontFamily: MONO, fontSize: 18, color: change >= 0 ? GREEN : RED }}>{pct(change)} <span style={{ color: DIM }}>24h</span></div>}
        </div>
      </div>

      {/* Chart */}
      <Panel style={{ position: "absolute", left: 72, top: 206, width: 1030, height: 622, padding: "26px 30px" }}>
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <div style={{ display: "flex", border: `1px solid ${LINE}`, background: "#121110", padding: 2, fontFamily: MONO, fontSize: 14 }}>
            {["1H", "1D", "1W", "1M"].map((r) => (
              <span key={r} style={{ padding: "4px 12px", background: r === "1D" ? FG : "transparent", color: r === "1D" ? "#121110" : MUTED }}>
                {r}
              </span>
            ))}
          </div>
        </div>
        <div style={{ marginTop: 20 }}>
          <Chart candles={data?.candles ?? []} w={968} h={506} />
        </div>
      </Panel>

      {/* Stats */}
      <div style={{ position: "absolute", left: 1126, right: 72, top: 206, display: "flex", flexDirection: "column", gap: 18 }}>
        <Panel style={{ padding: "26px 28px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", rowGap: 24, columnGap: 20 }}>
            {stats
              .filter((s): s is [string, string] => s[1] != null)
              .map(([k, v]) => (
                <Stat key={k} k={k} v={v} />
              ))}
          </div>
          {trades > 0 && (
            <div style={{ marginTop: 26, paddingTop: 20, borderTop: `1px solid ${LINE}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <span style={{ fontFamily: SANS, fontSize: 15, color: DIM }}>24h trades</span>
                <span style={{ fontFamily: MONO, fontSize: 22, color: FG }}>{num(trades)}</span>
              </div>
              <div style={{ marginTop: 12, display: "flex", height: 7, background: SURFACE_3 }}>
                <div style={{ width: `${(buys / trades) * 100}%`, background: GREEN }} />
                <div style={{ width: `${(sells / trades) * 100}%`, background: RED }} />
              </div>
              <div style={{ marginTop: 8, display: "flex", justifyContent: "space-between", fontFamily: MONO, fontSize: 14 }}>
                <span style={{ color: GREEN }}>{num(buys)} buys</span>
                <span style={{ color: RED }}>{num(sells)} sells</span>
              </div>
            </div>
          )}
        </Panel>

        {curve && (
          <Panel style={{ padding: "24px 28px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontFamily: SANS, fontSize: 15 }}>
              <span style={{ color: MUTED }}>{curve.complete ? "Graduated to PumpSwap" : "Bonding curve"}</span>
              <span style={{ fontFamily: MONO, color: FG }}>{(curve.progress * 100).toFixed(1)}%</span>
            </div>
            <div style={{ marginTop: 12, height: 7, borderRadius: 999, background: SURFACE_3, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${Math.max(curve.progress * 100, 1)}%`, borderRadius: 999, background: curve.complete ? GREEN : FG }} />
            </div>
          </Panel>
        )}
      </div>
    </Frame>
  );
}
