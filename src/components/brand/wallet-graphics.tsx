"use client";

import { useMemo } from "react";
import { sha256 } from "@noble/hashes/sha2.js";
import { utf8ToBytes } from "@noble/hashes/utils.js";
import { digits } from "@/lib/pq/wots";
import { AMBER as WARN_OR_AMBER, Accent, Body, DIM, DigestCells, FG, Frame, GREEN, Headline, LINE_STRONG, MUTED, Mono, Ok, Prompt, Stat, Terminal, TopBar } from "./graphics";
import { Scene, Shade } from "./scene-graphics";

/**
 * Wallet announcement graphics. Wording is deliberately "dual-signed" /
 * "post-quantum attested": Solana still enforces ed25519 for funds.
 */

const printFor = (s: string) => digits(sha256(utf8ToBytes(`pqc.market/wallet-print/${s}`)));

function SendTerminal({ width = 640 }: { width?: number }) {
  return (
    <Terminal title="pqc@bunker: ~/wallet" meta="dual-signed" width={width}>
      <Prompt>wallet send 1.5 SOL --scheme ml-dsa-65</Prompt>
      <div style={{ marginTop: 12, color: DIM }}># 1 · derive</div>
      <div>
        key = HKDF(sk.seed, <span style={{ color: FG }}>&quot;wallet/v1&quot;</span>, 0)
      </div>
      <div style={{ marginTop: 12, color: DIM }}># 2 · sign twice</div>
      <Ok>
        ed25519 <span style={{ color: MUTED }}>· enforced by solana</span>
      </Ok>
      <Ok>
        ML-DSA-65 <span style={{ color: MUTED }}>· 3,309 B · certified by root</span>
      </Ok>
      <div style={{ marginTop: 12, color: DIM }}># 3 · record</div>
      <div style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        memo pqc.market:v1:transfer:pq1Hn3…W8k:<span style={{ color: GREEN }}>d369…865f</span>
      </div>
      <div style={{ marginTop: 12 }}>
        <Ok>confirmed</Ok>
      </div>
    </Terminal>
  );
}

function WalletsLaunch({ scene }: { scene?: boolean }) {
  return (
    <Frame w={1600} h={900} plain={scene}>
      {scene && (
        <>
          <Scene w={1600} h={900} scale={1.15} x={0.85} y={0.4} />
          <Shade style={{ background: "linear-gradient(90deg, rgba(18,17,16,0.97) 0%, rgba(18,17,16,0.9) 38%, rgba(18,17,16,0.55) 58%, rgba(18,17,16,0.35) 100%)" }} />
          <Shade style={{ background: "linear-gradient(180deg, rgba(18,17,16,0.6) 0%, rgba(18,17,16,0) 22%, rgba(18,17,16,0) 75%, rgba(18,17,16,0.85) 100%)" }} />
        </>
      )}
      <TopBar pad={96} right="new · wallets" />
      <div style={{ position: "absolute", left: 96, top: 225, width: 720 }}>
        <Mono size={18} color={GREEN} style={{ letterSpacing: 3 }}>
          ● NOW ON PQC.MARKET
        </Mono>
        <Headline size={88} style={{ marginTop: 26 }}>
          Post-quantum <Accent>wallets</Accent>.
        </Headline>
        <Body size={25} style={{ marginTop: 30, maxWidth: 700, color: scene ? "#cfc8c0" : undefined }}>
          Unlimited wallets derived from your hash-based identity. Every transfer is signed twice: once for Solana, once with a
          post-quantum key recorded on-chain.
        </Body>
        <div style={{ marginTop: 50, display: "flex", gap: 56 }}>
          <Stat label="keys stored" value="0" />
          <Stat label="signatures / transfer" value="2" />
          <Stat label="pq schemes" value="8" />
        </div>
      </div>
      <div style={{ position: "absolute", right: 96, top: 230 }}>
        <SendTerminal width={620} />
      </div>
    </Frame>
  );
}

const CARDS = [
  { n: 0, label: "Main", addr: "7xKQ…pq8a", sol: "12.40", tokens: 3, state: "open" },
  { n: 1, label: "Launch funds", addr: "Hn3W…W8kb", sol: "4.05", tokens: 1, state: "open" },
  { n: 2, label: "Main · rotated", addr: "3bxH…tdp8", sol: "0", tokens: 0, state: "rotated" },
] as const;

function WalletsFingerprints({ scene }: { scene?: boolean }) {
  const prints = useMemo(() => CARDS.map((c) => printFor(c.addr)), []);
  return (
    <Frame w={1600} h={900} plain={scene}>
      {scene && (
        <>
          <Scene w={1600} h={900} scale={1.1} x={0.5} y={0.15} />
          <Shade style={{ background: "linear-gradient(180deg, rgba(18,17,16,0.9) 0%, rgba(18,17,16,0.55) 30%, rgba(18,17,16,0.88) 46%, rgba(18,17,16,0.97) 100%)" }} />
        </>
      )}
      <TopBar pad={96} right="dual-signed · rotate anytime" />
      <div style={{ position: "absolute", left: 96, right: 96, top: 175 }}>
        <Headline size={76}>
          Every wallet has a <Accent>fingerprint</Accent>.
        </Headline>
        <Body size={24} style={{ marginTop: 18, color: scene ? "#cfc8c0" : undefined }}>
          Derived from one identity, never stored, rotated into a fresh address in a single click.
        </Body>
      </div>
      <div style={{ position: "absolute", left: 96, right: 96, top: 410, display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 24 }}>
        {CARDS.map((c, i) => {
          const rotated = c.state === "rotated";
          return (
            <div
              key={c.n}
              style={{
                border: `1px solid ${i === 0 ? "rgba(63,185,80,0.6)" : LINE_STRONG}`,
                background: scene ? "rgba(11,10,10,0.92)" : "#0b0a0a",
                padding: "30px 28px 28px",
                minWidth: 0,
                opacity: rotated ? 0.5 : 1,
                fontFamily: "'PQC Mono', monospace",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <span style={{ fontFamily: "'PQC Serif', serif", fontWeight: 700, fontSize: 30, color: FG }}>{c.label}</span>
                <span style={{ fontSize: 15, color: rotated ? WARN_OR_AMBER : i === 0 ? GREEN : DIM }}>{rotated ? "rotated" : `#${c.n}`}</span>
              </div>
              <div style={{ marginTop: 6, fontSize: 16, color: MUTED }}>{c.addr}</div>
              <div style={{ marginTop: 20 }}>
                <DigestCells digits={prints[i]} cell={9} gap={2} />
              </div>
              <div style={{ marginTop: 22, display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <span style={{ fontSize: 30, color: FG }}>
                  {c.sol} <span style={{ fontSize: 16, color: MUTED }}>SOL</span>
                </span>
                <span style={{ fontSize: 15, color: DIM }}>{c.tokens ? `+${c.tokens} token${c.tokens > 1 ? "s" : ""}` : "swept"}</span>
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ position: "absolute", left: 96, right: 96, bottom: 64, display: "flex", gap: 40, fontFamily: "'PQC Mono', monospace", fontSize: 17 }}>
        <Ok>keys re-derived on unlock</Ok>
        <Ok>pq attestation on every transfer</Ok>
        <Ok>rotate sweeps to a fresh address</Ok>
      </div>
    </Frame>
  );
}

export const WalletsLaunchTweet = () => <WalletsLaunch />;
export const WalletsLaunchScene = () => <WalletsLaunch scene />;
export const WalletsFingerprintTweet = () => <WalletsFingerprints />;
export const WalletsFingerprintScene = () => <WalletsFingerprints scene />;
