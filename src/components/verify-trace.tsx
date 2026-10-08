"use client";

import { useEffect, useState } from "react";
import { Check, CornerLeftUp, CornerRightUp, X } from "lucide-react";
import type { VerifyTrace } from "@/lib/pq/xmss";
import { cn, short } from "@/lib/format";
import { SCHEMES } from "@/lib/pq/scheme-info";
import type { LaunchVerification } from "@/lib/pq/verify-launch";
import { Panel } from "./ui";

/** Replays a verification step by step: digits → chains → leaf → Merkle climb → root. */
export function VerifyTraceView({ trace, digest, leaf, title }: { trace: VerifyTrace; digest: string; leaf: number; title?: string }) {
  const total = 4 + trace.path.length;
  const [shown, setShown] = useState(0);

  useEffect(() => {
    setShown(0);
    const id = setInterval(() => setShown((s) => (s >= total ? s : s + 1)), 180);
    return () => clearInterval(id);
  }, [trace, total]);

  const remaining = trace.digits.reduce((acc, d) => acc + (15 - d), 0);
  const done = shown >= total;

  return (
    <Panel className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-line px-5 py-3">
        <span className="text-[11px] uppercase tracking-wider text-dim">{title ?? "Verification trace"}</span>
        {done && (
          <span className={cn("flex items-center gap-1.5 text-[12px] font-medium", trace.valid ? "text-up" : "text-down")}>
            {trace.valid ? <Check size={13} /> : <X size={13} />}
            {trace.valid ? "Valid" : "Invalid"}
          </span>
        )}
      </div>

      {trace.error ? (
        <p className="p-5 text-[12.5px] text-down">{trace.error}</p>
      ) : (
        <ol className="divide-y divide-line/60 font-mono text-[11.5px]">
          <Step visible={shown > 0} n={1} title="Message digest → 64 digits + 3 checksum">
            <div className="text-muted">{short(digest, 16, 16)}</div>
            <div className="mt-2 grid gap-[2px]" style={{ gridTemplateColumns: "repeat(34, minmax(0, 1fr))" }}>
              {trace.digits.map((v, i) => (
                <div key={i} title={`${v}`} className={cn("h-2.5 rounded-[1px]", i >= 64 ? "bg-warn" : "bg-up")} style={{ opacity: 0.12 + (v / 15) * 0.88 }} />
              ))}
            </div>
          </Step>
          <Step visible={shown > 1} n={2} title={`Finish 67 hash chains (${remaining.toLocaleString()} SHA-256 calls)`}>
            <div className="text-muted">Each chain i is walked from step dᵢ to 15, rebuilding the one-time public key.</div>
          </Step>
          <Step visible={shown > 2} n={3} title={`Compress into leaf #${leaf}`}>
            <div className="text-fg">{short(trace.leafHash, 16, 16)}</div>
          </Step>
          {trace.path.map((p, i) => (
            <Step key={p.height} visible={shown > 3 + i} n={4 + i} title={`Level ${p.height} · node ${p.index}`}>
              <div className="flex items-center gap-2 text-muted">
                {p.side === "L" ? <CornerLeftUp size={12} /> : <CornerRightUp size={12} />}
                <span className="text-dim">sibling</span> {short(p.sibling, 8, 6)}
                <span className="text-dim">→</span>
                <span className="text-fg">{short(p.node, 8, 6)}</span>
              </div>
            </Step>
          ))}
          <Step visible={done} n={total} title="Compare with registered root">
            <div className="grid gap-1">
              <div className="flex gap-2"><span className="w-20 text-dim">computed</span><span className={trace.valid ? "text-up" : "text-down"}>{short(trace.computedRoot, 16, 16)}</span></div>
              <div className="flex gap-2"><span className="w-20 text-dim">expected</span><span className="text-muted">{short(trace.expectedRoot, 16, 16)}</span></div>
            </div>
          </Step>
        </ol>
      )}
    </Panel>
  );
}

function Step({ visible, n, title, children }: { visible: boolean; n: number; title: string; children: React.ReactNode }) {
  return (
    <li className={cn("flex gap-4 px-5 py-3 transition-opacity duration-300", visible ? "opacity-100" : "opacity-15")}>
      <span className="w-5 shrink-0 text-dim">{String(n).padStart(2, "0")}</span>
      <div className="min-w-0 flex-1">
        <div className="mb-1 font-sans text-[12px] text-fg">{title}</div>
        {children}
      </div>
    </li>
  );
}

/** WOTS launches show the hash trace; scheme launches show the certificate chain plus the certificate's trace. */
export function LaunchVerificationView({ v, title }: { v: LaunchVerification; title?: string }) {
  if (v.kind === "wots") return <VerifyTraceView trace={v.trace} digest={v.digest} leaf={v.leaf} title={title} />;
  const info = SCHEMES[v.scheme];
  const rows = [
    {
      ok: v.certificate.valid,
      title: `Key certificate · WOTS leaf #${v.leaf}`,
      body: `Your hash-based root signed the ${info.name} public key (${v.publicKeyBytes.toLocaleString()} B).`,
    },
    {
      ok: v.signatureValid,
      title: `${info.name} signature · ${info.standard}`,
      body: `${v.signatureBytes.toLocaleString()} B ${info.aka} signature over the launch digest ${short(v.digest, 8, 8)}.`,
    },
  ];
  return (
    <div className="space-y-4">
      <Panel className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <span className="text-[11px] uppercase tracking-wider text-dim">{title ?? "Verification"}</span>
          <span className={cn("flex items-center gap-1.5 text-[12px] font-medium", v.valid ? "text-up" : "text-down")}>
            {v.valid ? <Check size={13} /> : <X size={13} />}
            {v.valid ? "Valid" : "Invalid"}
          </span>
        </div>
        <ol className="divide-y divide-line/60">
          {rows.map((r, i) => (
            <li key={r.title} className="flex gap-4 px-5 py-3">
              <span className="w-5 shrink-0 font-mono text-[11.5px] text-dim">{String(i + 1).padStart(2, "0")}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-[12.5px] text-fg">
                  {r.title}
                  {r.ok ? <Check size={12} className="text-up" /> : <X size={12} className="text-down" />}
                </div>
                <div className="mt-0.5 font-mono text-[11.5px] text-muted">{r.body}</div>
              </div>
            </li>
          ))}
        </ol>
      </Panel>
      <VerifyTraceView trace={v.certificate} digest={v.certificateDigest} leaf={v.leaf} title="Certificate trace · WOTS → root" />
    </div>
  );
}
