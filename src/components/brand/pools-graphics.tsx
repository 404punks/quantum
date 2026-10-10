"use client";

import { useEffect, useState } from "react";
import { DIM, DigestCells, FG, Frame, GREEN, LINE, LINE_STRONG, MUTED, SURFACE, TopBar, useSample } from "./graphics";
import { MONO, SANS } from "./fonts";
import { Scene, Shade } from "./scene-graphics";

/**
 * Post-quantum pools teaser: deposit SOL or SPL tokens → a program-owned pool
 * that earns yield → withdrawals need a hash-based signature verified on-chain.
 * Real token logos come through our image proxy (/api/quotes?proxy=1) so the
 * PNG export includes them. Deliberately light on detail (still in testing).
 */

const POOL = "#c9a8ff";
const CARD = "rgba(13,12,11,0.95)";

type Quote = { symbol: string; image: string | null };

function useLogos() {
  const [logos, setLogos] = useState<Record<string, string>>({});
  useEffect(() => {
    let cancelled = false;
    fetch("/api/quotes?proxy=1")
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        const out: Record<string, string> = {};
        for (const q of (j.quotes ?? []) as Quote[]) if (q.image) out[q.symbol.trim().toLowerCase()] = q.image;
        setLogos(out);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  return logos;
}

function Logo({ src, label, size, ring = LINE_STRONG }: { src?: string; label: string; size: number; ring?: string }) {
  const style = { width: size, height: size, borderRadius: "50%", border: `2px solid ${ring}`, background: SURFACE, flexShrink: 0, boxShadow: "0 8px 24px -10px rgba(0,0,0,0.8)" } as const;
  if (src) return <img src={src} alt="" style={{ ...style, objectFit: "cover" }} />;
  return (
    <div style={{ ...style, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: MONO, fontSize: size * 0.3, color: MUTED }}>{label}</div>
  );
}

function Pools({ scene }: { scene?: boolean }) {
  const sample = useSample();
  const logos = useLogos();
  const sol = logos["sol"];
  const tokens = [
    { k: "sol", label: "SOL" },
    { k: "usdc", label: "USDC" },
    { k: "pqc", label: "PQC" },
    { k: "nvdax", label: "NVDA" },
  ];

  // Geometry (frame pixels).
  const cardW = 330;
  const cardH = 250;
  const leftX = 96;
  const rightX = 1600 - 96 - cardW;
  const midY = 520;
  const cx = 800;
  const r = 132;
  const orbit = r + 46;
  const orbiters = tokens.map((t, i) => {
    const a = (-90 + i * 90 + 45) * (Math.PI / 180);
    return { ...t, x: cx + orbit * Math.cos(a), y: midY + orbit * Math.sin(a) };
  });

  return (
    <Frame w={1600} h={900} plain={scene}>
      {scene && (
        <>
          <Scene w={1600} h={900} scale={1.15} x={0.5} y={0.25} />
          <Shade style={{ background: "linear-gradient(180deg, rgba(18,17,16,0.6) 0%, rgba(18,17,16,0.86) 26%, rgba(18,17,16,0.95) 42%, rgba(18,17,16,0.96) 100%)" }} />
        </>
      )}
      <TopBar pad={96} right="coming soon" />

      <div style={{ position: "absolute", left: 96, top: 168 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, fontFamily: MONO, fontSize: 17, letterSpacing: 3, color: POOL }}>
          <span style={{ width: 9, height: 9, borderRadius: "50%", background: POOL, display: "inline-block" }} />
          COMING SOON
        </div>
        <div style={{ marginTop: 12, fontFamily: SANS, fontWeight: 700, fontSize: 60, color: FG, letterSpacing: -1.5 }}>Post-quantum pools</div>
      </div>

      {/* Flow lines, rings, glow */}
      <svg width={1600} height={900} style={{ position: "absolute", left: 0, top: 0, pointerEvents: "none" }}>
        <defs>
          <linearGradient id="flow-in" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor={GREEN} stopOpacity="0.15" />
            <stop offset="100%" stopColor={POOL} stopOpacity="0.9" />
          </linearGradient>
          <linearGradient id="flow-out" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor={POOL} stopOpacity="0.9" />
            <stop offset="100%" stopColor={GREEN} stopOpacity="0.5" />
          </linearGradient>
          <radialGradient id="pool-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={POOL} stopOpacity="0.22" />
            <stop offset="60%" stopColor={POOL} stopOpacity="0.06" />
            <stop offset="100%" stopColor={POOL} stopOpacity="0" />
          </radialGradient>
          <radialGradient id="pool-core" cx="50%" cy="38%" r="70%">
            <stop offset="0%" stopColor="#2a2238" />
            <stop offset="100%" stopColor="#0d0c0b" />
          </radialGradient>
        </defs>

        {/* Flow in / out with travelling dots */}
        <line x1={leftX + cardW} y1={midY} x2={cx - orbit - 4} y2={midY} stroke="url(#flow-in)" strokeWidth={3} />
        <line x1={cx + orbit + 4} y1={midY} x2={rightX} y2={midY} stroke="url(#flow-out)" strokeWidth={3} />
        {[0.28, 0.55, 0.82].map((f) => (
          <circle key={`i${f}`} cx={leftX + cardW + (cx - orbit - leftX - cardW) * f} cy={midY} r={4.5} fill={POOL} opacity={0.35 + f * 0.6} />
        ))}
        {[0.2, 0.47, 0.74].map((f) => (
          <circle key={`o${f}`} cx={cx + orbit + (rightX - cx - orbit) * f} cy={midY} r={4.5} fill={GREEN} opacity={0.95 - f * 0.6} />
        ))}

        {/* Pool */}
        <circle cx={cx} cy={midY} r={orbit + 70} fill="url(#pool-glow)" />
        <circle cx={cx} cy={midY} r={orbit} fill="none" stroke={POOL} strokeOpacity={0.3} strokeWidth={1.5} strokeDasharray="2 8" />
        <circle cx={cx} cy={midY} r={r} fill="url(#pool-core)" stroke={POOL} strokeWidth={2} />
        <circle cx={cx} cy={midY} r={r - 16} fill="none" stroke={POOL} strokeOpacity={0.18} />

        {/* Lock */}
        <rect x={cx - 24} y={midY - 54} width={48} height={38} rx={7} fill={POOL} fillOpacity={0.12} stroke={POOL} strokeWidth={3} />
        <path d={`M${cx - 14},${midY - 54} v-11 a14,14 0 0 1 28,0 v11`} fill="none" stroke={POOL} strokeWidth={3} />
        <circle cx={cx} cy={midY - 37} r={4.5} fill={POOL} />
      </svg>

      {/* Orbiting tokens */}
      {orbiters.map((o) => (
        <div key={o.k} style={{ position: "absolute", left: o.x - 25, top: o.y - 25 }}>
          <Logo src={logos[o.k]} label={o.label} size={50} ring={POOL} />
        </div>
      ))}

      {/* Pool label */}
      <div style={{ position: "absolute", left: cx - 110, top: midY - 2, width: 220, textAlign: "center" }}>
        <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 28, color: FG, letterSpacing: -0.5 }}>PQ pool</div>
        <div style={{ marginTop: 9, display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(63,185,80,0.12)", color: GREEN, borderRadius: 999, padding: "4px 13px", fontFamily: MONO, fontSize: 14 }}>
          ↑ earns yield
        </div>
      </div>

      {/* Deposit */}
      <div style={{ position: "absolute", left: leftX, top: midY - cardH / 2, width: cardW, height: cardH, border: `1px solid ${LINE_STRONG}`, background: CARD, borderRadius: 18, padding: "24px 26px" }}>
        <div style={{ fontFamily: MONO, fontSize: 13, letterSpacing: 2.5, color: DIM }}>01 · DEPOSIT</div>
        <div style={{ marginTop: 26, display: "flex", justifyContent: "center" }}>
          {tokens.map((t, i) => (
            <div key={t.k} style={{ marginLeft: i ? -18 : 0, zIndex: tokens.length - i }}>
              <Logo src={logos[t.k]} label={t.label} size={68} ring={i === 0 ? GREEN : LINE_STRONG} />
            </div>
          ))}
        </div>
        <div style={{ marginTop: 26, textAlign: "center", fontFamily: SANS, fontSize: 19, color: FG }}>SOL or any SPL token</div>
      </div>

      {/* Withdraw */}
      <div style={{ position: "absolute", left: rightX, top: midY - cardH / 2, width: cardW, height: cardH, border: `1px solid ${LINE_STRONG}`, background: CARD, borderRadius: 18, padding: "24px 26px" }}>
        <div style={{ fontFamily: MONO, fontSize: 13, letterSpacing: 2.5, color: DIM }}>03 · WITHDRAW</div>
        <div style={{ marginTop: 18, padding: "12px 14px", border: `1px solid ${LINE}`, borderRadius: 12, background: "#121110" }}>
          <DigestCells digits={sample.digits} cell={6} gap={2} cols={34} />
        </div>
        <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ width: 28, height: 28, borderRadius: "50%", background: "rgba(63,185,80,0.14)", color: GREEN, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15 }}>✓</span>
          <span style={{ fontFamily: SANS, fontSize: 18, color: FG }}>hash-based signature</span>
        </div>
        <div style={{ marginTop: 8, marginLeft: 38, fontFamily: MONO, fontSize: 13, color: GREEN }}>verified on-chain</div>
      </div>

      {/* Step 2 tag above the pool */}
      <div style={{ position: "absolute", left: cx - 100, top: midY - orbit - 62, width: 200, textAlign: "center", fontFamily: MONO, fontSize: 13, letterSpacing: 2.5, color: DIM }}>02 · HOLD</div>

      <div style={{ position: "absolute", left: 0, right: 0, bottom: 54, display: "flex", justifyContent: "center", alignItems: "center", gap: 10, fontFamily: MONO, fontSize: 16, color: DIM }}>
        {sol && <img src={sol} alt="" style={{ width: 18, height: 18, borderRadius: "50%" }} />}
        like a shielded pool, built for quantum security, not privacy
      </div>
    </Frame>
  );
}

export const PoolsScene = () => <Pools scene />;
export const PoolsTweet = () => <Pools />;
