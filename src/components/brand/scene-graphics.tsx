"use client";

import {
  Accent,
  Body,
  ChainRows,
  DIM,
  DigestCells,
  FG,
  Frame,
  GREEN,
  Headline,
  LINE_STRONG,
  MUTED,
  Mono,
  Ok,
  Prompt,
  Stat,
  Terminal,
  TopBar,
  Wordmark,
  useSample,
} from "./graphics";

/**
 * The bunker artwork set. Same type system and terminal windows as the rest of
 * the kit, laid over the painted scene with gradients so copy stays legible.
 */

/** Full-bleed scene. `scale`/`x`/`y` position the painting explicitly so the hatch lands where we want it. */
export function Scene({ w, h, scale = 1, x = 0.5, y = 0.5, free }: { w: number; h: number; scale?: number; x?: number; y?: number; free?: { width: number; left: number; top: number } }) {
  const iw = 1672;
  const ih = 941;
  if (free) {
    // Explicit placement (not cover): lets the hatch sit in a band the cover crop could never reach.
    return <img src="/bg-asset.png" alt="" style={{ position: "absolute", width: free.width, height: (free.width * ih) / iw, left: free.left, top: free.top, maxWidth: "none" }} />;
  }
  const cover = Math.max(w / iw, h / ih) * scale;
  const dw = iw * cover;
  const dh = ih * cover;
  return (
    <img
      src="/bg-asset.png"
      alt=""
      style={{ position: "absolute", width: dw, height: dh, left: -(dw - w) * x, top: -(dh - h) * y, maxWidth: "none" }}
    />
  );
}

export function Shade({ style }: { style: React.CSSProperties }) {
  return <div style={{ position: "absolute", inset: 0, pointerEvents: "none", ...style }} />;
}

export function SceneIntro() {
  return (
    <Frame w={1600} h={900} plain>
      <Scene w={1600} h={900} scale={1.22} x={0} y={0.45} />
      <Shade style={{ background: "linear-gradient(90deg, rgba(18,17,16,0.96) 0%, rgba(18,17,16,0.92) 36%, rgba(18,17,16,0.72) 56%, rgba(18,17,16,0.12) 84%)" }} />
      <Shade style={{ background: "linear-gradient(180deg, rgba(18,17,16,0.55) 0%, rgba(18,17,16,0) 25%, rgba(18,17,16,0) 70%, rgba(18,17,16,0.7) 100%)" }} />
      <TopBar pad={96} />
      <div style={{ position: "absolute", left: 96, top: 236, width: 820 }}>
        <Mono size={18} color={GREEN} style={{ letterSpacing: 3 }}>
          ● NOW LIVE ON PUMP.FUN
        </Mono>
        <Headline size={84} style={{ marginTop: 26 }}>
          Launch coins that
          <br />
          survive <Accent>Q-day</Accent>.
        </Headline>
        <Body size={25} style={{ marginTop: 32, maxWidth: 600, color: "#cfc8c0" }}>
          Every coin is signed by a one-time, hash-based key derived from your wallet. Provenance that outlives ECDSA.
        </Body>
        <div style={{ marginTop: 52, display: "flex", gap: 56 }}>
          <Stat label="signature" value="2,404 B" />
          <Stat label="keys / identity" value="256" />
          <Stat label="assumption" value="SHA-256" />
        </div>
      </div>
    </Frame>
  );
}

export function SceneBunkerMode() {
  return (
    <Frame w={1600} h={900} plain>
      <Scene w={1600} h={900} scale={1.16} x={0.5} y={0} />
      <Shade style={{ background: "linear-gradient(180deg, rgba(18,17,16,0.92) 0%, rgba(18,17,16,0.6) 22%, rgba(18,17,16,0) 45%, rgba(18,17,16,0) 72%, rgba(18,17,16,0.96) 100%)" }} />
      <TopBar pad={96} right="status: armed" />
      <div style={{ position: "absolute", left: 0, right: 0, top: 150, display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
        <Headline size={110}>
          Bunker mode is <Accent>live</Accent>.
        </Headline>
        <Body size={26} style={{ marginTop: 22, color: "#d8d2ca" }}>
          Every coin signed with keys a quantum computer can&apos;t fake.
        </Body>
      </div>
      <div
        style={{
          position: "absolute",
          left: 96,
          right: 96,
          bottom: 64,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontFamily: "'PQC Mono', monospace",
          fontSize: 18,
          borderTop: `1px solid ${LINE_STRONG}`,
          paddingTop: 22,
        }}
      >
        <Ok>256 one-time keys derived</Ok>
        <Ok>root anchored on solana</Ok>
        <Ok>attestation signed · leaf #7</Ok>
        <Ok>coin live on pump.fun</Ok>
      </div>
    </Frame>
  );
}

export function SceneProof() {
  const s = useSample();
  return (
    <Frame w={1600} h={900} plain>
      <Scene w={1600} h={900} scale={1.1} x={0.2} y={0.5} />
      <Shade style={{ background: "linear-gradient(270deg, rgba(18,17,16,0.97) 0%, rgba(18,17,16,0.92) 40%, rgba(18,17,16,0.5) 62%, rgba(18,17,16,0.1) 85%)" }} />
      <Shade style={{ background: "linear-gradient(180deg, rgba(18,17,16,0.5) 0%, rgba(18,17,16,0) 25%, rgba(18,17,16,0) 75%, rgba(18,17,16,0.6) 100%)" }} />
      <TopBar pad={96} />
      <div style={{ position: "absolute", left: 96, top: 250, width: 560 }}>
        <Mono size={18} color={GREEN} style={{ letterSpacing: 3 }}>
          [ OK ] VERIFIED
        </Mono>
        <Headline size={80} style={{ marginTop: 26 }}>
          The proof is just <Accent>hashing</Accent>.
        </Headline>
        <Body size={24} style={{ marginTop: 28, color: "#cfc8c0" }}>
          Anyone can check a launch in their browser with nothing but SHA-256.
        </Body>
      </div>
      <Terminal title="pqc@bunker: ~/verify" meta="leaf #7" width={700} style={{ position: "absolute", right: 96, top: 200 }}>
        <Prompt>wots verify --leaf 7</Prompt>
        <div style={{ marginTop: 12 }}>
          <ChainRows rows={s.chains} digits={s.digits} size={17} />
          <div style={{ color: DIM, fontSize: 17 }}>&nbsp;&nbsp;… 61 more chains</div>
        </div>
        <div style={{ marginTop: 12, borderTop: `1px dashed ${LINE_STRONG}`, paddingTop: 12, fontSize: 16 }}>
          <div>
            <span style={{ color: DIM }}>root </span>
            <span style={{ color: GREEN }}>0x{s.root.slice(0, 34)}…</span>
          </div>
        </div>
        <div style={{ marginTop: 10 }}>
          <Ok>signature verified · sha-256 only</Ok>
        </div>
      </Terminal>
    </Frame>
  );
}

export function SceneSquare() {
  const s = useSample();
  return (
    <Frame w={1080} h={1080} plain>
      <Scene w={1080} h={1080} scale={1.0} x={0.5} y={0.42} />
      <Shade style={{ background: "linear-gradient(180deg, rgba(18,17,16,0.95) 0%, rgba(18,17,16,0.75) 30%, rgba(18,17,16,0.1) 50%, rgba(18,17,16,0.2) 62%, rgba(18,17,16,0.97) 78%)" }} />
      <div style={{ position: "absolute", left: 80, top: 70 }}>
        <Wordmark size={28} />
      </div>
      <div style={{ position: "absolute", left: 80, right: 80, top: 180 }}>
        <Headline size={72}>
          Every coin carries a <Accent>quantum fingerprint</Accent>.
        </Headline>
      </div>
      <Terminal title="attestation digest" meta="leaf #7" style={{ position: "absolute", left: 80, right: 80, top: 760 }}>
        <DigestCells digits={s.digits} cell={22} gap={4} />
        <div style={{ marginTop: 16, fontSize: 15, color: DIM }}>0x{s.msg}</div>
      </Terminal>
    </Frame>
  );
}

export function ScenePortrait() {
  return (
    <Frame w={1080} h={1350} plain>
      <Scene w={1080} h={1350} scale={1.0} x={0.5} y={0.35} />
      <Shade style={{ background: "linear-gradient(180deg, rgba(18,17,16,0.96) 0%, rgba(18,17,16,0.8) 26%, rgba(18,17,16,0.05) 48%, rgba(18,17,16,0.1) 64%, rgba(18,17,16,0.98) 80%)" }} />
      <div style={{ position: "absolute", left: 80, top: 80 }}>
        <Wordmark size={28} />
      </div>
      <div style={{ position: "absolute", left: 80, right: 80, top: 190 }}>
        <Headline size={84}>
          Seal your coins in the <Accent>bunker</Accent>.
        </Headline>
        <Body size={24} style={{ marginTop: 22, color: "#cfc8c0" }}>
          Hash-based identity. One-time keys. Eight post-quantum schemes. Live on pump.fun.
        </Body>
      </div>
      <Terminal title="pqc@bunker: ~" meta="session sealed" style={{ position: "absolute", left: 80, right: 80, top: 1010 }}>
        <Prompt>pqc bunker --enable</Prompt>
        <div style={{ marginTop: 8, fontSize: 17 }}>
          <Ok>identity registered · pq1Hn3…W8k</Ok>
          <Ok>root anchored on solana</Ok>
          <Ok>coin live on pump.fun · leaf #7</Ok>
        </div>
      </Terminal>
    </Frame>
  );
}

export function SceneHeader() {
  const s = useSample();
  return (
    <Frame w={1500} h={500} plain>
      <Scene w={1500} h={500} scale={1.3} x={1} y={0.55} />
      <Shade style={{ background: "linear-gradient(90deg, rgba(18,17,16,0.1) 0%, rgba(18,17,16,0.05) 38%, rgba(18,17,16,0.8) 62%, rgba(18,17,16,0.97) 100%)" }} />
      <div style={{ position: "absolute", right: 80, top: 0, bottom: 0, width: 620, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "flex-end", textAlign: "right" }}>
        <Headline size={58}>
          Launch coins that survive <Accent>Q-day</Accent>.
        </Headline>
        <Mono size={19} color={MUTED} style={{ marginTop: 20 }}>
          pqc.market · post-quantum launchpad on pump.fun
        </Mono>
        <div style={{ marginTop: 26 }}>
          <DigestCells digits={s.digits} cell={11} gap={3} />
        </div>
      </div>
    </Frame>
  );
}

export function SceneAvatar() {
  return (
    <Frame w={400} h={400} plain>
      <Scene w={400} h={400} scale={1.9} x={0.5} y={0.5} />
      <Shade style={{ background: "radial-gradient(circle at 50% 50%, rgba(18,17,16,0) 40%, rgba(18,17,16,0.85) 100%)" }} />
      <Shade style={{ boxShadow: `inset 0 0 0 2px ${LINE_STRONG}` }} />
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 26, textAlign: "center", fontFamily: "'PQC Serif', serif", fontWeight: 700, fontSize: 30, color: FG, textShadow: "0 2px 14px rgba(0,0,0,0.9)" }}>
        pqc.market
      </div>
    </Frame>
  );
}
