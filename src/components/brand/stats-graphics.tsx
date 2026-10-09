"use client";

import { useEffect, useState } from "react";
import { AMBER, FG, Frame, GREEN, MUTED, TopBar } from "./graphics";
import { MONO, SANS } from "./fonts";
import { Scene, Shade } from "./scene-graphics";

/**
 * 24-hour recap: live stats from /api/stats, so every export shows current
 * figures. Three headline numbers, three supporting ones, no rules or boxes.
 */

type Stats = {
  launches24h: number;
  quantum: number;
  graduated: number;
  identities: number;
  marketCap: number;
  volume24h: number;
};

const POOL = "#c9a8ff";

const compactUsd = (n: number) =>
  n >= 1e9 ? `$${(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `$${(n / 1e6).toFixed(n >= 1e7 ? 1 : 2)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(1)}K` : `$${Math.round(n)}`;
const int = (n: number) => n.toLocaleString("en-US");

function useStats() {
  const [stats, setStats] = useState<Stats | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/stats")
      .then((r) => r.json())
      .then((j) => !cancelled && !j.error && setStats(j))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  return stats;
}

function Dot({ color }: { color: string }) {
  return <span style={{ width: 9, height: 9, borderRadius: "50%", background: color, display: "inline-block", flexShrink: 0 }} />;
}

function Hero({ value, label, color }: { value: string; label: string; color: string }) {
  return (
    <div>
      <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 78, lineHeight: 1, color: FG, letterSpacing: -2 }}>{value}</div>
      <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 10, fontFamily: MONO, fontSize: 18, color: MUTED }}>
        <Dot color={color} />
        {label}
      </div>
    </div>
  );
}

function Card({ value, label }: { value: string; label: string }) {
  return (
    <div style={{ background: "rgba(255,255,255,0.035)", borderRadius: 14, padding: "24px 28px" }}>
      <div style={{ fontFamily: SANS, fontWeight: 600, fontSize: 40, lineHeight: 1, color: FG, letterSpacing: -1 }}>{value}</div>
      <div style={{ marginTop: 10, fontFamily: MONO, fontSize: 16, color: MUTED }}>{label}</div>
    </div>
  );
}

function Recap({ scene }: { scene?: boolean }) {
  const s = useStats();
  const v = (f: (x: Stats) => string) => (s ? f(s) : "…");
  const date = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  return (
    <Frame w={1600} h={900} plain={scene}>
      {scene && (
        <>
          <Scene w={1600} h={900} scale={1.15} x={0.85} y={0.3} />
          <Shade style={{ background: "linear-gradient(180deg, rgba(18,17,16,0.7) 0%, rgba(18,17,16,0.88) 30%, rgba(18,17,16,0.96) 48%, rgba(18,17,16,0.97) 100%)" }} />
        </>
      )}
      <TopBar pad={96} right={date} />

      <div style={{ position: "absolute", left: 96, right: 96, top: 290, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 48 }}>
        <Hero value={v((x) => compactUsd(x.volume24h))} label="volume" color={GREEN} />
        <Hero value={v((x) => int(x.launches24h))} label="coins launched" color={POOL} />
        <Hero value={v((x) => compactUsd(x.marketCap))} label="market cap" color={AMBER} />
      </div>

      <div style={{ position: "absolute", left: 96, right: 96, top: 540, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20 }}>
        <Card value={v((x) => int(x.quantum))} label="quantum launches" />
        <Card value={v((x) => int(x.identities))} label="PQ identities" />
        <Card value={v((x) => int(x.graduated))} label="graduated" />
      </div>
    </Frame>
  );
}

export const NumbersScene = () => <Recap scene />;
export const NumbersTweet = () => <Recap />;
