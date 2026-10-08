"use client";

import { useEffect, useState, type ReactNode } from "react";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, concatBytes, utf8ToBytes } from "@noble/hashes/utils.js";
import { launchDigest } from "@/lib/pq/messages";
import { SCHEMES, SCHEME_IDS_V1, SCHEME_IDS_V2, deriveSchemeKeys, schemeSign, schemeVerify, type SchemeId } from "@/lib/pq/schemes";
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

/**
 * Real signatures over one launch digest. Some schemes cost up to ~1 s of CPU,
 * so nothing runs during render or SSR: work starts after mount, one scheme
 * per macrotask, and each result is cached for the page's lifetime.
 */
const cache = new Map<SchemeId, Promise<Row>>();

async function signOne(id: SchemeId): Promise<Row> {
  const skSeed = sha256(utf8ToBytes("pqc.market/brand/schemes"));
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

function useSignatures(ids: SchemeId[]): Row[] {
  const [rows, setRows] = useState<Row[]>(() => ids.map((id) => ({ id, sig: null, bytes: SCHEMES[id].sigBytes, ok: null })));
  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (const id of ids) {
        await new Promise((r) => setTimeout(r, 50)); // let the page paint between schemes
        if (cancelled) return;
        if (!cache.has(id)) cache.set(id, signOne(id));
        const row = await cache.get(id)!;
        if (!cancelled) setRows((prev) => prev.map((r) => (r.id === id ? row : r)));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ids]);
  return rows;
}

function SchemesGraphic({ ids, tag, headline, subtitle, footer }: { ids: SchemeId[]; tag: string; headline: ReactNode; subtitle: string; footer?: string }) {
  const rows = useSignatures(ids);
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
        <span style={{ fontFamily: MONO, fontSize: 18, color: GREEN }}>● {tag}</span>
      </div>

      <div style={{ position: "absolute", left: 96, right: 96, top: 175 }}>
        <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 76, lineHeight: 1.08, letterSpacing: -1.5 }}>{headline}</div>
        <div style={{ marginTop: 20, fontSize: 24, color: MUTED }}>{subtitle}</div>
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
                <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: s.name.length > 14 ? 24 : 30, letterSpacing: -0.6, color: FG, whiteSpace: "nowrap", lineHeight: "36px" }}>
                  {s.name}
                </div>
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

      {footer && (
        <div style={{ position: "absolute", left: 96, right: 96, bottom: 56, fontFamily: MONO, fontSize: 16, color: DIM }}>{footer}</div>
      )}

      <div style={{ position: "absolute", inset: 0, backgroundImage: NOISE, opacity: 0.14, mixBlendMode: "overlay", pointerEvents: "none" }} />
    </div>
  );
}

export function SchemesTweet() {
  return (
    <SchemesGraphic
      ids={SCHEME_IDS_V1}
      tag="new · signature schemes"
      headline={
        <>
          Choose how your coin is <span style={{ fontStyle: "italic", color: GREEN, whiteSpace: "nowrap" }}>signed</span>.
        </>
      }
      subtitle="Four post-quantum schemes. One identity. Every key certified by your hash-based root."
    />
  );
}

export function MoreSchemesTweet() {
  return (
    <SchemesGraphic
      ids={SCHEME_IDS_V2}
      tag="new · four more schemes"
      headline={
        <>
          Four more ways to <span style={{ fontStyle: "italic", color: GREEN, whiteSpace: "nowrap" }}>sign</span>.
        </>
      }
      subtitle="Dilithium at level 5, SPHINCS+ on SHA-3, Falcon-1024, and an ed25519 + ML-DSA hybrid where both signatures must verify."
      footer="also available: WOTS + Merkle · ML-DSA-65 · SLH-DSA-128s · Falcon-512 — eight schemes, one identity"
    />
  );
}
