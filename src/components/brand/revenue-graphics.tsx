"use client";

import type { ReactNode } from "react";
import { AMBER, Accent, BG, DIM, FG, Frame, GREEN, Headline, LINE, LINE_STRONG, MUTED, Mono, SURFACE, TERM, TopBar } from "./graphics";
import { MONO, SERIF } from "./fonts";
import { Scene, Shade } from "./scene-graphics";

/**
 * Revenue split announcement: 60% $PQC buyback and burn (live), 20%
 * quantum-resistant liquidity pools (teased, deliberately light on detail),
 * 20% backing the top tokens launched on pqc.market.
 */

const POOL = "#c9a8ff";

function Card({ pct, color, title, children, tag }: { pct: string; color: string; title: string; children: ReactNode; tag?: string }) {
  return (
    <div style={{ position: "relative", border: `1px solid ${LINE_STRONG}`, background: "rgba(11,10,10,0.94)", padding: "22px 22px 20px", display: "flex", flexDirection: "column", minWidth: 0 }}>
      <div style={{ position: "absolute", left: 0, top: 0, right: 0, height: 3, background: color }} />
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <span style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 56, color, lineHeight: 1 }}>{pct}</span>
        {tag && <span style={{ fontFamily: MONO, fontSize: 12, color, border: `1px solid ${color}`, padding: "2px 7px", letterSpacing: 1 }}>{tag}</span>}
      </div>
      <div style={{ marginTop: 10, fontFamily: SERIF, fontWeight: 700, fontSize: 24, color: FG, lineHeight: 1.15 }}>{title}</div>
      <div style={{ marginTop: "auto", paddingTop: 18 }}>{children}</div>
    </div>
  );
}

/** SOL → $PQC → burn, with supply trending down. */
function BurnDiagram() {
  const node = (label: string, color: string) => (
    <div style={{ border: `1px solid ${color}`, color, fontFamily: MONO, fontSize: 14, padding: "6px 0", width: 66, textAlign: "center" }}>{label}</div>
  );
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        {node("SOL", MUTED)}
        <span style={{ color: DIM, fontFamily: MONO }}>→</span>
        {node("$PQC", FG)}
        <span style={{ color: DIM, fontFamily: MONO }}>→</span>
        {node("burn", GREEN)}
      </div>
      <svg width="100%" height="64" viewBox="0 0 220 64" preserveAspectRatio="none" style={{ marginTop: 14, display: "block" }}>
        <defs>
          <linearGradient id="burn-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={GREEN} stopOpacity="0.25" />
            <stop offset="100%" stopColor={GREEN} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d="M0,8 L30,10 L55,15 L80,17 L105,24 L130,28 L155,35 L180,40 L205,47 L220,50 L220,64 L0,64 Z" fill="url(#burn-fill)" />
        <path d="M0,8 L30,10 L55,15 L80,17 L105,24 L130,28 L155,35 L180,40 L205,47 L220,50" fill="none" stroke={GREEN} strokeWidth="2" vectorEffect="non-scaling-stroke" />
      </svg>
      <div style={{ display: "flex", justifyContent: "space-between", fontFamily: MONO, fontSize: 13, color: DIM, marginTop: 4 }}>
        <span>circulating supply</span>
        <span style={{ color: GREEN }}>↓ every 30 min</span>
      </div>
    </div>
  );
}

/** Two assets bound by a hash-lock: the pool, kept deliberately abstract. */
function PoolDiagram() {
  return (
    <div>
      <svg width="100%" height="110" viewBox="0 0 220 110" style={{ display: "block" }}>
        <circle cx="52" cy="55" r="34" fill="none" stroke={POOL} strokeOpacity="0.9" strokeWidth="1.5" />
        <circle cx="168" cy="55" r="34" fill="none" stroke={POOL} strokeOpacity="0.9" strokeWidth="1.5" />
        <circle cx="110" cy="55" r="58" fill="none" stroke={POOL} strokeOpacity="0.25" strokeDasharray="3 5" />
        <line x1="86" y1="55" x2="134" y2="55" stroke={POOL} strokeWidth="1.5" />
        <rect x="98" y="44" width="24" height="20" rx="2" fill={BG} stroke={POOL} strokeWidth="1.5" />
        <path d="M103,44 v-6 a7,7 0 0 1 14,0 v6" fill="none" stroke={POOL} strokeWidth="1.5" />
        <text x="52" y="60" textAnchor="middle" fill={FG} style={{ fontFamily: MONO, fontSize: 13 }}>$PQC</text>
        <text x="168" y="60" textAnchor="middle" fill={FG} style={{ fontFamily: MONO, fontSize: 13 }}>pair</text>
      </svg>
      <div style={{ display: "flex", justifyContent: "space-between", fontFamily: MONO, fontSize: 13, color: DIM, marginTop: 8 }}>
        <span>hash-locked liquidity</span>
        <span style={{ color: POOL }}>SHA-256</span>
      </div>
    </div>
  );
}

/** A leaderboard of launches; the top performers get the support. */
function TopTokensDiagram() {
  const bars = [92, 74, 61, 45, 33, 24];
  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 110 }}>
        {bars.map((h, i) => (
          <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
            <div style={{ width: "100%", height: h, background: i < 3 ? AMBER : SURFACE, border: `1px solid ${i < 3 ? AMBER : LINE_STRONG}`, opacity: i < 3 ? 1 - i * 0.18 : 1 }} />
          </div>
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontFamily: MONO, fontSize: 13, color: DIM, marginTop: 8 }}>
        <span>launched on pqc.market</span>
        <span style={{ color: AMBER }}>top performers</span>
      </div>
    </div>
  );
}

function Revenue({ scene }: { scene?: boolean }) {
  // Right-hand diagram geometry (frame pixels).
  const left = 700;
  const width = 1600 - 96 - left;
  const gap = 18;
  const cardW = (width - gap * 2) / 3;
  const cardTop = 330;
  const centers = [0, 1, 2].map((i) => left + i * (cardW + gap) + cardW / 2);
  const srcX = left + width / 2;
  const srcBottom = 256;

  return (
    <Frame w={1600} h={900} plain={scene}>
      {scene && (
        <>
          <Scene w={1600} h={900} scale={1.15} x={0.1} y={0.4} />
          <Shade style={{ background: "linear-gradient(90deg, rgba(18,17,16,0.5) 0%, rgba(18,17,16,0.88) 30%, rgba(18,17,16,0.97) 46%, rgba(18,17,16,0.97) 100%)" }} />
          <Shade style={{ background: "linear-gradient(180deg, rgba(18,17,16,0.6) 0%, rgba(18,17,16,0) 22%, rgba(18,17,16,0) 72%, rgba(18,17,16,0.85) 100%)" }} />
        </>
      )}
      <TopBar pad={96} right="revenue · buybacks live" />

      <div style={{ position: "absolute", left: 96, top: 236, width: 560 }}>
        <Mono size={18} color={GREEN} style={{ letterSpacing: 3 }}>
          ● BUYBACKS ARE LIVE
        </Mono>
        <Headline size={78} style={{ marginTop: 22 }}>
          Revenue,
          <br />
          put to <Accent>work</Accent>.
        </Headline>
        <div style={{ marginTop: 26, fontFamily: MONO, fontSize: 20, lineHeight: 1.7, color: scene ? "#cfc8c0" : MUTED }}>
          <div>
            <span style={{ color: GREEN }}>60%</span> buy back &amp; burn $PQC
          </div>
          <div>
            <span style={{ color: POOL }}>20%</span> quantum-resistant pools
          </div>
          <div>
            <span style={{ color: AMBER }}>20%</span> top performing tokens
          </div>
        </div>
      </div>

      {/* Source node */}
      <div
        style={{
          position: "absolute",
          left: srcX - 150,
          top: 190,
          width: 300,
          height: srcBottom - 190,
          border: `1px solid ${LINE_STRONG}`,
          background: TERM,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
          fontFamily: MONO,
          fontSize: 18,
          color: FG,
        }}
      >
        <span style={{ width: 8, height: 8, background: GREEN, borderRadius: "50%", display: "inline-block" }} />
        protocol revenue
      </div>

      {/* Connectors */}
      <svg width={1600} height={900} style={{ position: "absolute", left: 0, top: 0, pointerEvents: "none" }}>
        {centers.map((cx, i) => {
          const color = [GREEN, POOL, AMBER][i];
          const midY = (srcBottom + cardTop) / 2;
          return (
            <g key={i}>
              <path d={`M${srcX},${srcBottom} L${srcX},${midY} L${cx},${midY} L${cx},${cardTop}`} fill="none" stroke={color} strokeWidth={i === 0 ? 3 : 1.5} strokeOpacity={0.85} />
              <circle cx={cx} cy={cardTop} r={4} fill={color} />
            </g>
          );
        })}
        <circle cx={srcX} cy={srcBottom} r={4} fill={FG} />
      </svg>

      {/* Allocation cards */}
      <div style={{ position: "absolute", left, top: cardTop, width, height: 360, display: "grid", gridTemplateColumns: `repeat(3, ${cardW}px)`, gap }}>
        <Card pct="60%" color={GREEN} title="Buyback & burn $PQC" tag="LIVE">
          <BurnDiagram />
        </Card>
        <Card pct="20%" color={POOL} title="Quantum-resistant pools" tag="SOON">
          <PoolDiagram />
        </Card>
        <Card pct="20%" color={AMBER} title="Top performing tokens">
          <TopTokensDiagram />
        </Card>
      </div>

      {/* Allocation bar */}
      <div style={{ position: "absolute", left, top: cardTop + 360 + 34, width }}>
        <div style={{ display: "flex", height: 10, border: `1px solid ${LINE}` }}>
          <div style={{ width: "60%", background: GREEN }} />
          <div style={{ width: "20%", background: POOL }} />
          <div style={{ width: "20%", background: AMBER }} />
        </div>
        <div style={{ display: "flex", fontFamily: MONO, fontSize: 13, color: DIM, marginTop: 8 }}>
          <span style={{ width: "60%" }}>burned forever</span>
          <span style={{ width: "20%" }}>liquidity</span>
          <span style={{ width: "20%" }}>ecosystem</span>
        </div>
      </div>
    </Frame>
  );
}

export const RevenueScene = () => <Revenue scene />;
export const RevenueTweet = () => <Revenue />;
