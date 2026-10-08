"use client";

import { useEffect, useState } from "react";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, concatBytes, utf8ToBytes } from "@noble/hashes/utils.js";
import { launchDigest } from "@/lib/pq/messages";
import { SCHEMES, SCHEME_IDS, deriveSchemeKeys, schemeSign, schemeVerify, type SchemeId } from "@/lib/pq/schemes";
import * as wots from "@/lib/pq/wots";
import { MONO, SANS, SERIF } from "./fonts";

const BG = "#121110";
const SURFACE = "#1a1918";
const TERM = "#0b0a0a";
const LINE = "#2a2725";
const LINE_STRONG = "#3a3633";
const FG = "#f2eee9";
const MUTED = "#a8a19a";
const DIM = "#77706a";
const GREEN = "#3fb950";

const NOISE =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.9 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

type Row = { id: SchemeId; sig: string | null; bytes: number; ok: boolean | null };

const placeholder = (): Row[] => SCHEME_IDS.map((id) => ({ id, sig: null, bytes: SCHEMES[id].sigBytes, ok: null }));

/**
 * Real signatures over one launch digest, one scheme at a time. SLH-DSA alone
 * costs ~1 s of CPU, so this never runs during render or SSR: it starts after
 * mount, yields between schemes, and is computed once per page load.
 */
let computed: Promise<Row[]> | null = null;

async function signOne(id: SchemeId, skSeed: Uint8Array): Promise<Row> {
  const d = launchDigest({ mint: "pqc", creator: "brand", name: "Bunker", symbol: "BNKR", image: "logo", leaf: 7, scheme: id });
  if (id === "wots") {
    // One WOTS leaf: sign, then rebuild the public key from the signature and compare.
    const pubSeed = sha256(utf8ToBytes("pqc.market/brand/schemes/pub"));
    const pk = bytesToHex(concatBytes(...wots.publicKey(skSeed, pubSeed, 7)));
    const sig = wots.sign(d, skSeed, pubSeed, 7);
    const rebuilt = bytesToHex(concatBytes(...wots.publicKeyFromSignature(d, sig, pubSeed, 7)));
    return { id, sig: bytesToHex(concatBytes(...sig)), bytes: SCHEMES.wots.sigBytes, ok: rebuilt === pk };
  }
  const keys = await deriveSchemeKeys(skSeed, id);
  const sig = await schemeSign(id, d, keys.secretKey);
  return { id, sig, bytes: sig.length / 2, ok: await schemeVerify(id, d, sig, bytesToHex(keys.publicKey)) };
}

function useSignatures(): Row[] {
  const [rows, setRows] = useState<Row[]>(placeholder);
  useEffect(() => {
    let cancelled = false;
    const apply = (done: Row[]) => !cancelled && setRows((prev) => prev.map((r) => done.find((o) => o.id === r.id) ?? r));
    computed ??= (async () => {
      const skSeed = sha256(utf8ToBytes("pqc.market/brand/schemes"));
      const out: Row[] = [];
      for (const id of SCHEME_IDS) {
        await new Promise((r) => setTimeout(r, 50)); // let the page paint between schemes
        out.push(await signOne(id, skSeed));
        apply(out);
      }
      return out;
    })();
    void computed.then(apply);
    return () => {
      cancelled = true;
    };
  }, []);
  return rows;
}

export function SchemesTweet() {
  const rows = useSignatures();
  const max = Math.max(...rows.map((r) => r.bytes));
  return (
    <div style={{ width: 1600, height: 900, position: "relative", overflow: "hidden", background: BG, color: FG, fontFamily: SANS }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: `linear-gradient(${LINE}55 1px, transparent 1px), linear-gradient(90deg, ${LINE}55 1px, transparent 1px)`,
          backgroundSize: "80px 80px",
          backgroundPosition: "-1px -1px",
        }}
      />

      <div style={{ position: "absolute", left: 96, right: 96, top: 72, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 13 }}>
          <img src="/logo-mark.png" alt="" style={{ width: 44, height: 44 }} />
          <span style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 30, letterSpacing: -0.6 }}>pqc.market</span>
        </div>
        <span style={{ fontFamily: MONO, fontSize: 18, color: GREEN }}>● new · signature schemes</span>
      </div>

      <div style={{ position: "absolute", left: 96, top: 175 }}>
        <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 76, lineHeight: 1.08, letterSpacing: -1.5 }}>
          Choose how your coin is <span style={{ fontStyle: "italic", color: GREEN, whiteSpace: "nowrap" }}>signed</span>.
        </div>
        <div style={{ marginTop: 20, fontSize: 24, color: MUTED }}>
          Four post-quantum schemes. One identity. Every key certified by your hash-based root.
        </div>
      </div>

      <div style={{ position: "absolute", left: 96, right: 96, top: 400, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 20 }}>
        {rows.map((r) => {
          const s = SCHEMES[r.id];
          return (
            <div key={r.id} style={{ border: `1px solid ${LINE_STRONG}`, background: TERM, fontFamily: MONO, boxShadow: "0 30px 80px -30px rgba(0,0,0,0.8)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", background: SURFACE, borderBottom: `1px solid ${LINE_STRONG}`, padding: "9px 16px", fontSize: 14, color: DIM }}>
                <span>{s.standard}</span>
                <span>{r.id === "wots" ? "root" : "certified"}</span>
              </div>
              <div style={{ padding: "20px 18px 22px" }}>
                <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 30, letterSpacing: -0.6, color: FG }}>{s.name}</div>
                <div style={{ marginTop: 6, fontSize: 15, color: MUTED, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {s.aka} · {s.family.split(" · ")[0]}
                </div>

                <div style={{ marginTop: 22, fontSize: 13, color: DIM }}>signature</div>
                <div style={{ marginTop: 6, height: 8, background: LINE }}>
                  <div style={{ height: 8, width: `${Math.max(4, (r.bytes / max) * 100)}%`, background: GREEN }} />
                </div>
                <div style={{ marginTop: 8, fontSize: 22, color: FG }}>{r.bytes.toLocaleString()} B</div>

                <div style={{ marginTop: 18, fontSize: 13, lineHeight: 1.55, color: DIM, wordBreak: "break-all", height: 62, overflow: "hidden" }}>
                  {r.sig ? `σ = 0x${r.sig.slice(0, 84)}…` : "σ = signing…"}
                </div>
                <div style={{ marginTop: 14, fontSize: 15 }}>
                  {r.ok === null ? (
                    <span style={{ color: DIM }}>[ .. ] verifying</span>
                  ) : (
                    <>
                      <span style={{ color: r.ok ? GREEN : "#f2555a" }}>{r.ok ? "[ OK ]" : "[FAIL]"}</span> <span style={{ color: FG }}>verified</span>
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ position: "absolute", inset: 0, backgroundImage: NOISE, opacity: 0.14, mixBlendMode: "overlay", pointerEvents: "none" }} />
    </div>
  );
}
