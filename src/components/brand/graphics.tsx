"use client";

import { useMemo, type CSSProperties, type ReactNode } from "react";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";
import { AddrType, W, address, digits, leafHash, secretElement, thash } from "@/lib/pq/wots";
import { nodeHash } from "@/lib/pq/xmss";
import { launchDigest } from "@/lib/pq/messages";
import { MONO, SANS, SERIF } from "./fonts";
import { AllSchemesTweet, MoreSchemesTweet, SceneAllSchemesTweet, SchemesTweet } from "./schemes-graphic";
import { WalletsFingerprintScene, WalletsFingerprintTweet, WalletsLaunchScene, WalletsLaunchTweet } from "./wallet-graphics";
import { VaultAuthScene, VaultBreakdownScene } from "./vault-graphics";
import { SceneAvatar, SceneBunkerMode, SceneHeader, SceneIntro, ScenePortrait, SceneProof, SceneSquare } from "./scene-graphics";

/**
 * Brand graphics in the site's own visual language: serif headline with an
 * italic green accent, Geist body, Geist Mono terminal windows, square
 * borders, dark grain. Each is a fixed-size DOM tree exported pixel-for-pixel
 * by html-to-image, so inline styles only.
 */


export const BG = "#121110";
export const SURFACE = "#1a1918";
export const TERM = "#0b0a0a";
export const LINE = "#2a2725";
export const LINE_STRONG = "#3a3633";
export const FG = "#f2eee9";
export const MUTED = "#a8a19a";
export const DIM = "#77706a";
export const GREEN = "#3fb950";
export const AMBER = "#e3b341";
export const RED = "#f2555a";

export const NOISE =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.9 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

/* ------------------------------------------------------------------ */
/* Primitives                                                          */
/* ------------------------------------------------------------------ */

export function Frame({ w, h, children, plain }: { w: number; h: number; children: ReactNode; plain?: boolean }) {
  return (
    <div style={{ width: w, height: h, position: "relative", overflow: "hidden", background: BG, color: FG, fontFamily: SANS }}>
      {/* faint engineering grid (omitted when artwork fills the frame) */}
      {!plain && (
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: `linear-gradient(${LINE}55 1px, transparent 1px), linear-gradient(90deg, ${LINE}55 1px, transparent 1px)`,
          backgroundSize: "80px 80px",
          backgroundPosition: "-1px -1px",
        }}
      />
      )}
      {children}
      <div style={{ position: "absolute", inset: 0, backgroundImage: NOISE, opacity: 0.14, mixBlendMode: "overlay", pointerEvents: "none" }} />
    </div>
  );
}

export function Headline({ size, children, style }: { size: number; children: ReactNode; style?: CSSProperties }) {
  return (
    <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: size, lineHeight: 1.08, letterSpacing: -size * 0.02, color: FG, ...style }}>
      {children}
    </div>
  );
}

export function Accent({ children }: { children: ReactNode }) {
  return <span style={{ fontStyle: "italic", color: GREEN, whiteSpace: "nowrap" }}>{children}</span>;
}

export function Body({ size, children, style }: { size: number; children: ReactNode; style?: CSSProperties }) {
  return <div style={{ fontFamily: SANS, fontSize: size, lineHeight: 1.55, color: MUTED, ...style }}>{children}</div>;
}

export function Mono({ size, color = MUTED, children, style }: { size: number; color?: string; children: ReactNode; style?: CSSProperties }) {
  return <div style={{ fontFamily: MONO, fontSize: size, lineHeight: 1.6, color, ...style }}>{children}</div>;
}

/** Logo + serif wordmark, exactly like the navbar. */
export function Wordmark({ size = 30 }: { size?: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: size * 0.42 }}>
      <img src="/logo-mark.png" alt="" style={{ width: size * 1.45, height: size * 1.45 }} />
      <span style={{ fontFamily: SERIF, fontWeight: 700, fontSize: size, letterSpacing: -size * 0.02, color: FG }}>pqc.market</span>
    </div>
  );
}

/** Top bar shared by the large formats. */
export function TopBar({ pad, right = "post-quantum launchpad" }: { pad: number; right?: string }) {
  return (
    <div style={{ position: "absolute", left: pad, right: pad, top: pad * 0.75, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <Wordmark size={30} />
      <Mono size={18} color={DIM}>
        {right}
      </Mono>
    </div>
  );
}

export function Terminal({ title, meta, children, style, width }: { title: string; meta?: string; children: ReactNode; style?: CSSProperties; width?: number }) {
  return (
    <div style={{ width, border: `1px solid ${LINE_STRONG}`, background: TERM, boxShadow: "0 30px 80px -30px rgba(0,0,0,0.8)", fontFamily: MONO, ...style }}>
      <div style={{ display: "flex", justifyContent: "space-between", background: SURFACE, borderBottom: `1px solid ${LINE_STRONG}`, padding: "10px 18px", fontSize: 15, color: DIM }}>
        <span>{title}</span>
        {meta && <span>{meta}</span>}
      </div>
      <div style={{ padding: "22px 24px", fontSize: 18, lineHeight: 1.75, color: MUTED }}>{children}</div>
    </div>
  );
}

export function Prompt({ children }: { children: ReactNode }) {
  return (
    <div>
      <span style={{ color: GREEN }}>pqc@bunker</span>
      <span style={{ color: DIM }}>:~$ </span>
      <span style={{ color: FG }}>{children}</span>
    </div>
  );
}

export function Ok({ children, pending }: { children: ReactNode; pending?: boolean }) {
  return (
    <div>
      <span style={{ color: pending ? AMBER : GREEN }}>{pending ? "[ .. ]" : "[ OK ]"}</span> <span style={{ color: FG }}>{children}</span>
    </div>
  );
}

export function Stat({ label, value, size = 30 }: { label: string; value: string; size?: number }) {
  return (
    <div>
      <Mono size={size * 0.55} color={DIM}>
        {label}
      </Mono>
      <Mono size={size} color={FG} style={{ marginTop: 4 }}>
        {value}
      </Mono>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Deterministic sample data, computed with the real WOTS code.        */
/* ------------------------------------------------------------------ */

export function useSample() {
  return useMemo(() => {
    const sk = sha256(utf8ToBytes("pqc.market/brand/sk"));
    const pub = sha256(utf8ToBytes("pqc.market/brand/pub"));
    const msg = launchDigest({ mint: "pqc", creator: "brand", name: "Bunker", symbol: "BNKR", image: "logo", leaf: 7 });
    const d = digits(msg);
    const chains = Array.from({ length: 6 }, (_, i) => {
      let x = secretElement(sk, 7, i);
      const vals = [bytesToHex(x)];
      for (let s = 0; s < W - 1; s++) {
        x = thash(pub, address(AddrType.Chain, 7, i, s), x);
        vals.push(bytesToHex(x));
      }
      return vals;
    });
    let node = leafHash(sk, pub, 7);
    const leaf = bytesToHex(node);
    for (let h = 0; h < 8; h++) node = nodeHash(pub, h + 1, 0, node, sha256(utf8ToBytes(`sib${h}`)));
    return { msg: bytesToHex(msg), digits: d, chains, leaf, root: bytesToHex(node) };
  }, []);
}

export function ChainRows({ rows, digits: d, size = 18 }: { rows: string[][]; digits: number[]; size?: number }) {
  return (
    <div style={{ fontSize: size }}>
      {rows.map((vals, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 16, whiteSpace: "nowrap" }}>
          <span style={{ color: DIM }}>c{String(i).padStart(2, "0")}</span>
          <span style={{ letterSpacing: size * 0.18 }}>
            {Array.from({ length: W }, (_, k) => (
              <span key={k} style={{ color: k === d[i] ? AMBER : k < d[i] ? "rgba(242,238,233,0.65)" : GREEN }}>
                ■
              </span>
            ))}
          </span>
          <span style={{ marginLeft: "auto", color: GREEN }}>{vals[15].slice(0, 8)} ok</span>
        </div>
      ))}
    </div>
  );
}

export function DigestCells({ digits: d, cell, gap, cols = 34 }: { digits: number[]; cell: number; gap: number; cols?: number }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, ${cell}px)`, gap }}>
      {d.map((v, i) => (
        <div key={i} style={{ width: cell, height: cell, background: i >= 64 ? AMBER : GREEN, opacity: 0.14 + (v / 15) * 0.86 }} />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 1600 × 900                                                          */
/* ------------------------------------------------------------------ */

export function IntroTweet() {
  const s = useSample();
  return (
    <Frame w={1600} h={900}>
      <TopBar pad={96} />
      <div style={{ position: "absolute", left: 96, top: 230, width: 790 }}>
        <Mono size={18} color={GREEN} style={{ letterSpacing: 3 }}>
          ● NOW LIVE ON PUMP.FUN
        </Mono>
        <Headline size={80} style={{ marginTop: 26 }}>
          Launch coins that
          <br />
          survive <Accent>Q-day</Accent>.
        </Headline>
        <Body size={26} style={{ marginTop: 34, maxWidth: 620 }}>
          Every coin is signed by a one-time, hash-based key derived from your wallet. Provenance that outlives ECDSA.
        </Body>
        <div style={{ marginTop: 56, display: "flex", gap: 56 }}>
          <Stat label="signature" value="2,404 B" />
          <Stat label="keys / identity" value="256" />
          <Stat label="assumption" value="SHA-256" />
        </div>
      </div>
      <Terminal title="pqc@bunker: ~/verify" meta="wots-sha256 · w=16" width={600} style={{ position: "absolute", right: 96, top: 210 }}>
        <Prompt>wots verify --live</Prompt>
        <div style={{ marginTop: 14, color: FG }}>
          <span style={{ color: GREEN }}>&gt;</span> # verify &nbsp;pk[i] =? H^(15-d[i])(σ[i])
        </div>
        <div style={{ marginTop: 14 }}>
          <ChainRows rows={s.chains.slice(0, 5)} digits={s.digits} size={17} />
          <div style={{ color: DIM, fontSize: 17 }}>&nbsp;&nbsp;… 62 more chains</div>
        </div>
        <div style={{ marginTop: 14, borderTop: `1px dashed ${LINE_STRONG}`, paddingTop: 12, fontSize: 16 }}>
          <div>
            <span style={{ color: DIM }}>root </span>
            <span style={{ color: GREEN }}>0x{s.root.slice(0, 30)}…</span>
          </div>
        </div>
        <div style={{ marginTop: 10 }}>
          <Ok>signature verified · sha-256 only</Ok>
        </div>
      </Terminal>
    </Frame>
  );
}

export function BunkerModeTweet() {
  return (
    <Frame w={1600} h={900}>
      <TopBar pad={96} right="status: armed" />
      <div style={{ position: "absolute", left: 0, right: 0, top: 170, display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
        <Headline size={104}>
          Bunker mode is <Accent>live</Accent>.
        </Headline>
        <Body size={26} style={{ marginTop: 26 }}>
          Every coin signed with keys a quantum computer can&apos;t fake.
        </Body>
      </div>
      <Terminal title="pqc@bunker: ~" meta="session 0x7f3a" width={900} style={{ position: "absolute", left: 350, top: 450 }}>
        <Prompt>pqc bunker --enable</Prompt>
        <div style={{ marginTop: 10 }}>
          <Ok>derived 256 one-time keys from wallet signature</Ok>
          <Ok>merkle root registered · pq1Hn3…W8k</Ok>
          <Ok>root anchored on solana · memo confirmed</Ok>
          <Ok>attestation signed with leaf #7</Ok>
          <Ok>coin live on pump.fun</Ok>
        </div>
        <div style={{ marginTop: 10, color: FG }}>
          bunker sealed<span style={{ display: "inline-block", width: 10, height: 20, marginLeft: 6, background: FG, verticalAlign: -3 }} />
        </div>
      </Terminal>
    </Frame>
  );
}

export function HowItWorksTweet() {
  const steps = [
    { n: "01", k: "derive", t: "One signature", b: "Your wallet signs a fixed message. 256 hash-based keys are derived in the browser.", c: "seed = HKDF(sig ‖ pass)" },
    { n: "02", k: "register", t: "One root", b: "The keys hash into a Merkle tree. Its root becomes your pq1… address.", c: "root = merkle(256 × wots)" },
    { n: "03", k: "anchor", t: "One timestamp", b: "A Solana memo records the root while ed25519 is still trustworthy.", c: "memo: pqc.market:v1:anchor" },
    { n: "04", k: "launch", t: "One-time key", b: "A fresh leaf signs the coin. It goes live on the pump.fun curve.", c: "σ = wots.sign(d, leaf)" },
  ];
  return (
    <Frame w={1600} h={900}>
      <TopBar pad={96} right="pqc.market/docs" />
      <div style={{ position: "absolute", left: 96, top: 190 }}>
        <Headline size={80}>
          How it <Accent>works</Accent>.
        </Headline>
      </div>
      <div style={{ position: "absolute", left: 96, right: 96, top: 380, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", border: `1px solid ${LINE_STRONG}`, background: "rgba(18,17,16,0.92)" }}>
        {steps.map((s, i) => (
          <div key={s.n} style={{ padding: "34px 30px", borderLeft: i ? `1px solid ${LINE_STRONG}` : "none", minHeight: 380, display: "flex", flexDirection: "column" }}>
            <Mono size={18} color={i === 3 ? GREEN : DIM}>
              {s.n} · {s.k}
            </Mono>
            <Headline size={36} style={{ marginTop: 26 }}>
              {s.t}
            </Headline>
            <Body size={20} style={{ marginTop: 18 }}>
              {s.b}
            </Body>
            <Mono size={16} color={GREEN} style={{ marginTop: "auto", borderTop: `1px dashed ${LINE_STRONG}`, paddingTop: 16 }}>
              {s.c}
            </Mono>
          </div>
        ))}
      </div>
    </Frame>
  );
}

export function ProofTweet() {
  const s = useSample();
  return (
    <Frame w={1600} h={900}>
      <TopBar pad={96} />
      <div style={{ position: "absolute", left: 96, top: 230, width: 600 }}>
        <Mono size={18} color={GREEN} style={{ letterSpacing: 3 }}>
          [ OK ] VERIFIED
        </Mono>
        <Headline size={84} style={{ marginTop: 26 }}>
          The proof is just <Accent>hashing</Accent>.
        </Headline>
        <Body size={25} style={{ marginTop: 32 }}>
          67 hash chains, 8 Merkle levels, one root. Anyone can check a launch in their browser with nothing but SHA-256.
        </Body>
      </div>
      <Terminal title="pqc@bunker: ~/verify" meta="leaf #7" width={720} style={{ position: "absolute", right: 96, top: 180 }}>
        <Prompt>wots verify --leaf 7</Prompt>
        <div style={{ marginTop: 12, color: FG }}>
          <span style={{ color: GREEN }}>&gt;</span> pk[i] =? H^(15-d[i])(σ[i])
        </div>
        <div style={{ marginTop: 12 }}>
          <ChainRows rows={s.chains} digits={s.digits} size={18} />
          <div style={{ color: DIM }}>&nbsp;&nbsp;… 61 more chains</div>
        </div>
        <div style={{ marginTop: 12, borderTop: `1px dashed ${LINE_STRONG}`, paddingTop: 12, fontSize: 17 }}>
          <div>
            <span style={{ color: DIM }}>leaf </span>0x{s.leaf.slice(0, 34)}…
          </div>
          <div>
            <span style={{ color: DIM }}>root </span>
            <span style={{ color: GREEN }}>0x{s.root.slice(0, 34)}…</span>
          </div>
        </div>
        <div style={{ marginTop: 12 }}>
          <Ok>signature verified · sha-256 only</Ok>
        </div>
      </Terminal>
    </Frame>
  );
}

/* ------------------------------------------------------------------ */
/* 1080 × 1080 and 1080 × 1350                                         */
/* ------------------------------------------------------------------ */

export function FingerprintSquare() {
  const s = useSample();
  return (
    <Frame w={1080} h={1080}>
      <div style={{ position: "absolute", left: 80, top: 70 }}>
        <Wordmark size={28} />
      </div>
      <div style={{ position: "absolute", left: 80, right: 80, top: 210 }}>
        <Headline size={76}>
          Every coin carries a <Accent>quantum fingerprint</Accent>.
        </Headline>
      </div>
      <Terminal title="attestation digest" meta="leaf #7" style={{ position: "absolute", left: 80, right: 80, top: 470 }}>
        <DigestCells digits={s.digits} cell={22} gap={4} />
        <div style={{ marginTop: 18, fontSize: 15, color: DIM }}>0x{s.msg}</div>
      </Terminal>
      <div style={{ position: "absolute", left: 80, right: 80, bottom: 80, display: "flex", gap: 36 }}>
        <Mono size={18} color={MUTED}>
          <span style={{ color: GREEN }}>■</span> 64 message digits
        </Mono>
        <Mono size={18} color={MUTED}>
          <span style={{ color: AMBER }}>■</span> 3 checksum digits
        </Mono>
        <Mono size={18} color={DIM} style={{ marginLeft: "auto" }}>
          brightness = chain depth
        </Mono>
      </div>
    </Frame>
  );
}

export function NumbersSquare() {
  const stats = [
    { v: "2,404", u: "bytes", l: "per signature" },
    { v: "256", u: "keys", l: "per identity" },
    { v: "SHA-256", u: "", l: "the only assumption" },
    { v: "1", u: "signature", l: "per key, ever" },
  ];
  return (
    <Frame w={1080} h={1080}>
      <div style={{ position: "absolute", left: 80, top: 70 }}>
        <Wordmark size={28} />
      </div>
      <div style={{ position: "absolute", left: 80, top: 210 }}>
        <Headline size={76}>
          By the <Accent>numbers</Accent>.
        </Headline>
      </div>
      <div
        style={{
          position: "absolute",
          left: 80,
          right: 80,
          top: 380,
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          border: `1px solid ${LINE_STRONG}`,
          background: "rgba(18,17,16,0.92)",
        }}
      >
        {stats.map((s, i) => (
          <div
            key={s.l}
            style={{
              padding: "48px 40px",
              minHeight: 290,
              borderLeft: i % 2 ? `1px solid ${LINE_STRONG}` : "none",
              borderTop: i > 1 ? `1px solid ${LINE_STRONG}` : "none",
            }}
          >
            <div style={{ height: 96, display: "flex", alignItems: "flex-end" }}>
              <Headline size={s.v.length > 5 ? 70 : 88} style={{ color: i === 2 ? GREEN : FG, lineHeight: 1 }}>
                {s.v}
              </Headline>
            </div>
            <Mono size={20} color={DIM} style={{ marginTop: 24 }}>
              {s.u ? `${s.u} ` : ""}
              {s.l}
            </Mono>
          </div>
        ))}
      </div>
    </Frame>
  );
}

export function VersusPortrait() {
  const rows: [string, string][] = [
    ["broken by Shor's algorithm", "security rests on SHA-256"],
    ["address = public key, always exposed", "keys hidden behind a hash"],
    ["one break exposes every account", "each key signs exactly once"],
    ["proofs die with the curve", "proofs outlive the curve"],
  ];
  return (
    <Frame w={1080} h={1350}>
      <div style={{ position: "absolute", left: 80, top: 70 }}>
        <Wordmark size={28} />
      </div>
      <div style={{ position: "absolute", left: 80, right: 80, top: 220 }}>
        <Headline size={84}>
          Which one <Accent>survives</Accent>?
        </Headline>
      </div>
      <div style={{ position: "absolute", left: 80, right: 80, top: 470, display: "flex", flexDirection: "column", gap: 36 }}>
        {[
          { title: "ed25519", sub: "solana today", color: RED, mark: "✗", items: rows.map((r) => r[0]) },
          { title: "wots + merkle", sub: "pqc.market", color: GREEN, mark: "✓", items: rows.map((r) => r[1]) },
        ].map((col) => (
          <Terminal key={col.title} title={`$ inspect ${col.title}`} meta={col.sub}>
            {col.items.map((t) => (
              <div key={t} style={{ display: "flex", gap: 16, fontSize: 23, lineHeight: 2.1 }}>
                <span style={{ color: col.color }}>{col.mark}</span>
                <span style={{ color: FG }}>{t}</span>
              </div>
            ))}
          </Terminal>
        ))}
      </div>
      <div style={{ position: "absolute", left: 80, right: 80, bottom: 80, display: "flex", justifyContent: "space-between", borderTop: `1px solid ${LINE_STRONG}`, paddingTop: 28 }}>
        <Mono size={20} color={MUTED}>
          launch on pump.fun with provenance that outlives the curve
        </Mono>
        <Mono size={20} color={GREEN}>
          pqc.market
        </Mono>
      </div>
    </Frame>
  );
}

/* ------------------------------------------------------------------ */
/* Profile                                                             */
/* ------------------------------------------------------------------ */

export function XHeader() {
  const s = useSample();
  return (
    <Frame w={1500} h={500}>
      {/* Left third stays quiet: the avatar overlaps it on X. */}
      <div style={{ position: "absolute", right: 90, top: 0, bottom: 0, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "flex-end", textAlign: "right" }}>
        <Headline size={64}>
          Launch coins that survive <Accent>Q-day</Accent>.
        </Headline>
        <Mono size={20} color={DIM} style={{ marginTop: 22 }}>
          pqc.market · post-quantum launchpad on pump.fun
        </Mono>
        <div style={{ marginTop: 30 }}>
          <DigestCells digits={s.digits} cell={12} gap={3} />
        </div>
      </div>
    </Frame>
  );
}

export function ProfilePicture() {
  return (
    <Frame w={400} h={400}>
      <div style={{ position: "absolute", inset: 0, background: "radial-gradient(circle at 50% 52%, rgba(63,185,80,0.16), rgba(18,17,16,0) 60%)" }} />
      <img src="/transparentlogo.png" alt="" style={{ position: "absolute", left: 40, top: 44, width: 320, height: 320, objectFit: "contain" }} />
    </Frame>
  );
}

export type Graphic = { id: string; title: string; note: string; w: number; h: number; group: string; Component: () => ReactNode };

export const GRAPHICS: Graphic[] = [
  { id: "vault-breakdown-bunker", title: "How a quantum vault works", note: "Technical breakdown · artwork", w: 1600, h: 900, group: "Vault", Component: VaultBreakdownScene },
  { id: "vault-auth-bunker", title: "Only one signature unlocks the vault", note: "Vault authorization · artwork", w: 1600, h: 900, group: "Vault", Component: VaultAuthScene },
  { id: "wallets-launch", title: "Post-quantum wallets", note: "Wallet launch", w: 1600, h: 900, group: "Wallets", Component: WalletsLaunchTweet },
  { id: "wallets-launch-bunker", title: "Post-quantum wallets · bunker", note: "Artwork edition", w: 1600, h: 900, group: "Wallets", Component: WalletsLaunchScene },
  { id: "wallets-fingerprint", title: "Every wallet has a fingerprint", note: "Wallet cards", w: 1600, h: 900, group: "Wallets", Component: WalletsFingerprintTweet },
  { id: "wallets-fingerprint-bunker", title: "Every wallet has a fingerprint · bunker", note: "Artwork edition", w: 1600, h: 900, group: "Wallets", Component: WalletsFingerprintScene },
  { id: "all-schemes", title: "All eight schemes", note: "WOTS · ML-DSA ×2 · SLH-DSA ×2 · Falcon ×2 · hybrid", w: 1600, h: 900, group: "Tweets · 16:9", Component: AllSchemesTweet },
  { id: "more-schemes", title: "Four more schemes", note: "ML-DSA-87 · SLH-DSA-SHAKE · Falcon-1024 · hybrid", w: 1600, h: 900, group: "Tweets · 16:9", Component: MoreSchemesTweet },
  { id: "schemes", title: "Signature schemes", note: "WOTS · ML-DSA · SLH-DSA · Falcon", w: 1600, h: 900, group: "Tweets · 16:9", Component: SchemesTweet },
  { id: "intro", title: "Introduction", note: "Launch announcement", w: 1600, h: 900, group: "Tweets · 16:9", Component: IntroTweet },
  { id: "bunker-mode", title: "Bunker mode is live", note: "Launch day", w: 1600, h: 900, group: "Tweets · 16:9", Component: BunkerModeTweet },
  { id: "how-it-works", title: "How it works", note: "Four-step explainer", w: 1600, h: 900, group: "Tweets · 16:9", Component: HowItWorksTweet },
  { id: "the-proof", title: "The proof", note: "Real WOTS verification", w: 1600, h: 900, group: "Tweets · 16:9", Component: ProofTweet },
  { id: "fingerprint", title: "Quantum fingerprint", note: "Digest grid", w: 1080, h: 1080, group: "Square & portrait", Component: FingerprintSquare },
  { id: "numbers", title: "By the numbers", note: "Stats", w: 1080, h: 1080, group: "Square & portrait", Component: NumbersSquare },
  { id: "versus", title: "Which one survives?", note: "ed25519 vs WOTS", w: 1080, h: 1350, group: "Square & portrait", Component: VersusPortrait },
  { id: "scene-all-schemes", title: "All eight schemes · bunker", note: "Artwork edition", w: 1600, h: 900, group: "Bunker artwork", Component: SceneAllSchemesTweet },
  { id: "scene-intro", title: "Introduction · bunker", note: "Artwork edition", w: 1600, h: 900, group: "Bunker artwork", Component: SceneIntro },
  { id: "scene-bunker-mode", title: "Bunker mode · bunker", note: "Artwork edition", w: 1600, h: 900, group: "Bunker artwork", Component: SceneBunkerMode },
  { id: "scene-proof", title: "The proof · bunker", note: "Artwork edition", w: 1600, h: 900, group: "Bunker artwork", Component: SceneProof },
  { id: "scene-square", title: "Quantum fingerprint · bunker", note: "Artwork edition", w: 1080, h: 1080, group: "Bunker artwork", Component: SceneSquare },
  { id: "scene-portrait", title: "Seal your coins", note: "Artwork edition", w: 1080, h: 1350, group: "Bunker artwork", Component: ScenePortrait },
  { id: "scene-header", title: "X header · bunker", note: "Artwork edition", w: 1500, h: 500, group: "Bunker artwork", Component: SceneHeader },
  { id: "scene-avatar", title: "Avatar · bunker", note: "Artwork edition", w: 400, h: 400, group: "Bunker artwork", Component: SceneAvatar },
  { id: "x-header", title: "X header", note: "Profile banner", w: 1500, h: 500, group: "Profile", Component: XHeader },
  { id: "pfp", title: "Profile picture", note: "Avatar", w: 400, h: 400, group: "Profile", Component: ProfilePicture },
];
