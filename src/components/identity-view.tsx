"use client";

import Link from "next/link";
import { useState } from "react";
import { VersionedTransaction } from "@solana/web3.js";
import { Anchor, ArrowUpRight, Check, Fingerprint, KeyRound, Loader2, Lock, LockOpen, ShieldCheck } from "lucide-react";
import { anchorMemo } from "@/lib/pq/messages";
import { fromBase64, toBase64 } from "@/lib/b64";
import { ago, cn, short } from "@/lib/format";
import { useIdentity } from "./identity";
import { KeyGrid, KeyLegend } from "./key-grid";
import { UnlockPanel } from "./unlock";
import { Button, ButtonLink, CopyText, Panel, Pill } from "./ui";

export function IdentityView() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <div className="mb-8">
        <h1 className="font-serif text-[28px] font-bold tracking-tight">Post-Quantum Identity</h1>
        <p className="mt-2 max-w-2xl text-[13.5px] leading-relaxed text-muted">
          A hash-based keypair that lives behind your Solana wallet. Its public key is a single Merkle root; its address is a
          hash of that root. Like a never-spent Bitcoin address, nothing about it is exposed until you sign, and every key
          signs exactly once.
        </p>
      </div>
      <IdentityBody />
    </div>
  );
}

function IdentityBody() {
  const { unlocked } = useIdentity();
  return unlocked ? <IdentityDetails /> : <UnlockPanel />;
}

function IdentityDetails() {
  const { unlocked, remote, leaves, nextLeaf, register, lock, refresh, signTransaction, wallet } = useIdentity();
  const [registering, setRegistering] = useState(false);
  const [anchoring, setAnchoring] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!unlocked) return null;
  const registered = Boolean(remote);
  const total = 1 << unlocked.tree.height;

  async function doRegister() {
    if (!unlocked) return;
    setError(null);
    setRegistering(true);
    try {
      await register(unlocked);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setRegistering(false);
    }
  }

  async function doAnchor() {
    setError(null);
    setAnchoring(true);
    try {
      const prep = await fetch("/api/identity/anchor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet, action: "prepare" }),
      }).then((r) => r.json());
      if (prep.error) throw new Error(prep.error);
      const tx = VersionedTransaction.deserialize(fromBase64(prep.transaction));
      const signed = await signTransaction(tx);
      const res = await fetch("/api/identity/anchor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wallet,
          action: "submit",
          signedTransaction: toBase64(signed.serialize()),
        }),
      }).then((r) => r.json());
      if (res.error) throw new Error(res.error);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Anchor failed");
    } finally {
      setAnchoring(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <div className="space-y-6">
        <Panel className="p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-[11px] uppercase tracking-wider text-dim">PQ address</div>
              <CopyText value={unlocked.pqAddress} className="mt-1 block break-all text-left text-[18px] text-fg sm:text-[20px]" />
            </div>
            <div className="flex gap-1.5">
              {registered ? <Pill tone="up"><Check size={10} /> registered</Pill> : <Pill tone="warn">not registered</Pill>}
              {unlocked.hardened ? <Pill tone="up">hardened</Pill> : <Pill tone="warn">wallet-only</Pill>}
              {remote?.anchor_tx && <Pill>anchored</Pill>}
            </div>
          </div>

          <dl className="mt-6 grid gap-3 text-[12.5px] sm:grid-cols-2">
            <Field label="Merkle root" value={unlocked.root} />
            <Field label="Public seed" value={unlocked.pubSeedHex} />
            <Field label="Wallet (ed25519)" value={unlocked.wallet} />
            <Field label="Scheme" value="WOTS(w=16, SHA-256) + Merkle(h=8)" plain />
          </dl>
        </Panel>

        {!registered && (
          <Panel className="p-6">
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-dim">
              Step 2 · Register
            </div>
            <h3 className="mt-2 font-serif text-[18px] font-bold">Bind this root to your wallet</h3>
            <p className="mt-2 text-[13px] leading-relaxed text-muted">
              You sign one registration statement twice: once with your wallet (ed25519) and once with leaf 0 of your new tree
              (WOTS). The server checks both, so the binding holds in both directions.
            </p>
            <Button variant="primary" className="mt-5" onClick={() => void doRegister()} disabled={registering}>
              {registering && <Loader2 size={14} className="animate-spin" />}
              {registering ? "Signing…" : "Sign & register identity"}
            </Button>
          </Panel>
        )}

        {registered && !remote?.anchor_tx && (
          <Panel className="p-6">
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-dim">
              Step 3 · Anchor (optional)
            </div>
            <h3 className="mt-2 font-serif text-[18px] font-bold">Timestamp your root on Solana</h3>
            <p className="mt-2 text-[13px] leading-relaxed text-muted">
              A memo transaction signed by your wallet, written <em>before</em> any curve break, proves this root was yours
              while ed25519 was still trustworthy. Costs a fraction of a cent.
            </p>
            <pre className="mt-4 overflow-x-auto rounded-xl border border-line bg-bg p-3 font-mono text-[11px] text-muted">
              {anchorMemo(unlocked.pqAddress, unlocked.root)}
            </pre>
            <Button className="mt-4" onClick={() => void doAnchor()} disabled={anchoring}>
              {anchoring && <Loader2 size={14} className="animate-spin" />}
              {anchoring ? "Anchoring…" : "Anchor on-chain"}
            </Button>
          </Panel>
        )}

        {registered && remote?.anchor_tx && (
          <Panel className="flex flex-wrap items-center justify-between gap-3 p-5">
            <div className="flex items-center gap-3">
                            <div>
                <div className="text-[13px] font-medium">Anchored on Solana</div>
                <div className="font-mono text-[11.5px] text-muted">{ago(remote.anchored_at)}</div>
              </div>
            </div>
            <a
              href={`https://solscan.io/tx/${remote.anchor_tx}`}
              target="_blank"
              rel="noreferrer"
              className="flex cursor-pointer items-center gap-1 font-mono text-[12px] text-muted hover:text-fg"
            >
              {short(remote.anchor_tx, 8, 8)} <ArrowUpRight size={12} />
            </a>
          </Panel>
        )}

        {error && <p className="text-[12.5px] text-down">{error}</p>}

        {registered && (
          <div className="grid gap-3 sm:grid-cols-2">
            <ButtonLink href="/launch" variant="primary">Launch a PQ coin</ButtonLink>
            <ButtonLink href="/prove">Prove key possession</ButtonLink>
          </div>
        )}
      </div>

      <aside className="space-y-4">
        <Panel className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-[11px] uppercase tracking-wider text-dim">One-time keys</span>
            <span className="font-mono text-[11.5px] text-muted">
              {leaves.length}/{total} used
            </span>
          </div>
          <KeyGrid leaves={leaves} next={registered ? nextLeaf : 0} />
          <div className="mt-4"><KeyLegend /></div>
          <p className="mt-4 text-[11.5px] leading-relaxed text-dim">
            A WOTS key that signs twice leaks enough of its chains to forge. The server ledger refuses any leaf already
            burned, so every launch and proof consumes a fresh one.
          </p>
        </Panel>
        <Panel className="flex items-center justify-between p-4">
          <span className="flex items-center gap-2 text-[12.5px] text-up">
            Unlocked in this tab
          </span>
          <button onClick={lock} className="cursor-pointer text-[12px] text-muted underline-offset-2 hover:text-fg hover:underline">
            Lock now
          </button>
        </Panel>
        {leaves.length > 0 && (
          <Panel className="p-5">
            <div className="mb-3 text-[11px] uppercase tracking-wider text-dim">Signature log</div>
            <ul className="space-y-2 text-[12px]">
              {[...leaves].reverse().slice(0, 8).map((l) => (
                <li key={l.leaf_index} className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2">
                    <span className={cn("h-1.5 w-1.5 rounded-full", l.purpose === "launch" ? "bg-up" : l.purpose === "genesis" ? "bg-fg" : "bg-up/50")} />
                    <span className="font-mono text-muted">#{l.leaf_index}</span>
                    {l.purpose === "launch" && l.ref ? (
                      <Link href={`/coin/${l.ref}`} className="cursor-pointer hover:underline">launch</Link>
                    ) : (
                      <span>{l.purpose}</span>
                    )}
                  </span>
                  <span className="font-mono text-dim">{ago(l.used_at)}</span>
                </li>
              ))}
            </ul>
          </Panel>
        )}
      </aside>
    </div>
  );
}

function Field({ label, value, plain }: { label: string; value: string; plain?: boolean }) {
  return (
    <div className="min-w-0 rounded-xl border border-line bg-bg p-3">
      <dt className="text-[11px] text-dim">{label}</dt>
      <dd className="mt-1 truncate text-muted">
        {plain ? <span className="font-mono text-[12px]">{value}</span> : <CopyText value={value} display={short(value, 14, 10)} className="text-[12px]" />}
      </dd>
    </div>
  );
}
