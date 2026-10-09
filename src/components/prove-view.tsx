"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { bytesToHex } from "@noble/hashes/utils.js";
import { Check, Clock, Fingerprint, Loader2, Search, ShieldCheck, X } from "lucide-react";
import { proofDigest } from "@/lib/pq/messages";
import { SCHEMES, isSchemeId } from "@/lib/pq/scheme-info";
import { verifyLaunch, type LaunchVerification } from "@/lib/pq/verify-launch";
import type { VerifyTrace } from "@/lib/pq/xmss";
import { cn, short, thumb } from "@/lib/format";
import { useIdentity } from "./identity";
import { GatedButton } from "./unlock";
import { LaunchVerificationView, VerifyTraceView } from "./verify-trace";
import { Button, Panel, Pill, Segmented } from "./ui";

type Tab = "identity" | "coin";

export function ProveView() {
  const params = useSearchParams();
  const initialMint = params.get("mint") ?? "";
  const [tab, setTab] = useState<Tab>(initialMint ? "coin" : "identity");

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-serif text-[28px] font-bold tracking-tight">Prove &amp; Verify</h1>
          <p className="mt-2 max-w-xl text-[13.5px] leading-relaxed text-muted">
            Checks that use nothing but SHA-256. No elliptic curve is consulted, so they keep working after one falls.
          </p>
        </div>
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: "identity", label: "Prove identity" },
            { value: "coin", label: "Verify a coin" },
          ]}
        />
      </div>
      {tab === "identity" ? (
        <ProveIdentity />
      ) : (
        <VerifyCoin initialMint={initialMint} />
      )}
    </div>
  );
}

type Challenge = { id: string; nonce: string; expiresAt: string; nextLeaf: number };

function ProveIdentity() {
  const { wallet, unlocked, signWithLeaf, refresh } = useIdentity();
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [busy, setBusy] = useState<"challenge" | "sign" | null>(null);
  const [result, setResult] = useState<{ verified: boolean; trace: VerifyTrace; digest: string; leaf: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  async function requestChallenge() {
    setError(null);
    setResult(null);
    setBusy("challenge");
    try {
      const res = await fetch("/api/prove/challenge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet }),
      }).then((r) => r.json());
      if (res.error) throw new Error(res.error);
      setChallenge(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not get a challenge");
    } finally {
      setBusy(null);
    }
  }

  async function signChallenge() {
    if (!challenge || !wallet) return;
    setError(null);
    setBusy("sign");
    try {
      const leaf = challenge.nextLeaf;
      const digest = proofDigest({ nonce: challenge.nonce, wallet, leaf });
      const signature = signWithLeaf(digest, leaf);
      const res = await fetch("/api/prove/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challengeId: challenge.id, wallet, signature }),
      }).then((r) => r.json());
      if (res.error) throw new Error(res.error);
      setResult({ verified: res.verified, trace: res.trace, digest: bytesToHex(digest), leaf });
      setChallenge(null);
      void refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Proof failed");
    } finally {
      setBusy(null);
    }
  }

  const secondsLeft = challenge ? Math.max(0, Math.floor((new Date(challenge.expiresAt).getTime() - now) / 1000)) : 0;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
      <div className="space-y-4">
        <Panel className="p-6">
          <Stage n={1} title="Server issues a random challenge" done={Boolean(challenge || result)}>
            {challenge ? (
              <div className="mt-3 space-y-1.5 rounded-xl border border-line bg-bg p-3 font-mono text-[11px]">
                <div className="flex justify-between gap-3"><span className="text-dim">nonce</span><span className="text-muted">{short(challenge.nonce, 12, 10)}</span></div>
                <div className="flex justify-between gap-3"><span className="text-dim">leaf</span><span className="text-muted">#{challenge.nextLeaf}</span></div>
                <div className="flex justify-between gap-3">
                  <span className="text-dim">expires</span>
                  <span className={cn(secondsLeft < 30 ? "text-warn" : "text-muted", "flex items-center gap-1")}>
                    {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, "0")}
                  </span>
                </div>
              </div>
            ) : (
              <GatedButton className="mt-3" onClick={() => void requestChallenge()} busy={busy === "challenge"} disabled={busy !== null}>
                Request challenge
              </GatedButton>
            )}
          </Stage>
          <Stage n={2} title="Sign it with your next one-time key" done={Boolean(result)}>
            <p className="mt-1 text-[12px] text-muted">
              Signed locally with WOTS. Your wallet is not asked to sign anything.
            </p>
            {challenge && (
              <Button variant="primary" className="mt-3" onClick={() => void signChallenge()} disabled={busy !== null || secondsLeft === 0}>
                {busy === "sign" && <Loader2 size={14} className="animate-spin" />}
                Sign with leaf #{challenge.nextLeaf}
              </Button>
            )}
          </Stage>
          <Stage n={3} title="Server verifies against your registered root" done={Boolean(result?.verified)} last>
            <p className="mt-1 text-[12px] text-muted">The leaf is then burned in the ledger and can never sign again.</p>
          </Stage>
          {error && <p className="mt-4 text-[12.5px] text-down">{error}</p>}
        </Panel>

        {result && (
          <Panel className={cn("fade-up flex items-center gap-3 p-5", result.verified ? "border-up/30" : "border-down/30")}>
            <div className={cn("flex h-9 w-9 items-center justify-center rounded-full", result.verified ? "bg-up/10 text-up" : "bg-down/10 text-down")}>
              {result.verified ? <Check size={16} /> : <X size={16} />}
            </div>
            <div className="flex-1">
              <div className="text-[13.5px] font-medium">{result.verified ? "Possession proven" : "Proof rejected"}</div>
              <div className="font-mono text-[11.5px] text-muted">
                {short(unlocked?.pqAddress ?? "", 8, 6)} · leaf #{result.leaf}
              </div>
            </div>
            <Button size="sm" onClick={() => void requestChallenge()}>Again</Button>
          </Panel>
        )}
      </div>

      {result ? (
        <VerifyTraceView trace={result.trace} digest={result.digest} leaf={result.leaf} title="Server verification trace" />
      ) : (
        <Panel className="flex min-h-[320px] flex-col items-center justify-center p-8 text-center">
                    <p className="mt-3 max-w-xs text-[12.5px] leading-relaxed text-muted">
            The verification trace will replay here: 67 hash chains, one leaf, eight Merkle levels, one root.
          </p>
        </Panel>
      )}
    </div>
  );
}

function Stage({ n, title, done, last, children }: { n: number; title: string; done: boolean; last?: boolean; children: React.ReactNode }) {
  return (
    <div className="relative flex gap-4 pb-6 last:pb-0">
      {!last && <span className="absolute left-[11px] top-7 h-[calc(100%-28px)] w-px bg-line" />}
      <span
        className={cn(
          "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border font-mono text-[11px]",
          done ? "border-up/50 bg-up/10 text-up" : "border-line text-muted",
        )}
      >
        {done ? <Check size={12} /> : n}
      </span>
      <div className="min-w-0 flex-1 pt-0.5">
        <div className="text-[13.5px] font-medium">{title}</div>
        {children}
      </div>
    </div>
  );
}

type CoinPayload = {
  launch: {
    mint: string;
    name: string;
    symbol: string;
    image_url: string;
    creator: string;
    leaf_index: number | null;
    scheme: string;
    message_hash: string;
    metadata_uri: string | null;
    attestation: unknown;
  };
  identity: { pq_address: string; root: string; pub_seed: string; height: number; anchor_tx: string | null };
};

function VerifyCoin({ initialMint }: { initialMint: string }) {
  const [mint, setMint] = useState(initialMint);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<CoinPayload | null>(null);
  const [verification, setVerification] = useState<LaunchVerification | null>(null);
  const [ipfs, setIpfs] = useState<"checking" | "match" | "mismatch" | "unreachable" | null>(null);

  async function run(target: string) {
    if (!target) return;
    setLoading(true);
    setError(null);
    setData(null);
    setVerification(null);
    setIpfs(null);
    try {
      const res = await fetch(`/api/token/${target.trim()}`).then((r) => r.json());
      if (res.error) throw new Error(res.error);
      const payload = res as CoinPayload;
      setData(payload);
      const { launch, identity } = payload;
      // Recompute the digest independently from public fields; don't trust message_hash.
      setVerification(await verifyLaunch(launch, identity));
      const att = launch.attestation as { wots?: string; signature?: string };
      const sigKey = att.wots ?? att.signature;
      if (launch.metadata_uri) {
        setIpfs("checking");
        fetch(launch.metadata_uri)
          .then((r) => r.json())
          .then((meta) => {
            const pinned = meta?.pqc?.signature ?? {};
            setIpfs((pinned.wots ?? pinned.signature) === sigKey && meta?.pqc?.root === identity.root ? "match" : "mismatch");
          })
          .catch(() => setIpfs("unreachable"));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lookup failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (initialMint) void run(initialMint);
  }, [initialMint]);

  return (
    <div className="space-y-6">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void run(mint);
        }}
        className="flex"
      >
        <input
          value={mint}
          onChange={(e) => setMint(e.target.value)}
          placeholder="Paste a quantum mint address…"
          className="h-10 flex-1 rounded-l-[3px] border border-r-0 border-line bg-surface px-3 font-mono text-[12.5px] outline-none placeholder:font-sans placeholder:text-dim focus:border-line-strong"
        />
        <button type="submit" className="flex h-10 cursor-pointer items-center gap-1.5 rounded-r-[3px] bg-fg px-4 text-[13px] font-medium text-bg hover:bg-white">
          {loading && <Loader2 size={14} className="animate-spin" />} Verify
        </button>
      </form>
      {error && <p className="text-[12.5px] text-down">{error}</p>}

      {data && verification && (
        <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
          <Panel className="p-6">
            <div className="flex items-center gap-3">
              <img src={thumb(data.launch.image_url, 96)} alt="" className="h-12 w-12 rounded-xl border border-line object-cover" />
              <div>
                <Link href={`/coin/${data.launch.mint}`} className="cursor-pointer text-[15px] font-semibold hover:underline">
                  {data.launch.name}
                </Link>
                <div className="font-mono text-[11.5px] text-muted">${data.launch.symbol}</div>
              </div>
            </div>
            <dl className="mt-5 space-y-2 font-mono text-[11.5px]">
              <Row k="mint" v={short(data.launch.mint, 10, 8)} />
              <Row k="creator" v={short(data.launch.creator, 8, 6)} />
              <Row k="signer" v={short(data.identity.pq_address, 8, 6)} />
              <Row k="scheme" v={SCHEMES[isSchemeId(data.launch.scheme) ? data.launch.scheme : "wots"].name} />
              <Row k="leaf" v={`#${verification.leaf}${verification.kind === "scheme" ? " (certificate)" : ""}`} />
              <Row k="root" v={short(data.identity.root, 10, 8)} />
            </dl>
            <div className="mt-5 flex flex-wrap gap-1.5">
              <Pill tone={verification.valid ? "up" : "down"}>
                {verification.valid ? <Check size={10} /> : <X size={10} />} {verification.kind === "scheme" ? `${SCHEMES[verification.scheme].name} + certificate` : "WOTS signature"}
              </Pill>
              <Pill tone={ipfs === "match" ? "up" : ipfs === "mismatch" ? "down" : "neutral"}>
                {ipfs === "checking" ? <Loader2 size={10} className="animate-spin" /> : ipfs === "match" ? <Check size={10} /> : null}
                IPFS metadata {ipfs === "match" ? "matches" : ipfs === "mismatch" ? "differs" : ipfs === "unreachable" ? "unreachable" : ""}
              </Pill>
              <Pill tone={data.identity.anchor_tx ? "up" : "neutral"}>root {data.identity.anchor_tx ? "anchored" : "not anchored"}</Pill>
            </div>
            <p className="mt-5 text-[11.5px] leading-relaxed text-dim">
              The digest is rebuilt in your browser from the coin&apos;s public fields, then checked against the creator&apos;s
              registered root. The server&apos;s word is not taken for anything.
            </p>
          </Panel>
          <LaunchVerificationView v={verification} title="Client-side verification" />
        </div>
      )}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-dim">{k}</dt>
      <dd className="text-muted">{v}</dd>
    </div>
  );
}
