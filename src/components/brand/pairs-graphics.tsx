"use client";

import { useEffect, useState } from "react";
import { Accent, AMBER, Body, DIM, FG, Frame, GREEN, Headline, LINE, LINE_STRONG, MUTED, Mono, Stat, SURFACE, TERM, TopBar } from "./graphics";
import { MONO } from "./fonts";
import { Scene, Shade } from "./scene-graphics";

/**
 * Custom pairs announcement: launch on pump.fun paired with tokenized stocks,
 * majors or memecoins, paying in SOL. Logos load through our own image proxy
 * (/api/quotes?proxy=1) so the PNG export can include them.
 */

type Quote = { symbol: string; name: string; image: string | null };

const STOCKS = ["NVDAx", "TSLAx", "AAPLx", "SPYx", "SPCX", "METAx", "GOOGLx", "MSTRx"];
const MEMES = ["Bonk", "$WIF", "PENGU", "Fartcoin", "TRUMP", "MOODENG", "Pnut", "PQC"];
const LABEL: Record<string, string> = { Bonk: "BONK", $WIF: "WIF", Pnut: "PNUT", SPCX: "SpaceX", SPYx: "S&P 500" };

const norm = (s: string) => s.trim().toLowerCase();

function useQuotes() {
  const [quotes, setQuotes] = useState<Map<string, Quote>>(new Map());
  useEffect(() => {
    let cancelled = false;
    fetch("/api/quotes?proxy=1")
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        setQuotes(new Map((j.quotes ?? []).map((q: Quote) => [norm(q.symbol), q])));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  return quotes;
}

function Logo({ q, size, ring }: { q?: Quote; size: number; ring?: string }) {
  const style = { width: size, height: size, borderRadius: "50%", border: `2px solid ${ring ?? LINE_STRONG}`, background: SURFACE, flexShrink: 0 } as const;
  if (q?.image) return <img src={q.image} alt="" style={{ ...style, objectFit: "cover" }} />;
  return (
    <div style={{ ...style, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: MONO, fontSize: size * 0.34, color: DIM }}>
      {(q?.symbol ?? "?").replace(/[^A-Za-z0-9]/g, "").slice(0, 2)}
    </div>
  );
}

function Chip({ q, symbol }: { q?: Quote; symbol: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", border: `1px solid ${LINE_STRONG}`, background: "rgba(11,10,10,0.92)", minWidth: 0 }}>
      <Logo q={q} size={30} />
      <span style={{ fontFamily: MONO, fontSize: 16, color: FG, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{LABEL[symbol] ?? symbol}</span>
    </div>
  );
}

function Row({ title, symbols, quotes }: { title: string; symbols: string[]; quotes: Map<string, Quote> }) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", fontFamily: MONO, fontSize: 14, color: DIM, marginBottom: 10 }}>
        <span>{title}</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 8 }}>
        {symbols.map((s) => (
          <Chip key={s} symbol={s} q={quotes.get(norm(s))} />
        ))}
      </div>
    </div>
  );
}

function Pairs({ scene }: { scene?: boolean }) {
  const quotes = useQuotes();
  const nvda = quotes.get(norm("NVDAx"));
  const sol = quotes.get("sol");
  const count = quotes.size;

  return (
    <Frame w={1600} h={900} plain={scene}>
      {scene && (
        <>
          <Scene w={1600} h={900} scale={1.15} x={0.15} y={0.4} />
          <Shade style={{ background: "linear-gradient(90deg, rgba(18,17,16,0.55) 0%, rgba(18,17,16,0.9) 34%, rgba(18,17,16,0.97) 54%, rgba(18,17,16,0.97) 100%)" }} />
          <Shade style={{ background: "linear-gradient(180deg, rgba(18,17,16,0.6) 0%, rgba(18,17,16,0) 22%, rgba(18,17,16,0) 72%, rgba(18,17,16,0.85) 100%)" }} />
        </>
      )}
      <TopBar pad={96} right="new · quantum pairs" />

      <div style={{ position: "absolute", left: 96, top: 196, width: 640 }}>
        <Mono size={18} color={GREEN} style={{ letterSpacing: 3 }}>
          ● QUANTUM LAUNCHES × CUSTOM PAIRS
        </Mono>
        <Headline size={80} style={{ marginTop: 22 }}>
          Quantum coins,
          <br />
          paired with
          <br />
          <Accent>anything</Accent>.
        </Headline>
        <Body size={24} style={{ marginTop: 24, maxWidth: 520, color: scene ? "#cfc8c0" : undefined }}>
          Stocks, majors or any memecoin. Dev buy locked in a quantum vault.
        </Body>
        <div style={{ marginTop: 40, display: "flex", gap: 52 }}>
          <Stat label="pairs" value={count > 1 ? `${count}+` : "200+"} />
          <Stat label="signature" value="WOTS" />
          <Stat label="dev funds" value="vaulted" />
        </div>
      </div>

      <div style={{ position: "absolute", right: 96, top: 176, width: 660, display: "flex", flexDirection: "column", gap: 22 }}>
        {/* Hero pair card */}
        <div style={{ border: `1px solid ${LINE_STRONG}`, background: TERM, boxShadow: "0 30px 80px -30px rgba(0,0,0,0.85)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", background: SURFACE, borderBottom: `1px solid ${LINE_STRONG}`, padding: "10px 18px", fontFamily: MONO, fontSize: 15, color: DIM }}>
            <span>pqc@bunker: ~/launch</span>
            <span>quantum launch</span>
          </div>
          <div style={{ padding: "22px 24px", display: "flex", alignItems: "center", gap: 22 }}>
            <div style={{ position: "relative", width: 104, height: 64, flexShrink: 0 }}>
              <div style={{ position: "absolute", left: 0, top: 0 }}>
                <img src="/logo-mark.png" alt="" style={{ width: 64, height: 64, borderRadius: "50%", border: `2px solid ${LINE_STRONG}`, background: SURFACE }} />
              </div>
              <div style={{ position: "absolute", left: 40, top: 0 }}>
                <Logo q={nvda} size={64} ring={GREEN} />
              </div>
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: MONO, fontSize: 34, color: FG, lineHeight: 1.1 }}>
                $BUNKER <span style={{ color: DIM }}>/</span> <span style={{ color: GREEN }}>NVDAx</span>
              </div>
              <div style={{ marginTop: 6, fontFamily: MONO, fontSize: 15, color: MUTED }}>WOTS-signed · dev buy locked in a quantum vault</div>
            </div>
          </div>
          <div style={{ borderTop: `1px dashed ${LINE}`, padding: "14px 24px 18px", display: "flex", alignItems: "center", gap: 12, fontFamily: MONO, fontSize: 15, color: MUTED }}>
            <Logo q={sol} size={22} />
            <span style={{ color: FG }}>SOL</span>
            <span style={{ color: DIM }}>→</span>
            <span>Jupiter</span>
            <span style={{ color: DIM }}>→</span>
            <Logo q={nvda} size={22} />
            <span style={{ color: FG }}>NVDAx</span>
            <span style={{ color: DIM }}>→</span>
            <span style={{ color: FG }}>$BUNKER</span>
            <span style={{ color: DIM }}>→</span>
            <span style={{ color: GREEN }}>vault</span>
            <span style={{ marginLeft: "auto", color: AMBER }}>1 approval</span>
          </div>
        </div>

        <Row title="tokenized stocks" symbols={STOCKS} quotes={quotes} />
        <Row title="memecoins · or paste any pump.fun coin" symbols={MEMES} quotes={quotes} />
      </div>
    </Frame>
  );
}

export const PairsTweet = () => <Pairs />;
export const PairsScene = () => <Pairs scene />;

