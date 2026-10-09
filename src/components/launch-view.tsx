"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { bytesToHex } from "@noble/hashes/utils.js";
import { Keypair, VersionedTransaction } from "@solana/web3.js";
import {
  ArrowRight,
  Check,
  Lock,
  Circle,
  ImagePlus,
  Loader2,
  X,
} from "lucide-react";
import { fromBase64, toBase64 } from "@/lib/b64";
import { cn, coinPath, short } from "@/lib/format";
import { deriveMintKeypair } from "@/lib/pq/derive";
import { launchDigest } from "@/lib/pq/messages";
import { SCHEMES, SCHEME_IDS, schemeSign, type SchemeId } from "@/lib/pq/schemes";
import { discoverVaults } from "@/lib/vault/app";
import { PairIcon, PairPicker, SOL_PAIR, useSwapEstimate, type Pair } from "./pair-picker";
import { CoinCard } from "./coin-card";
import { DigestGrid } from "./digest-grid";
import { useIdentity } from "./identity";
import { GatedButton } from "./unlock";
import { BigToggle, Panel, Pill } from "./ui";

type VaultTarget = { index: number; address: string; pkHash: string };

function stepsFor(scheme: SchemeId, leaf: number, bound: boolean, vault: VaultTarget | null, swapTo: string | null) {
  const name = SCHEMES[scheme].name;
  const head =
    scheme === "wots"
      ? [`Derive mint keypair from leaf #${leaf}`, `Sign attestation with WOTS leaf #${leaf}`]
      : [bound ? `Load ${name} key (certified by your root)` : `Certify ${name} key with WOTS leaf #${leaf}`, `Sign attestation with ${name}`];
  if (swapTo) {
    return [
      ...head,
      `Build · swap SOL → ${swapTo} via Jupiter, then create${vault ? ` · dev buy → vault #${vault.index}` : ""}`,
      "Approve both transactions in wallet",
      `Broadcast swap, then launch`,
    ];
  }
  if (vault) {
    return [...head, `Build transaction · dev buy → vault #${vault.index}`, "Approve in wallet", "Broadcast · dev buy lands in your vault"];
  }
  return [...head, "Verify, pin metadata, build transaction", "Approve in wallet", "Broadcast & confirm"];
}
const STEP_COUNT = 5;

type StepState = "idle" | "active" | "done" | "error";

export function LaunchView() {
  return (
    <div className="mx-auto w-full min-w-0 max-w-6xl px-4 py-10">
      <div className="mb-8">
        <h1 className="font-serif text-[28px] font-bold tracking-tight">Launch a Post-Quantum Coin</h1>
        <p className="mt-2 max-w-2xl text-[13.5px] leading-relaxed text-muted">
          Your coin goes live on the pump.fun bonding curve. Its mint address is derived from one of your one-time keys, and
          that key signs the coin&apos;s identity: a provenance proof that verifies with SHA-256 alone.
        </p>
      </div>
      <LaunchForm />
    </div>
  );
}

function LaunchForm() {
  const { unlocked, wallet, nextLeaf, signWithLeaf, signTransaction, signAllTransactions, refresh, schemeKeys, ensureSchemeKey } = useIdentity();
  const [pair, setPair] = useState<Pair>(SOL_PAIR);
  const [scheme, setScheme] = useState<SchemeId>("wots");
  const [quantum, setQuantum] = useState(false);
  const [vault, setVault] = useState<VaultTarget | null>(null);
  const [vaultError, setVaultError] = useState<string | null>(null);
  const [mintNonce, setMintNonce] = useState(0);
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [description, setDescription] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [localImage, setLocalImage] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [twitter, setTwitter] = useState("");
  const [devBuy, setDevBuy] = useState("0");
  const [steps, setSteps] = useState<StepState[]>(Array(STEP_COUNT).fill("idle"));
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ mint: string; signature: string; status: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const leaf = nextLeaf;
  const bound = scheme !== "wots" && schemeKeys.some((k) => k.scheme === scheme);
  const devBuyValue = Number(devBuy);
  const tokenPair = pair.category !== "sol";
  const swapping = tokenPair && devBuyValue > 0;
  const STEPS = stepsFor(scheme, leaf, bound, quantum ? vault : null, swapping ? pair.symbol : null);
  const swap = useSwapEstimate(pair, swapping ? devBuyValue : 0);

  // Quantum mode needs the creator's current vault: the first one that isn't spent.
  useEffect(() => {
    if (!quantum || !unlocked) return;
    let cancelled = false;
    setVaultError(null);
    discoverVaults({ skSeed: unlocked.skSeed, pubSeed: unlocked.pubSeed })
      .then(({ current }) => {
        if (!cancelled) setVault({ index: current.index, address: current.key.address.toBase58(), pkHash: bytesToHex(current.key.pkHash) });
      })
      .catch((err) => !cancelled && setVaultError(err instanceof Error ? err.message : "Could not find your vault"));
    return () => {
      cancelled = true;
    };
  }, [quantum, unlocked]);

  function chooseMode(next: boolean) {
    setQuantum(next);
    setError(null);
    if (next) {
      // Hash-based end to end: the same WOTS family signs the coin and guards the vault.
      setScheme("wots");
      if (!(Number(devBuy) > 0)) setDevBuy("0.1");
    }
  }
  // WOTS launches derive the mint from their one-time leaf; many-time schemes burn no leaf, so they use a fresh keypair.
  const mintKeypair = useMemo(() => {
    if (!unlocked) return null;
    return scheme === "wots" ? deriveMintKeypair(unlocked.skSeed, leaf) : Keypair.generate();
    // mintNonce forces a fresh keypair after each non-WOTS launch attempt
  }, [unlocked, leaf, scheme, mintNonce]);
  const mint = mintKeypair?.publicKey.toBase58() ?? "";

  // Shown live even before connecting, so the attestation preview reacts to every keystroke.
  const digest = useMemo(
    () => launchDigest({ mint, creator: wallet ?? "", name: name.trim(), symbol: symbol.trim(), image: image ?? "", leaf, scheme }),
    [mint, wallet, name, symbol, image, leaf, scheme],
  );

  const running = steps.some((s) => s === "active");
  const devBuyNum = Number(devBuy);
  const valid =
    name.trim().length > 0 &&
    name.trim().length <= 32 &&
    /^[A-Za-z0-9]{1,10}$/.test(symbol.trim()) &&
    Boolean(image) &&
    Number.isFinite(devBuyNum) &&
    devBuyNum >= 0 &&
    devBuyNum <= 50 &&
    (!quantum || (devBuyNum > 0 && Boolean(vault))) &&
    !(pair.category !== "sol" && devBuyNum > 0 && !swap.estimate);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    setLocalImage(URL.createObjectURL(file));
    setImage(null);
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Upload failed");
      setImage(json.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
      setLocalImage(null);
    } finally {
      setUploading(false);
    }
  }

  function mark(i: number, state: StepState) {
    setSteps((prev) => prev.map((s, j) => (j === i ? state : j < i && state === "active" ? "done" : s)));
  }

  async function launch() {
    if (!unlocked || !wallet || !mintKeypair || !image || !digest) return;
    setError(null);
    setResult(null);
    setSteps(Array(STEP_COUNT).fill("idle"));
    let current = 0;
    try {
      mark((current = 0), "active");
      let attestation: unknown;
      if (scheme === "wots") {
        await tick();
        mark((current = 1), "active");
        await tick();
        attestation = signWithLeaf(digest, leaf);
      } else {
        const keys = await ensureSchemeKey(scheme);
        mark((current = 1), "active");
        await tick();
        attestation = { signature: await schemeSign(scheme, digest, keys.secretKey) };
      }

      mark((current = 2), "active");
      const prep = await fetch("/api/launch/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wallet,
          mint,
          name: name.trim(),
          symbol: symbol.trim(),
          description,
          image,
          twitter,
          devBuySol: devBuyNum,
          scheme,
          attestation,
          ...(quantum && vault ? { vault: vault.address, vaultHash: vault.pkHash } : {}),
          ...(tokenPair ? { quoteMint: pair.mint } : {}),
        }),
      }).then((r) => r.json());
      if (prep.error) throw new Error(prep.error);
      // The leaf is burned server-side the moment prepare succeeds.
      void refresh();

      mark((current = 3), "active");
      const txs = ((prep.transactions as string[] | undefined) ?? [prep.transaction as string]).map((b) => VersionedTransaction.deserialize(fromBase64(b)));
      // The launch (last) is signed by the mint first; wallets leave existing signatures intact.
      txs[txs.length - 1].sign([mintKeypair]);
      const signed = txs.length > 1 ? await signAllTransactions(txs) : [await signTransaction(txs[0])];

      mark((current = 4), "active");
      const submit = await fetch("/api/launch/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mint, signedTransactions: signed.map((t) => toBase64(t.serialize())) }),
      }).then((r) => r.json());
      if (submit.error) throw new Error(submit.error);

      setSteps(Array(STEP_COUNT).fill("done"));
      setResult({ mint, signature: submit.signature, status: submit.status });
      router.push(coinPath(mint, quantum));
    } catch (err) {
      mark(current, "error");
      setError(err instanceof Error ? err.message : "Launch failed");
      if (scheme !== "wots") setMintNonce((n) => n + 1);
    }
  }


  if (result) {
    return (
      <Panel className="fade-up mx-auto flex max-w-xl flex-col items-center px-6 py-14 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full border border-up/40 bg-up/10 text-up">
          <Check size={20} />
        </div>
        <h2 className="mt-4 font-serif text-[22px] font-bold">${symbol} is live</h2>
        <p className="mt-2 text-[13px] text-muted">
          {result.status === "live" ? "Confirmed on Solana." : "Broadcast; confirmation pending."} Signed by leaf #{leaf} of{" "}
          <span className="font-mono">{short(unlocked?.pqAddress ?? "", 6, 4)}</span>.
        </p>
        <div className="mt-5 w-full rounded-xl border border-line bg-bg p-3 text-left font-mono text-[11.5px] text-muted">
          <div className="flex justify-between gap-3"><span className="text-dim">mint</span>{short(result.mint, 10, 8)}</div>
          <div className="mt-1 flex justify-between gap-3"><span className="text-dim">tx</span>{short(result.signature, 10, 8)}</div>
        </div>
        <div className="mt-6 flex gap-2">
          <Link href={coinPath(result.mint, quantum)} className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-fg px-4 py-2 text-[13px] font-medium text-bg hover:bg-white">
            View coin
          </Link>
          <a href={`https://solscan.io/tx/${result.signature}`} target="_blank" rel="noreferrer" className="inline-flex cursor-pointer items-center rounded-xl border border-line px-4 py-2 text-[13px] hover:border-line-strong hover:bg-surface-2">
            Solscan
          </a>
        </div>
      </Panel>
    );
  }

  return (
    <div className="grid w-full min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)]">
      <Panel className="min-w-0 p-6">
        <ModeToggle quantum={quantum} onChange={chooseMode} disabled={running} />

        <div className="mt-6 grid min-w-0 gap-5 border-t border-line pt-6 sm:grid-cols-[140px_minmax(0,1fr)]">
          <div>
            <Label>Image</Label>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                void onFile(e.dataTransfer.files?.[0]);
              }}
              className="group relative flex aspect-square w-full cursor-pointer items-center justify-center overflow-hidden rounded-xl border border-dashed border-line-strong bg-bg transition-colors hover:border-fg"
            >
              {localImage ? (
                <img src={localImage} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="flex flex-col items-center gap-2 text-[11.5px] text-dim group-hover:text-muted">
                  <ImagePlus size={20} />
                  Drop or click
                </span>
              )}
              {uploading && (
                <span className="absolute inset-0 flex items-center justify-center bg-bg/70">
                  <Loader2 size={18} className="animate-spin" />
                </span>
              )}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="hidden"
              onChange={(e) => void onFile(e.target.files?.[0])}
            />
            <p className="mt-2 text-[11px] text-dim">{image ? "Pinned to IPFS" : "PNG, JPG, WEBP, GIF · 5 MB"}</p>
          </div>

          <div className="space-y-4">
            <div className="grid min-w-0 gap-4 sm:grid-cols-[minmax(0,1fr)_140px]">
              <div>
                <Label>Name</Label>
                <Input value={name} onChange={setName} placeholder="Bunker Coin" maxLength={32} />
              </div>
              <div>
                <Label>Ticker</Label>
                <Input
                  value={symbol}
                  onChange={(v) => setSymbol(v.replace(/[^A-Za-z0-9]/g, ""))}
                  placeholder="BNKR"
                  maxLength={10}
                  mono
                />
              </div>
            </div>
            <div>
              <Label>Description</Label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={500}
                rows={4}
                placeholder="What is this coin about?"
                className="w-full resize-none rounded-xl border border-line bg-bg px-3 py-2 text-[13px] outline-none placeholder:text-dim focus:border-line-strong"
              />
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-4 border-t border-line pt-5 sm:grid-cols-2">
          <div>
            <Label>X / Twitter (optional)</Label>
            <Input value={twitter} onChange={setTwitter} placeholder="https://x.com/…" />
          </div>
          <div>
            <Label>Website</Label>
            <div
              title="Every coin links to its quantum page, so the attestation is one click from any explorer."
              className="flex h-10 items-center gap-2 overflow-hidden rounded-xl border border-line bg-surface-2 px-3 font-mono text-[12px] text-muted"
            >
              <Lock size={12} className="shrink-0 text-dim" />
              <span className="truncate">quantum/coin/{quantum ? "q/" : ""}{mint ? short(mint, 6, 6) : "<mint>"}</span>
            </div>
          </div>
        </div>

        <div className="mt-6 border-t border-line pt-5">
          <Label>Signature scheme</Label>
          {quantum ? (
            <div className="flex items-start gap-3 border border-line bg-bg px-3 py-3">
              <Lock size={14} className="mt-0.5 shrink-0 text-muted" />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[13px] font-medium text-fg">WOTS + Merkle</span>
                  <span className="font-mono text-[10.5px] text-dim">hash-based · SHA-256 only</span>
                </div>
                <p className="mt-1 text-[11.5px] leading-relaxed text-muted">
                  Locked for quantum launches: the coin is signed by the same hash-based family that guards your vault. No lattices,
                  no curves, one assumption.
                </p>
              </div>
            </div>
          ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {SCHEME_IDS.map((id) => {
              const s = SCHEMES[id];
              const on = scheme === id;
              const isBound = id !== "wots" && schemeKeys.some((k) => k.scheme === id);
              return (
                <button
                  key={id}
                  type="button"
                  disabled={running}
                  onClick={() => setScheme(id)}
                  className={cn(
                    "cursor-pointer border px-3 py-2.5 text-left transition-colors",
                    on ? "border-up/70 bg-up/[0.06]" : "border-line bg-bg hover:border-line-strong",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[13px] font-medium text-fg">{s.name}</span>
                    <span className="font-mono text-[10.5px] text-dim">{s.standard}</span>
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-2 font-mono text-[11px]">
                    <span className="text-muted">
                      {s.aka} · {s.family}
                    </span>
                    <span className="text-dim">{s.sigBytes.toLocaleString()} B</span>
                  </div>
                  {id === "wots" ? (
                    <div className="mt-1 font-mono text-[10.5px] text-dim">burns one leaf per launch</div>
                  ) : (
                    <div className={cn("mt-1 font-mono text-[10.5px]", isBound ? "text-up" : "text-dim")}>
                      {isBound ? "key certified by your root" : "first use certifies the key (one leaf)"}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
          )}
        </div>

        <div className="mt-6 border-t border-line pt-5">
          <div className="mb-1.5 flex items-center justify-between gap-3">
            <label className="text-[12px] font-medium text-muted">Pair with</label>
            <span className="flex min-w-0 items-center gap-1.5 font-mono text-[11.5px] text-dim">
              <PairIcon pair={pair} size={16} />
              <span className="truncate">
                ${symbol || "TICKER"} / <span className="text-fg">{pair.symbol}</span>
              </span>
            </span>
          </div>
          <PairPicker value={pair} onChange={setPair} disabled={running} />
          <p className="mt-2 text-[11.5px] text-dim">
            {tokenPair
              ? `Your coin trades against ${pair.symbol} on pump.fun. You still pay in SOL: it's swapped for you.`
              : "Your coin trades against SOL, the pump.fun default. Pick a stock or token to pair with it instead."}
          </p>
        </div>

        <div className="mt-6 border-t border-line pt-5">
          <Label>{quantum ? "Dev buy (SOL) → quantum vault" : "Dev buy (SOL)"}</Label>
          <div className="flex flex-wrap items-center gap-2">
            <div className="w-32">
              <Input value={devBuy} onChange={(v) => setDevBuy(v.replace(/[^0-9.]/g, ""))} placeholder="0" mono />
            </div>
            {(quantum ? ["0.1", "0.5", "1", "2"] : ["0", "0.1", "0.5", "1", "2"]).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setDevBuy(v)}
                className={cn(
                  "cursor-pointer rounded-xl border px-2.5 py-1.5 font-mono text-[12px] transition-colors",
                  devBuy === v ? "border-fg bg-fg text-bg" : "border-line text-muted hover:border-line-strong hover:text-fg",
                )}
              >
                {v}
              </button>
            ))}
          </div>
          {swapping && <SwapPreview pair={pair} sol={devBuyValue} {...swap} />}
          {quantum ? (
            <VaultDestination vault={vault} error={vaultError} unlocked={Boolean(unlocked)} />
          ) : swapping ? null : (
            <p className="mt-2 text-[11.5px] text-dim">Bought in the same transaction as the create, so nobody can front-run you.</p>
          )}
        </div>

        <div className="mt-6 border-t border-line pt-5">
          <ol className="space-y-2">
            {STEPS.map((label, i) => (
              <li key={label} className="flex items-center gap-2.5 text-[12.5px]">
                <StepIcon state={steps[i]} />
                <span className={cn(steps[i] === "idle" ? "text-dim" : steps[i] === "error" ? "text-down" : "text-fg")}>
                  {label}
                </span>
              </li>
            ))}
          </ol>
          {error && <p className="mt-4 break-words text-[12.5px] text-down [overflow-wrap:anywhere]">{error}</p>}
          <GatedButton className="mt-5 w-full min-w-0 max-w-full whitespace-normal text-center" disabled={!valid || uploading} busy={running} onClick={() => void launch()}>
            {running
              ? "Launching…"
              : quantum
                ? `Quantum launch ${symbol ? `${symbol}` : "coin"}${devBuyNum > 0 ? ` · ${devBuyNum} SOL${swapping ? ` → ${pair.symbol}` : ""} into vault` : ""}`
                : `Launch ${symbol ? `${symbol}` : "coin"}${tokenPair ? ` / ${pair.symbol}` : ""}${devBuyNum > 0 ? ` · buy ${devBuyNum} SOL${swapping ? ` → ${pair.symbol}` : ""}` : ""}`}
          </GatedButton>
          <p className="mt-2 text-center text-[11px] text-dim">
            pump.fun charges ~0.02 SOL in rent and fees.
          </p>
        </div>
      </Panel>

      <aside className="min-w-0 space-y-4">
        {quantum && <QuantumChecklist leaf={leaf} vault={vault} hardened={Boolean(unlocked?.hardened)} devBuy={devBuyNum} />}
        <div>
          <div className="mb-2 text-[11px] uppercase tracking-wider text-dim">Preview</div>
          <CoinCard
            preview
            launch={{
              mint,
              name: name || "Your coin",
              symbol: symbol || "TICKER",
              image_url: localImage,
              leaf_index: leaf,
              scheme,
              digest,
              dev_vault: quantum ? (vault?.address ?? "pending") : null,
              quote_symbol: tokenPair ? pair.symbol : null,
              quote_image: tokenPair ? pair.image : null,
            }}
            market={{ price: null, change24h: null, marketCap: null, volume24h: null, holders: null, curve: null, indexed: true }}
          />
        </div>

        <Panel className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-dim">
              Attestation
            </span>
            <Pill tone="up">{scheme === "wots" ? `leaf #${leaf}` : SCHEMES[scheme].name}</Pill>
          </div>
          <dl className="space-y-2 font-mono text-[11px]">
            <KV k="scheme" v={`${SCHEMES[scheme].name} · ${SCHEMES[scheme].standard}`} />
            <KV k="signature" v={`${SCHEMES[scheme].sigBytes.toLocaleString()} B`} />
            <KV k={scheme === "wots" ? "mint (derived)" : "mint (fresh)"} v={mint ? short(mint, 8, 6) : "unlock to derive"} />
            <KV k="signer" v={unlocked ? short(unlocked.pqAddress, 8, 6) : "your PQ address"} />
            <KV k="digest" v={short(bytesToHex(digest), 10, 8)} />
          </dl>
          <DigestGrid digest={digest} className="mt-3" />
          <p className="mt-3 text-[11px] leading-relaxed text-dim">
            The digest covers mint, creator, name, ticker, image and {scheme === "wots" ? "leaf index" : "scheme"}. Shown as 67
            base-16 digits, the coin&apos;s fingerprint. Change any field and watch it move.
          </p>
        </Panel>
      </aside>
    </div>
  );
}


function ModeToggle({ quantum, onChange, disabled }: { quantum: boolean; onChange: (q: boolean) => void; disabled?: boolean }) {
  return (
    <div>
      <Label>Launch mode</Label>
      <BigToggle
        label="Launch mode"
        value={quantum ? "quantum" : "standard"}
        onChange={(v) => onChange(v === "quantum")}
        disabled={disabled}
        options={[
          { value: "standard", label: "Standard", sub: "PQ provenance · dev buy to your wallet" },
          { value: "quantum", label: "Quantum", sub: "Hash-based only · dev buy into your vault" },
        ]}
      />
    </div>
  );
}

function SwapPreview({
  pair,
  sol,
  estimate,
  error,
  loading,
}: {
  pair: Pair;
  sol: number;
  estimate: { out: number; minOut: number; priceImpactPct: number; route: string[] } | null;
  error: string | null;
  loading: boolean;
}) {
  const fmt = (n: number) => n.toLocaleString("en-US", { maximumSignificantDigits: 6 });
  return (
    <div className="mt-3 border border-line bg-bg p-3 font-mono text-[11.5px] leading-relaxed">
      {error ? (
        <span className="text-down">[ ERR ] {error}</span>
      ) : !estimate ? (
        <span className="text-dim">
          {loading && <Loader2 size={11} className="mr-1.5 inline animate-spin" />}
          finding the best SOL → {pair.symbol} route…
        </span>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-muted">
              {sol} SOL <ArrowRight size={11} className="text-dim" />
              <PairIcon pair={pair} size={14} />
              <span className="text-fg">≈ {fmt(estimate.out)} {pair.symbol}</span>
            </span>
            <span className="text-dim">via Jupiter{estimate.route.length ? ` · ${estimate.route.join(" › ")}` : ""}</span>
          </div>
          <div className="mt-1 text-dim">
            min {fmt(estimate.minOut)} {pair.symbol} · impact {estimate.priceImpactPct < 0.01 ? "<0.01" : estimate.priceImpactPct.toFixed(2)}% · the dev buy spends exactly the
            guaranteed minimum
          </div>
          <div className="mt-1 text-dim">one approval · the swap confirms first, then the launch goes out</div>
        </>
      )}
    </div>
  );
}

function VaultDestination({ vault, error, unlocked }: { vault: VaultTarget | null; error: string | null; unlocked: boolean }) {
  return (
    <div className="mt-3 border border-line bg-[#0b0a0a] p-3 font-mono text-[11.5px] leading-relaxed">
      {error ? (
        <span className="text-down">[ ERR ] {error}</span>
      ) : !unlocked ? (
        <span className="text-dim">unlock your identity to locate your vault</span>
      ) : !vault ? (
        <span className="text-dim">
          <Loader2 size={11} className="mr-1.5 inline animate-spin" />
          locating your quantum vault…
        </span>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-muted">
              destination <span className="text-fg">vault #{vault.index}</span> {short(vault.address, 6, 6)}
            </span>
            <Link href="/vault" className="cursor-pointer text-dim hover:text-fg">
              open vault <ArrowRight size={10} className="inline" />
            </Link>
          </div>
          <div className="mt-1 text-dim">
            pump.fun buys the tokens, and the same transaction moves every one of them into your vault. They never rest under an
            ed25519 key.
          </div>
        </>
      )}
    </div>
  );
}

function QuantumChecklist({ leaf, vault, hardened, devBuy }: { leaf: number; vault: VaultTarget | null; hardened: boolean; devBuy: number }) {
  const rows: { ok: boolean | "warn"; label: string; sub: string }[] = [
    { ok: true, label: "Hash-based provenance", sub: `WOTS leaf #${leaf} signs mint, name, ticker, image` },
    { ok: true, label: "Mint from a one-time key", sub: "The mint address is derived from the same leaf" },
    { ok: devBuy > 0 && Boolean(vault), label: "Dev buy in your quantum vault", sub: vault ? `${devBuy || 0} SOL of tokens → vault #${vault.index}` : "Locating vault…" },
    { ok: true, label: "Spendable only by WOTS", sub: "The vault program verifies the signature on-chain" },
    {
      ok: hardened ? true : "warn",
      label: hardened ? "Hardened identity" : "Wallet-only identity",
      sub: hardened ? "Keys don’t depend on ed25519 alone" : "Vault keys re-derivable from your wallet key",
    },
  ];
  return (
    <Panel className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-wider text-dim">Quantum launch</span>
        <span className="font-mono text-[11px] text-muted">hash-based</span>
      </div>
      <ul className="space-y-2.5">
        {rows.map((r) => (
          <li key={r.label} className="flex items-start gap-2.5">
            <span className={cn("mt-0.5 font-mono text-[11px]", r.ok === true ? "text-up" : r.ok === "warn" ? "text-warn" : "text-dim")}>
              {r.ok === true ? "[✓]" : r.ok === "warn" ? "[!]" : "[ ]"}
            </span>
            <div className="min-w-0">
              <div className="text-[12.5px] text-fg">{r.label}</div>
              <div className="text-[11px] text-dim">{r.sub}</div>
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function StepIcon({ state }: { state: StepState }) {
  if (state === "active") return <Loader2 size={14} className="animate-spin text-fg" />;
  if (state === "done") return <Check size={14} className="text-up" />;
  if (state === "error") return <X size={14} className="text-down" />;
  return <Circle size={14} className="text-dim" />;
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-dim">{k}</dt>
      <dd className="text-muted">{v}</dd>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <label className="mb-1.5 block text-[12px] font-medium text-muted">{children}</label>;
}

function Input({
  value,
  onChange,
  placeholder,
  maxLength,
  mono,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  maxLength?: number;
  mono?: boolean;
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      maxLength={maxLength}
      className={cn(
        "h-10 w-full rounded-xl border border-line bg-bg px-3 text-[13px] outline-none placeholder:text-dim focus:border-line-strong",
        mono && "font-mono",
      )}
    />
  );
}

const tick = () => new Promise((r) => setTimeout(r, 120));
