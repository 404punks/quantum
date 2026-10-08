"use client";

import { useEffect, useState } from "react";
import { bytesToHex, randomBytes } from "@noble/hashes/utils.js";
import { AddrType, W, address, digits, leafHash, secretElement, thash } from "@/lib/pq/wots";
import { nodeHash } from "@/lib/pq/xmss";
import { cn } from "@/lib/format";

const ROWS = 5; // chains drawn (of 67)
const TICK_MS = 120;

// Timeline, in ticks.
const SIGN_END = W; // walk each chain 0 → dᵢ
const VERIFY_END = SIGN_END + W; // walk dᵢ → 15
const COMPRESS_END = VERIFY_END + 6;
const CLIMB_END = COMPRESS_END + 10;
const HOLD_END = CLIMB_END + 14;

type Run = {
  msg: string;
  digits: number[];
  chains: string[][]; // ROWS × 16 intermediate values, hex
  leaf: string;
  path: string[]; // 8 Merkle nodes, leaf → root
};

/** A genuine WOTS sign + verify on a random message, recomputed every cycle. */
function makeRun(): Run {
  const sk = randomBytes(32);
  const pub = randomBytes(32);
  const msg = randomBytes(32);
  const chains = Array.from({ length: ROWS }, (_, i) => {
    let x = secretElement(sk, 0, i);
    const vals = [bytesToHex(x)];
    for (let s = 0; s < W - 1; s++) {
      x = thash(pub, address(AddrType.Chain, 0, i, s), x);
      vals.push(bytesToHex(x));
    }
    return vals;
  });
  const leafBytes = leafHash(sk, pub, 0);
  const path: string[] = [];
  let node = leafBytes;
  for (let h = 0; h < 8; h++) {
    node = nodeHash(pub, h + 1, 0, node, randomBytes(32));
    path.push(bytesToHex(node));
  }
  return { msg: bytesToHex(msg), digits: digits(msg), chains, leaf: bytesToHex(leafBytes), path };
}

type Phase = "sign" | "verify" | "compress" | "climb" | "done";

function phaseOf(t: number): Phase {
  if (t < SIGN_END) return "sign";
  if (t < VERIFY_END) return "verify";
  if (t < COMPRESS_END) return "compress";
  if (t < CLIMB_END) return "climb";
  return "done";
}

export function ProofAnimation({ className }: { className?: string }) {
  const [run, setRun] = useState<Run | null>(null);
  const [t, setT] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setT((prev) => (prev + 1) % HOLD_END), TICK_MS);
    return () => clearInterval(id);
  }, []);

  // Fresh keys and message at the start of every cycle.
  useEffect(() => {
    if (t === 0) setRun(makeRun());
  }, [t]);

  const phase = phaseOf(t);
  const climbStep = phase === "climb" ? t - COMPRESS_END : phase === "done" ? 8 : 0;

  const formulas: { key: Exclude<Phase, "done">; text: string }[] = [
    { key: "sign", text: "σ[i] = H^d[i](sk[i])" },
    { key: "verify", text: "pk[i] =? H^(15-d[i])(σ[i])" },
    { key: "compress", text: "ℓ = H(pk[0] || … || pk[66])" },
    { key: "climb", text: "root =? H(…H(ℓ || a[0])… || a[7])" },
  ];

  return (
    <div className={cn("border border-line-strong bg-[#0b0a0a] font-mono text-[11.5px] leading-relaxed", className)}>
      <div className="flex items-center justify-between border-b border-line-strong bg-surface px-3 py-1.5 text-[11px] text-dim">
        <span>pqc@bunker: ~/verify</span>
        <span>wots-sha256 · w=16</span>
      </div>

      <div className="p-4">
        <div className="text-muted">
          <span className="text-up">pqc@bunker</span>:<span className="text-fg">~</span>$ wots verify --live
        </div>

        <div className="mt-3 space-y-0.5">
          {formulas.map((f) => {
            const active = f.key === phase || (phase === "done" && f.key === "climb");
            return (
              <div key={f.key} className={cn("flex gap-2 whitespace-nowrap transition-colors duration-300", active ? "text-fg" : "text-dim/60")}>
                <span className={cn("w-2", active && "text-up")}>{active ? ">" : ""}</span>
                <span className="w-[76px] shrink-0"># {f.key}</span>
                <span className="truncate">{f.text}</span>
              </div>
            );
          })}
        </div>

        <div className="mt-4 space-y-1">
          {run?.chains.map((vals, i) => {
            const d = run.digits[i];
            const signCursor = phase === "sign" ? Math.min(t, d) : d;
            const verifyCursor = phase === "sign" ? -1 : phase === "verify" ? Math.min(d + (t - SIGN_END), W - 1) : W - 1;
            const head = phase === "sign" ? signCursor : verifyCursor;
            const walking = phase === "sign" || phase === "verify";
            return (
              <div key={i} className="flex items-center gap-3 whitespace-nowrap">
                <span className="text-dim">
                  c{i.toString().padStart(2, "0")} d={d.toString(16)}
                </span>
                <span className="tracking-[0.18em]">
                  {Array.from({ length: W }, (_, s) => {
                    const signed = s <= signCursor;
                    const verified = s > d && s <= verifyCursor;
                    const isSigma = s === d && (phase !== "sign" || t >= d);
                    const isHead = walking && s === head;
                    return (
                      <span
                        key={s}
                        className={
                          isHead ? "text-white" : isSigma ? "text-warn" : verified ? "text-up" : signed ? "text-fg/70" : "text-surface-3"
                        }
                      >
                        {isHead ? "█" : signed || verified ? "■" : "·"}
                      </span>
                    );
                  })}
                </span>
                <span className={cn("ml-auto", walking ? "text-muted" : "text-up")}>
                  {vals[Math.max(0, head)].slice(0, 8)}
                  {walking ? "" : " ok"}
                </span>
              </div>
            );
          })}
          <div className="text-dim">  … 62 more chains</div>
        </div>

        <div className="mt-4 space-y-0.5 border-t border-dashed border-line-strong pt-3">
          <Line label="msg " value={run?.msg} />
          <Line label="leaf" value={phase === "compress" || phase === "climb" || phase === "done" ? run?.leaf : undefined} />
          <Line label={`root ${climbStep}/8`} value={climbStep > 0 ? run?.path[climbStep - 1] : undefined} tone={phase === "done" ? "up" : undefined} />
        </div>

        <div className="mt-3">
          {phase === "done" ? (
            <span>
              <span className="text-up">[ OK ]</span> <span className="text-fg">signature verified · sha-256 only</span>
            </span>
          ) : (
            <span className="text-muted">
              <span className="text-warn">[ .. ]</span>{" "}
              {phase === "sign" ? "signing message" : phase === "verify" ? "walking chains" : phase === "compress" ? "compressing public key" : "climbing merkle path"}
              <span className="ml-1 inline-block h-3 w-[7px] translate-y-[2px] animate-pulse bg-fg" />
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function Line({ label, value, tone }: { label: string; value?: string; tone?: "up" }) {
  return (
    <div className="flex gap-3 whitespace-nowrap">
      <span className="text-dim">{label}</span>
      <span className={cn("truncate", value ? (tone === "up" ? "text-up" : "text-muted") : "text-surface-3")}>
        {value ? `0x${value.slice(0, 28)}…` : "-".repeat(32)}
      </span>
    </div>
  );
}
