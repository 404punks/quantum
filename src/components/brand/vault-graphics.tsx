"use client";

import type { ReactNode } from "react";
import { AMBER, Accent, BG, Body, DIM, DigestCells, FG, Frame, GREEN, Headline, LINE_STRONG, MUTED, Mono, Ok, Prompt, RED, Stat, TERM, Terminal, TopBar, useSample } from "./graphics";
import { MONO } from "./fonts";
import { Scene, Shade } from "./scene-graphics";

/**
 * Quantum vault explainer: the post-quantum signature is the authorization
 * itself, not a record. A valid ed25519 signature alone gets rejected.
 */

function Fail({ children }: { children: ReactNode }) {
  return (
    <div>
      <span style={{ color: RED }}>[FAIL]</span> <span style={{ color: FG }}>{children}</span>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <span>
      {k.padEnd(9, " ")}
      <span style={{ color: MUTED }}>{v}</span>
    </span>
  );
}

export function VaultAuthScene() {
  return (
    <Frame w={1600} h={900} plain>
      <Scene w={1600} h={900} scale={1.15} x={0.85} y={0.4} />
      <Shade style={{ background: "linear-gradient(90deg, rgba(18,17,16,0.97) 0%, rgba(18,17,16,0.92) 40%, rgba(18,17,16,0.6) 60%, rgba(18,17,16,0.45) 100%)" }} />
      <Shade style={{ background: "linear-gradient(180deg, rgba(18,17,16,0.6) 0%, rgba(18,17,16,0) 22%, rgba(18,17,16,0) 72%, rgba(18,17,16,0.9) 100%)" }} />
      <TopBar pad={96} right="quantum vault · on-chain" />

      <div style={{ position: "absolute", left: 96, top: 205, width: 760 }}>
        <Mono size={18} color={GREEN} style={{ letterSpacing: 3 }}>
          ● HOW THE VAULT AUTHORIZES
        </Mono>
        <Headline size={78} style={{ marginTop: 24 }}>
          Only one signature
          <br />
          <Accent>unlocks</Accent> the vault.
        </Headline>
        <Body size={24} style={{ marginTop: 28, maxWidth: 680, color: "#cfc8c0" }}>
          Funds sit in a Solana program, not behind a wallet key. Ed25519 only pays the fee. The program releases funds after it verifies a
          Winternitz signature over SHA-256 against the vault&apos;s commitment.
        </Body>
        <div style={{ marginTop: 46, display: "flex", gap: 56 }}>
          <Stat label="assumption" value="SHA-256" />
          <Stat label="signature" value="2,144 B" />
          <Stat label="solana changes" value="0" />
        </div>
      </div>

      <div style={{ position: "absolute", right: 96, top: 190, width: 600, display: "flex", flexDirection: "column", gap: 22 }}>
        <Terminal title="pqc@bunker: ~/vault" meta="withdraw">
          <Prompt>vault withdraw 0.5 SOL</Prompt>
          <div style={{ marginTop: 10, color: DIM }}># program check · DNsP…cg9F</div>
          <Ok>
            <Row k="ed25519" v="fee payer only" />
          </Ok>
          <Ok>
            <Row k="wots σ" v="67 chains · sha-256" />
          </Ok>
          <Ok>
            <Row k="H(pk)" v="= vault commitment" />
          </Ok>
          <div style={{ marginTop: 10, color: GREEN }}>→ released · rest rolls to vault #2</div>
        </Terminal>

        <Terminal title="attacker: ~/forged" meta="rejected">
          <div>
            <span style={{ color: RED }}>attacker</span>
            <span style={{ color: DIM }}>:~$ </span>
            <span style={{ color: FG }}>vault withdraw --all</span>
          </div>
          <div style={{ marginTop: 10, color: DIM }}># valid ed25519, no hash-based key</div>
          <Ok>
            <Row k="ed25519" v="valid signature" />
          </Ok>
          <Fail>
            <Row k="wots σ" v="does not recover H(pk)" />
          </Fail>
          <div style={{ marginTop: 10, color: RED }}>→ InvalidSignature · nothing moves</div>
        </Terminal>
      </div>

      <div style={{ position: "absolute", left: 96, right: 96, bottom: 58, display: "flex", gap: 44, fontFamily: "'PQC Mono', monospace", fontSize: 17 }}>
        <Ok>verified by the program, not recorded after</Ok>
        <Ok>one-time keys, fresh vault each spend</Ok>
        <Ok>no changes to Solana</Ok>
      </div>
    </Frame>
  );
}

const STEPS = [
  {
    n: "01",
    k: "deposit",
    t: "Held by a program",
    b: "SOL and tokens sit at a vault address the program controls. No wallet key owns it.",
    c: "vault = PDA(\"vault\", H(pk))",
  },
  {
    n: "02",
    k: "sign",
    t: "One-time hash key",
    b: "Your browser signs the exact withdrawal with a Winternitz key. No curves involved.",
    c: "σ = wots.sign(withdrawal)",
  },
  {
    n: "03",
    k: "verify",
    t: "Checked on-chain",
    b: "The program walks 67 SHA-256 chains from σ and rebuilds the vault's public key.",
    c: "H(recover(σ)) == commitment",
  },
  {
    n: "04",
    k: "release",
    t: "Pay, roll, retire",
    b: "Funds go out, the rest rolls into a fresh vault, and the used key is retired forever.",
    c: "→ recipient · rest → vault #2",
  },
];

/** Three hash chains: walked by the signer (light), finished by the program (green). */
function Chains({ digits: d }: { digits: number[] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {[0, 1, 2].map((i) => (
        <div key={i} style={{ display: "flex", gap: 4 }}>
          {Array.from({ length: 15 }, (_, k) => (
            <div key={k} style={{ width: 12, height: 12, background: k < d[i] ? "rgba(242,238,233,0.55)" : k === d[i] ? AMBER : GREEN }} />
          ))}
        </div>
      ))}
    </div>
  );
}

function StepVisual({ i, digits: d }: { i: number; digits: number[] }) {
  if (i === 0) {
    return (
      <div style={{ border: `1px solid ${LINE_STRONG}`, background: TERM, padding: "12px 14px", fontFamily: MONO, fontSize: 15, lineHeight: 1.6 }}>
        <div style={{ color: DIM }}>owner</div>
        <div style={{ color: FG }}>pqc-vault program</div>
        <div style={{ color: DIM, marginTop: 4 }}>balance</div>
        <div style={{ color: GREEN }}>12.40 SOL · 3 tokens</div>
      </div>
    );
  }
  if (i === 1) return <DigestCells digits={d} cell={7} gap={2} cols={23} />;
  if (i === 2) return <Chains digits={d} />;
  return (
    <div style={{ fontFamily: MONO, fontSize: 15, lineHeight: 1.75 }}>
      <div>
        <span style={{ color: GREEN }}>vault #1</span> <span style={{ color: DIM }}>→ retired</span>
      </div>
      <div>
        <span style={{ color: FG }}>0.50 SOL</span> <span style={{ color: DIM }}>→ recipient</span>
      </div>
      <div>
        <span style={{ color: FG }}>11.90 SOL</span> <span style={{ color: DIM }}>→ vault #2</span>
      </div>
    </div>
  );
}

export function VaultBreakdownScene() {
  const sample = useSample();
  return (
    <Frame w={1600} h={900} plain>
      <Scene w={1600} h={900} scale={1.2} x={0.9} y={0.2} />
      <Shade style={{ background: "linear-gradient(180deg, rgba(18,17,16,0.72) 0%, rgba(18,17,16,0.55) 24%, rgba(18,17,16,0.93) 36%, rgba(18,17,16,0.97) 100%)" }} />
      <TopBar pad={96} right="quantum vault · technical breakdown" />

      <div style={{ position: "absolute", left: 96, right: 96, top: 172, display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <Headline size={66}>
          How a quantum vault <Accent>works</Accent>.
        </Headline>
        <Mono size={17} color={MUTED} style={{ textAlign: "right", paddingBottom: 10 }}>
          winternitz one-time signatures · sha-256
          <br />
          verified by a solana program
        </Mono>
      </div>

      <div
        style={{
          position: "absolute",
          left: 96,
          right: 96,
          top: 290,
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          border: `1px solid ${LINE_STRONG}`,
          background: "rgba(14,13,12,0.94)",
        }}
      >
        {STEPS.map((s, i) => (
          <div key={s.n} style={{ position: "relative", padding: "28px 28px 24px", borderLeft: i ? `1px solid ${LINE_STRONG}` : "none", height: 372, display: "flex", flexDirection: "column" }}>
            {i > 0 && (
              <div style={{ position: "absolute", left: -13, top: 26, width: 24, height: 24, background: BG, border: `1px solid ${LINE_STRONG}`, color: GREEN, fontFamily: MONO, fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>
                →
              </div>
            )}
            <Mono size={17} color={i === 2 ? GREEN : DIM}>
              {s.n} · {s.k}
            </Mono>
            <Headline size={31} style={{ marginTop: 16 }}>
              {s.t}
            </Headline>
            <Body size={17.5} style={{ marginTop: 12 }}>
              {s.b}
            </Body>
            <div style={{ marginTop: 18 }}>
              <StepVisual i={i} digits={sample.digits} />
            </div>
            <Mono size={15} color={GREEN} style={{ marginTop: "auto", borderTop: `1px dashed ${LINE_STRONG}`, paddingTop: 12, whiteSpace: "nowrap" }}>
              {s.c}
            </Mono>
          </div>
        ))}
      </div>

      <div style={{ position: "absolute", left: 96, right: 96, top: 694, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, fontFamily: MONO }}>
        <div style={{ border: `1px solid rgba(242,85,90,0.45)`, background: "rgba(14,13,12,0.94)", padding: "18px 24px" }}>
          <div style={{ fontSize: 15, color: DIM }}>valid ed25519 · no hash-based signature</div>
          <div style={{ marginTop: 8, fontSize: 21 }}>
            <span style={{ color: RED }}>[FAIL]</span> <span style={{ color: FG }}>rejected</span> <span style={{ color: MUTED }}>· nothing moves</span>
          </div>
        </div>
        <div style={{ border: `1px solid rgba(63,185,80,0.5)`, background: "rgba(14,13,12,0.94)", padding: "18px 24px" }}>
          <div style={{ fontSize: 15, color: DIM }}>ed25519 pays the fee · WOTS authorizes</div>
          <div style={{ marginTop: 8, fontSize: 21 }}>
            <span style={{ color: GREEN }}>[ OK ]</span> <span style={{ color: FG }}>released</span> <span style={{ color: MUTED }}>· no changes to Solana</span>
          </div>
        </div>
      </div>

      <Mono size={16} color={DIM} style={{ position: "absolute", left: 96, right: 96, bottom: 44, textAlign: "center" }}>
        the post-quantum signature isn&apos;t a receipt. it&apos;s the key to the funds.
      </Mono>
    </Frame>
  );
}
