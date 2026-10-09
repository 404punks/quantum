"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ed25519 } from "@noble/curves/ed25519.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, randomBytes, utf8ToBytes } from "@noble/hashes/utils.js";
import { VersionedTransaction } from "@solana/web3.js";
import bs58 from "bs58";
import { ArrowRight, ArrowUpRight, Check, Copy, Loader2, X } from "lucide-react";
import { fromBase64, toBase64 } from "@/lib/b64";
import { ago, cn, short } from "@/lib/format";
import { deriveVaultKeypair } from "@/lib/pq/derive";
import { transferDigest, walletStatement } from "@/lib/pq/messages";
import { SCHEMES, SCHEME_IDS, schemeSign, type SchemeId } from "@/lib/pq/schemes";
import { verifyTransfer, type LaunchVerification } from "@/lib/pq/verify-launch";
import { DigestGrid } from "./digest-grid";
import { useIdentity } from "./identity";
import { GatedButton } from "./unlock";
import { LaunchVerificationView } from "./verify-trace";
import { Button, ButtonLink, CopyText, Panel, Pill, Segmented, Skeleton } from "./ui";

type Wallet = { id: string; index: number; address: string; label: string | null; status: "active" | "retired"; created_at: string; retired_at: string | null };
type Transfer = {
  id: string;
  wallet_id: string;
  from_address: string;
  to_address: string;
  mint: string;
  amount_raw: string;
  scheme: string;
  attestation: unknown;
  message_hash: string;
  nonce: string;
  memo: string;
  tx_signature: string | null;
  status: "pending" | "confirmed" | "failed";
  created_at: string;
};
type TokenBalance = { mint: string; programId: string; amountRaw: string; decimals: number; uiAmount: number; symbol: string | null; name: string | null };
type Balance = { address: string; lamports: number; sol: number; tokens: TokenBalance[] };
type Tab = "receive" | "send" | "rotate";

const post = (url: string, body: unknown) =>
  fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(async (r) => {
    const j = await r.json();
    if (!r.ok) throw new Error(j.error ?? "Request failed");
    return j;
  });

const sol = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 4 });

/** Visual fingerprint of an address, same 67-cell grid as the coin attestations. */
export function AddressPrint({ address, className, cellClass = "h-2" }: { address: string; className?: string; cellClass?: string }) {
  const d = useMemo(() => sha256(utf8ToBytes(`pqc.market/wallet-print/${address}`)), [address]);
  return <DigestGrid digest={d} className={className} cellClass={cellClass} />;
}

export function WalletView() {
  const { unlocked } = useIdentity();
  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <div className="mb-8">
        <h1 className="font-serif text-[28px] font-bold tracking-tight">Post-Quantum Wallets</h1>
        <p className="mt-2 max-w-2xl text-[13.5px] leading-relaxed text-muted">
          Unlimited wallets derived from your post-quantum identity. Their keys are never stored: they are re-derived in this tab
          when you unlock. Every transfer is signed twice, by the wallet for Solana and by one of your post-quantum keys, and that
          second signature is recorded on-chain.
        </p>
      </div>
      {unlocked ? <WalletBody /> : <Locked />}
    </div>
  );
}

/** Unlocking lives on the Identity page; it persists for the tab, then sends people back here. */
function Locked() {
  const { connected, remote } = useIdentity();
  return (
    <Panel className="flex flex-col items-center px-6 py-14 text-center">
      <div className="font-mono text-[11px] uppercase tracking-wider text-dim">{connected && remote ? "keys locked" : "identity required"}</div>
      <h2 className="mt-3 font-serif text-[22px] font-bold">Your wallets open with your post-quantum identity</h2>
      <p className="mt-2 max-w-md text-[13px] leading-relaxed text-muted">
        {connected && remote
          ? "Unlock your keys on the Identity page. You’ll come straight back here, and they stay unlocked while this tab is open."
          : "Wallets are derived from your post-quantum identity. Set it up on the Identity page and you’ll be brought back here."}
      </p>
      <ButtonLink href="/identity?next=/wallet" variant="primary" className="mt-6">
        {connected && remote ? "Unlock on Identity" : "Go to Identity"}
      </ButtonLink>
    </Panel>
  );
}

function Field({ label, value, mono = true }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="min-w-0 rounded-xl border border-line bg-bg p-3">
      <dt className="text-[11px] text-dim">{label}</dt>
      <dd className={cn("mt-1 truncate text-[12.5px] text-muted", mono && "font-mono")}>{value}</dd>
    </div>
  );
}

function StatusRow({ tone, label, value }: { tone: "up" | "warn" | "off"; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3">
      <span
        className={cn(
          "mt-1 h-2 w-2 shrink-0 rounded-full",
          tone === "up" && "bg-up shadow-[0_0_8px_rgba(63,185,80,0.6)]",
          tone === "warn" && "bg-warn shadow-[0_0_8px_rgba(227,179,65,0.5)]",
          tone === "off" && "border border-line-strong bg-surface-3",
        )}
      />
      <div className="min-w-0">
        <div className="text-[12.5px] text-fg">{label}</div>
        <div className="text-[11.5px] text-dim">{value}</div>
      </div>
    </div>
  );
}

function WalletBody() {
  const { wallet, unlocked, remote, nextLeaf, signWithLeaf, ensureSchemeKey, schemeKeys, refresh, lock } = useIdentity();
  const [wallets, setWallets] = useState<Wallet[] | null>(null);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [balances, setBalances] = useState<Record<string, Balance>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!wallet) return;
    const j = await fetch(`/api/wallet?wallet=${wallet}`, { cache: "no-store" }).then((r) => r.json());
    setWallets(j.wallets ?? []);
    setTransfers(j.transfers ?? []);
  }, [wallet]);

  useEffect(() => {
    setWallets(null);
    setTransfers([]);
    setBalances({});
    if (wallet) void load();
  }, [wallet, load]);

  const addresses = useMemo(() => (wallets ?? []).map((w) => w.address).join(","), [wallets]);
  useEffect(() => {
    if (!addresses) return;
    let cancelled = false;
    const tick = () =>
      fetch(`/api/wallet/balances?addresses=${addresses}`)
        .then((r) => r.json())
        .then((j) => !cancelled && j.balances && setBalances(j.balances))
        .catch(() => {});
    void tick();
    const id = setInterval(tick, 20_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [addresses]);

  const active = (wallets ?? []).filter((w) => w.status === "active");
  const retired = (wallets ?? []).filter((w) => w.status !== "active");
  const current = active.find((w) => w.address === selected) ?? active[0] ?? null;
  const totalSol = active.reduce((s, w) => s + (balances[w.address]?.sol ?? 0), 0);
  const loaded = active.every((w) => balances[w.address]);
  const tokenCount = new Set(active.flatMap((w) => balances[w.address]?.tokens.map((t) => t.mint) ?? [])).size;
  const confirmed = transfers.filter((t) => t.status === "confirmed");
  const bound = schemeKeys.map((k) => k.scheme);

  async function attest(scheme: SchemeId, base: { from: string; to: string; mint: string; amount: string; nonce: string }) {
    if (scheme === "wots") {
      const leaf = nextLeaf;
      return signWithLeaf(transferDigest({ ...base, leaf }), leaf);
    }
    const keys = await ensureSchemeKey(scheme);
    return { signature: await schemeSign(scheme, transferDigest({ ...base, scheme }), keys.secretKey) };
  }

  async function createWallet(label?: string): Promise<Wallet> {
    if (!unlocked || !wallet) throw new Error("Unlock first");
    const index = (wallets ?? []).reduce((m, w) => Math.max(m, w.index + 1), 0);
    const kp = deriveVaultKeypair(unlocked.skSeed, index);
    const address = kp.publicKey.toBase58();
    const proof = bs58.encode(ed25519.sign(utf8ToBytes(walletStatement({ pqAddress: unlocked.pqAddress, index, address })), kp.secretKey.slice(0, 32)));
    const j = await post("/api/wallet/create", { wallet, index, address, label: label ?? `Wallet ${index + 1}`, proof });
    await load();
    return j.wallet;
  }

  async function transfer(p: { from: Wallet; to: string; mint: string; amountRaw: string; scheme: SchemeId }) {
    if (!unlocked || !wallet) throw new Error("Unlock first");
    const nonce = bytesToHex(randomBytes(16));
    const base = { from: p.from.address, to: p.to, mint: p.mint, amount: p.amountRaw, nonce };
    const attestation = await attest(p.scheme, base);
    const prep = await post("/api/wallet/transfer/prepare", { wallet, ...base, amountRaw: p.amountRaw, scheme: p.scheme, attestation });
    void refresh(); // a WOTS leaf was burned
    const tx = VersionedTransaction.deserialize(fromBase64(prep.transaction));
    tx.sign([deriveVaultKeypair(unlocked.skSeed, p.from.index)]);
    const res = await post("/api/wallet/transfer/submit", { id: prep.id, signedTransaction: toBase64(tx.serialize()) });
    await load();
    return res as { signature: string; status: string };
  }

  async function run(key: string, fn: () => Promise<string | void>) {
    setBusy(key);
    setError(null);
    setNotice(null);
    try {
      const msg = await fn();
      if (msg) setNotice(msg);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(null);
    }
  }

  const newWallet = () =>
    run("create", async () => {
      const w = await createWallet();
      setSelected(w.address);
      return `Wallet #${w.index} derived · ${short(w.address, 6, 6)}`;
    });

  if (!remote) {
    return (
      <Panel className="flex flex-col items-center px-6 py-14 text-center">
        <h2 className="font-serif text-[20px] font-bold">Register your identity first</h2>
        <p className="mt-2 max-w-md text-[13px] text-muted">Wallets are derived from a registered post-quantum identity, so the transfers they sign can be verified against its root.</p>
        <ButtonLink href="/identity" variant="primary" className="mt-6">
          Go to Identity
        </ButtonLink>
      </Panel>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <div className="min-w-0 space-y-6">
        {/* Overview */}
        <Panel className="p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-[11px] uppercase tracking-wider text-dim">Total across active wallets</div>
              <div className="mt-1 flex items-baseline gap-2">
                {wallets === null || (active.length > 0 && !loaded) ? (
                  <Skeleton className="h-9 w-40" />
                ) : (
                  <>
                    <span className="font-serif text-[36px] font-bold leading-none">{sol(totalSol)}</span>
                    <span className="font-mono text-[14px] text-muted">SOL</span>
                  </>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Pill tone="up">
                <Check size={10} /> pq-attested
              </Pill>
              {remote.passphrase_hardened ? <Pill tone="up">hardened</Pill> : <Pill tone="warn">wallet-only</Pill>}
              {remote.anchor_tx && <Pill>anchored</Pill>}
            </div>
          </div>
          <dl className="mt-6 grid gap-3 text-[12.5px] sm:grid-cols-4">
            <Field label="Active wallets" value={wallets === null ? "…" : active.length} />
            <Field label="Rotated" value={wallets === null ? "…" : retired.length} />
            <Field label="Tokens held" value={tokenCount} />
            <Field label="Transfers" value={confirmed.length} />
          </dl>
        </Panel>

        {(error || notice) && (
          <div className={cn("rounded-xl border px-4 py-2.5 font-mono text-[12px]", error ? "border-down/40 text-down" : "border-up/40 text-up")}>
            {error ? `[ ERR ] ${error}` : `[ OK ] ${notice}`}
          </div>
        )}

        {/* Wallet list */}
        <Panel className="p-6">
          <div className="flex items-center justify-between gap-3">
            <div className="text-[11px] uppercase tracking-wider text-dim">Your wallets</div>
            <Button size="sm" variant="primary" onClick={() => void newWallet()} disabled={busy !== null}>
              {busy === "create" && <Loader2 size={12} className="animate-spin" />}
              New wallet
            </Button>
          </div>
          {wallets === null ? (
            <div className="mt-4 space-y-2">
              <Skeleton className="h-16" />
              <Skeleton className="h-16" />
            </div>
          ) : wallets.length === 0 ? (
            <div className="mt-4 rounded-xl border border-dashed border-line-strong px-5 py-8 text-center">
              <p className="text-[13px] text-muted">No wallets yet. Derive your first one; it costs nothing until you fund it.</p>
              <Button variant="primary" className="mt-4" onClick={() => void newWallet()} disabled={busy !== null}>
                {busy === "create" && <Loader2 size={14} className="animate-spin" />}
                Derive wallet #0
              </Button>
            </div>
          ) : (
            <div className="mt-4 space-y-2">
              {[...active, ...retired].map((w) => {
                const b = balances[w.address];
                const live = w.status === "active";
                const on = live && current?.address === w.address;
                return (
                  <button
                    key={w.id}
                    onClick={() => live && setSelected(w.address)}
                    disabled={!live}
                    className={cn(
                      "grid w-full cursor-pointer grid-cols-[auto_1fr_auto] items-center gap-4 rounded-xl border p-3 text-left transition-colors disabled:cursor-default",
                      on ? "border-up/60 bg-up/[0.05]" : "border-line bg-bg hover:border-line-strong",
                      !live && "opacity-45",
                    )}
                  >
                    <div className="w-24">
                      <AddressPrint address={w.address} cellClass="h-1" className="!gap-[1.5px]" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-[13.5px] font-medium">{w.label ?? `Wallet ${w.index + 1}`}</span>
                        <span className="font-mono text-[11px] text-dim">#{w.index}</span>
                        {!live && <Pill>rotated</Pill>}
                      </div>
                      <div className="mt-0.5 font-mono text-[11.5px] text-muted">{short(w.address, 8, 8)}</div>
                    </div>
                    <div className="text-right font-mono">
                      <div className="text-[14px] text-fg">{b ? `${sol(b.sol)} SOL` : live ? <Skeleton className="ml-auto h-4 w-16" /> : "—"}</div>
                      {b && b.tokens.length > 0 && <div className="text-[11px] text-dim">+{b.tokens.length} token{b.tokens.length > 1 ? "s" : ""}</div>}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </Panel>

        {current && (
          <WalletDetail
            key={current.address}
            w={current}
            balance={balances[current.address]}
            busy={busy}
            schemeKeys={bound}
            onSend={(p) => run("send", async () => `Sent · tx ${short((await transfer({ from: current, ...p })).signature, 8, 8)}`)}
            onRotate={(scheme) =>
              run("rotate", async () => {
                const next = await createWallet(`${current.label ?? "Wallet"} · rotated`);
                const res = await transfer({ from: current, to: next.address, mint: "ALL", amountRaw: "ALL", scheme });
                setSelected(next.address);
                return `Rotated into wallet #${next.index} · tx ${short(res.signature, 8, 8)}`;
              })
            }
          />
        )}

        <TransferLog transfers={transfers} identity={remote} />
      </div>

      <aside className="space-y-4">
        <Panel className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-[11px] uppercase tracking-wider text-dim">Selected wallet</span>
            {current && <span className="font-mono text-[11.5px] text-muted">#{current.index}</span>}
          </div>
          {current ? (
            <>
              <AddressPrint address={current.address} cellClass="h-3" />
              <dl className="mt-4 space-y-2 font-mono text-[11.5px]">
                <KV k="address" v={<CopyText value={current.address} display={short(current.address, 6, 6)} />} />
                <KV k="derivation" v={`wallet/v1 · ${current.index}`} />
                <KV k="key stored" v="nowhere" />
                <KV k="created" v={ago(current.created_at)} />
              </dl>
            </>
          ) : (
            <p className="text-[12px] text-dim">Derive a wallet to see its fingerprint.</p>
          )}
        </Panel>

        <Panel className="p-5">
          <div className="mb-4 text-[11px] uppercase tracking-wider text-dim">Protection</div>
          <div className="space-y-3.5">
            <StatusRow tone="up" label="Post-quantum attestation" value="Every transfer, recorded in the memo" />
            <StatusRow tone="up" label="Keys never stored" value="Re-derived from your identity on unlock" />
            <StatusRow tone="warn" label="Chain enforces ed25519" value="These wallets are guarded by their ed25519 key" />
            <StatusRow tone="up" label="On-chain vault program" value="Live: funds only a WOTS signature can move" />
          </div>
          <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1">
            <Link href="/vault" className="inline-block cursor-pointer text-[12px] text-up underline-offset-2 hover:underline">
              Open the quantum vault →
            </Link>
            <Link href="/docs#wallets" className="inline-block cursor-pointer text-[12px] text-muted underline-offset-2 hover:text-fg hover:underline">
              What this protects →
            </Link>
          </div>
        </Panel>

        <Panel className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-[11px] uppercase tracking-wider text-dim">Signing schemes</span>
            <span className="font-mono text-[11.5px] text-muted">{bound.length + 1}/8 ready</span>
          </div>
          <ul className="space-y-1.5 text-[12px]">
            {SCHEME_IDS.map((id) => {
              const ready = id === "wots" || bound.includes(id);
              return (
                <li key={id} className="flex items-center justify-between gap-2">
                  <span className={ready ? "text-fg" : "text-muted"}>{SCHEMES[id].name}</span>
                  <span className={cn("font-mono text-[11px]", ready ? "text-up" : "text-dim")}>{ready ? (id === "wots" ? "root" : "certified") : "on first use"}</span>
                </li>
              );
            })}
          </ul>
        </Panel>

        <Panel className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-[11px] uppercase tracking-wider text-dim">One-time keys</span>
            <span className="font-mono text-[11.5px] text-muted">next #{nextLeaf}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-surface-3">
            <div className="h-full bg-up" style={{ width: `${(nextLeaf / (1 << (remote.height ?? 8))) * 100}%` }} />
          </div>
          <p className="mt-3 text-[11.5px] leading-relaxed text-dim">
            WOTS transfers burn one leaf each. The NIST schemes burn a leaf only once, to certify the key.
          </p>
        </Panel>

        <Panel className="flex items-center justify-between p-4">
          <span className="text-[12.5px] text-up">Unlocked in this tab</span>
          <button onClick={lock} className="cursor-pointer text-[12px] text-muted underline-offset-2 hover:text-fg hover:underline">
            Lock now
          </button>
        </Panel>
      </aside>
    </div>
  );
}

function KV({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-dim">{k}</dt>
      <dd className="text-muted">{v}</dd>
    </div>
  );
}

function WalletDetail({
  w,
  balance,
  busy,
  schemeKeys,
  onSend,
  onRotate,
}: {
  w: Wallet;
  balance?: Balance;
  busy: string | null;
  schemeKeys: string[];
  onSend: (p: { to: string; mint: string; amountRaw: string; scheme: SchemeId }) => void;
  onRotate: (scheme: SchemeId) => void;
}) {
  const [tab, setTab] = useState<Tab>("receive");
  const [scheme, setScheme] = useState<SchemeId>("wots");
  const [copied, setCopied] = useState(false);

  return (
    <div className="rounded-xl border border-line bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
        <div className="min-w-0">
          <div className="truncate font-serif text-[20px] font-bold">{w.label ?? `Wallet ${w.index + 1}`}</div>
          <div className="mt-0.5 font-mono text-[11.5px] text-dim">
            index #{w.index} · derived {ago(w.created_at)}
          </div>
        </div>
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: "receive", label: "Receive" },
            { value: "send", label: "Send" },
            { value: "rotate", label: "Rotate" },
          ]}
        />
      </div>

      <div className="p-5">
        {tab === "receive" && (
          <div className="grid min-w-0 gap-5 [&>*]:min-w-0">
            <div>
              <div className="font-mono text-[11px] uppercase tracking-wider text-dim">Deposit address</div>
              <button
                onClick={() => {
                  void navigator.clipboard?.writeText(w.address);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1200);
                }}
                className="group mt-2 flex w-full cursor-pointer items-center justify-between gap-3 border border-line bg-bg px-4 py-3 text-left transition-colors hover:border-line-strong"
              >
                <span className="break-all font-mono text-[13.5px] text-fg">{w.address}</span>
                <span className="shrink-0 text-muted group-hover:text-fg">{copied ? <Check size={14} className="text-up" /> : <Copy size={14} />}</span>
              </button>
              <div className="mt-2 flex items-center justify-between text-[11.5px] text-dim">
                <span>SOL and any SPL / Token-2022 token.</span>
                <a href={`https://solscan.io/account/${w.address}`} target="_blank" rel="noreferrer" className="flex cursor-pointer items-center gap-1 hover:text-fg">
                  Solscan <ArrowUpRight size={11} />
                </a>
              </div>

              <div className="mt-6 font-mono text-[11px] uppercase tracking-wider text-dim">Holdings</div>
              <div className="mt-2 divide-y divide-line border border-line">
                <Row left="SOL" right={balance ? sol(balance.sol) : "…"} />
                {balance?.tokens.map((t) => (
                  <Row key={t.mint} left={t.symbol ? `$${t.symbol}` : short(t.mint, 4, 4)} sub={t.name ?? undefined} right={t.uiAmount.toLocaleString("en-US", { maximumFractionDigits: 4 })} />
                ))}
              </div>
            </div>
            <div>
              <div className="font-mono text-[11px] uppercase tracking-wider text-dim">Address print</div>
              <div className="mt-2 border border-line bg-bg p-3">
                <AddressPrint address={w.address} cellClass="h-3" />
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-dim">Unique to this address. Compare it before sending large amounts.</p>
            </div>
          </div>
        )}

        {tab === "send" && <SendForm w={w} balance={balance} busy={busy} scheme={scheme} setScheme={setScheme} schemeKeys={schemeKeys} onSend={onSend} />}

        {tab === "rotate" && (
          <div className="grid min-w-0 gap-5 [&>*]:min-w-0">
            <div>
              <h3 className="font-serif text-[22px] font-bold">
                Move everything to a <span className="italic text-up">fresh</span> address.
              </h3>
              <p className="mt-2 text-[13px] leading-relaxed text-muted">
                Derives wallet #{w.index + 1}, sweeps SOL and up to four tokens into it in one dual-signed transaction, then retires this
                address. The bunker-mode habit: once a key has signed, move on.
              </p>
              <SchemePicker scheme={scheme} setScheme={setScheme} schemeKeys={schemeKeys} />
              <GatedButton className="mt-5" busy={busy === "rotate"} disabled={busy !== null || !balance || balance.lamports < 30_000} onClick={() => onRotate(scheme)}>
                {busy === "rotate" ? "Rotating…" : "Sign & rotate"}
              </GatedButton>
              {balance && balance.lamports < 30_000 && <p className="mt-2 text-[11.5px] text-dim">Needs a little SOL in this wallet to pay the fee.</p>}
            </div>
            <div className="border border-line bg-[#0b0a0a] p-4 font-mono text-[11.5px] leading-relaxed">
              <div className="text-dim"># plan</div>
              <div className="text-muted">
                from <span className="text-fg">#{w.index}</span> {short(w.address, 4, 4)}
              </div>
              <div className="text-muted">
                to&nbsp;&nbsp; <span className="text-up">#{w.index + 1}</span> fresh, never signed
              </div>
              <div className="mt-2 text-muted">
                move <span className="text-fg">{balance ? `${sol(balance.sol)} SOL` : "…"}</span>
                {balance && balance.tokens.length > 0 && ` + ${Math.min(4, balance.tokens.length)} token${balance.tokens.length > 1 ? "s" : ""}`}
              </div>
              <div className="text-muted">
                sign <span className="text-fg">ed25519</span> + <span className="text-up">{SCHEMES[scheme].name}</span>
              </div>
              <div className="mt-2 text-warn">then #{w.index} retires</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SendForm({
  w,
  balance,
  busy,
  scheme,
  setScheme,
  schemeKeys,
  onSend,
}: {
  w: Wallet;
  balance?: Balance;
  busy: string | null;
  scheme: SchemeId;
  setScheme: (s: SchemeId) => void;
  schemeKeys: string[];
  onSend: (p: { to: string; mint: string; amountRaw: string; scheme: SchemeId }) => void;
}) {
  const [to, setTo] = useState("");
  const [asset, setAsset] = useState("SOL");
  const [amount, setAmount] = useState("");
  const [max, setMax] = useState(false);
  const [nonce] = useState(() => bytesToHex(randomBytes(16)));

  const token = balance?.tokens.find((t) => t.mint === asset);
  const decimals = asset === "SOL" ? 9 : (token?.decimals ?? 0);
  const available = asset === "SOL" ? balance?.sol : token?.uiAmount;
  const amountRaw = max ? "ALL" : amount && Number(amount) > 0 ? BigInt(Math.round(Number(amount) * 10 ** decimals)).toString() : "";
  const addrOk = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(to.trim()) && to.trim() !== w.address;
  const valid = addrOk && amountRaw !== "";
  // Preview of the digest the post-quantum key will sign (the real one uses a fresh nonce at send time).
  const preview = useMemo(
    () => transferDigest({ from: w.address, to: to.trim() || "…", mint: asset, amount: amountRaw || "0", nonce, scheme, leaf: 0 }),
    [w.address, to, asset, amountRaw, nonce, scheme],
  );

  return (
    <div className="grid min-w-0 gap-5 [&>*]:min-w-0">
      <div className="space-y-4">
        <div>
          <label className="font-mono text-[11px] uppercase tracking-wider text-dim">To</label>
          <input
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="Destination address"
            className={cn(
              "mt-1.5 h-11 w-full border bg-bg px-3 font-mono text-[13px] outline-none placeholder:font-sans placeholder:text-dim",
              to && !addrOk ? "border-down/50" : "border-line focus:border-line-strong",
            )}
          />
        </div>
        <div>
          <div className="flex items-baseline justify-between">
            <label className="font-mono text-[11px] uppercase tracking-wider text-dim">Amount</label>
            <span className="font-mono text-[11px] text-dim">available {available != null ? sol(available) : "…"}</span>
          </div>
          <div className="mt-1.5 flex">
            <input
              value={max ? "" : amount}
              onChange={(e) => {
                setAmount(e.target.value.replace(/[^0-9.]/g, ""));
                setMax(false);
              }}
              placeholder={max ? "Entire balance" : "0.00"}
              className="h-11 min-w-0 flex-1 border border-r-0 border-line bg-bg px-3 font-mono text-[15px] outline-none placeholder:text-dim focus:border-line-strong"
            />
            <button
              onClick={() => setMax((v) => !v)}
              className={cn("h-11 cursor-pointer border border-r-0 px-3 font-mono text-[12px] transition-colors", max ? "border-up/60 text-up" : "border-line text-muted hover:text-fg")}
            >
              MAX
            </button>
            <select
              value={asset}
              onChange={(e) => {
                setAsset(e.target.value);
                setMax(false);
              }}
              className="h-11 cursor-pointer border border-line bg-bg px-3 font-mono text-[13px] outline-none"
            >
              <option value="SOL">SOL</option>
              {balance?.tokens.map((t) => (
                <option key={t.mint} value={t.mint}>
                  {t.symbol ? `$${t.symbol}` : short(t.mint, 4, 4)}
                </option>
              ))}
            </select>
          </div>
        </div>
        <SchemePicker scheme={scheme} setScheme={setScheme} schemeKeys={schemeKeys} />
        <GatedButton className="w-full" busy={busy === "send"} disabled={!valid || busy !== null} onClick={() => valid && onSend({ to: to.trim(), mint: asset, amountRaw, scheme })}>
          {busy === "send" ? "Signing twice & sending…" : (
            <>
              Sign & send <ArrowRight size={14} />
            </>
          )}
        </GatedButton>
        <p className="text-[11px] text-dim">The wallet pays its own network fee, so keep a little SOL in it.</p>
      </div>

      <div className="border border-line bg-[#0b0a0a] p-4 font-mono text-[11.5px] leading-relaxed">
        <div className="flex justify-between text-dim">
          <span># pq digest</span>
          <span>{SCHEMES[scheme].name}</span>
        </div>
        <DigestGrid digest={preview} className="mt-3" cellClass="h-2.5" />
        <div className="mt-3 space-y-0.5 text-muted">
          <div>
            to <span className="text-fg">{addrOk ? short(to.trim(), 4, 4) : "—"}</span>
          </div>
          <div>
            amt <span className="text-fg">{max ? "ALL" : amount || "—"}</span> {asset === "SOL" ? "SOL" : token?.symbol ?? ""}
          </div>
          <div>
            sig <span className="text-fg">{SCHEMES[scheme].sigBytes.toLocaleString()} B</span>
          </div>
        </div>
        <p className="mt-3 text-[10.5px] leading-relaxed text-dim">Every field changes the fingerprint. This is what your post-quantum key signs.</p>
      </div>
    </div>
  );
}

function SchemePicker({ scheme, setScheme, schemeKeys }: { scheme: SchemeId; setScheme: (s: SchemeId) => void; schemeKeys: string[] }) {
  return (
    <div>
      <div className="font-mono text-[11px] uppercase tracking-wider text-dim">Post-quantum signature</div>
      <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
        {SCHEME_IDS.map((id) => {
          const bound = id === "wots" || schemeKeys.includes(id);
          const on = scheme === id;
          return (
            <button
              key={id}
              onClick={() => setScheme(id)}
              title={bound ? SCHEMES[id].family : `${SCHEMES[id].name}: first use certifies the key with one leaf`}
              className={cn(
                "cursor-pointer border px-2 py-1.5 text-left transition-colors",
                on ? "border-up/70 bg-up/[0.06]" : "border-line hover:border-line-strong",
              )}
            >
              <div className={cn("truncate font-mono text-[11px]", on ? "text-fg" : "text-muted")}>{SCHEMES[id].name}</div>
              <div className="font-mono text-[10px] text-dim">{bound ? `${SCHEMES[id].sigBytes.toLocaleString()} B` : "+ certify"}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Row({ left, sub, right }: { left: string; sub?: string; right: string }) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2.5">
      <div className="min-w-0">
        <div className="truncate text-[13px] text-fg">{left}</div>
        {sub && <div className="truncate text-[11px] text-dim">{sub}</div>}
      </div>
      <span className="font-mono text-[13px] text-muted">{right}</span>
    </div>
  );
}

function TransferLog({ transfers, identity }: { transfers: Transfer[]; identity: { pq_address: string; root: string; pub_seed: string; height: number } | null }) {
  const [open, setOpen] = useState<string | null>(null);
  const [checks, setChecks] = useState<Record<string, LaunchVerification>>({});

  async function check(t: Transfer) {
    if (!identity) return;
    setOpen((o) => (o === t.id ? null : t.id));
    if (!checks[t.id]) {
      const v = await verifyTransfer(t, identity);
      setChecks((c) => ({ ...c, [t.id]: v }));
    }
  }

  return (
    <div className="border border-line-strong bg-[#0b0a0a] font-mono">
      <div className="flex items-center justify-between border-b border-line-strong bg-surface px-4 py-2 text-[11px] text-dim">
        <span>pqc@bunker: ~/wallet/log</span>
        <span>dual-signed transfers</span>
      </div>
      {transfers.length === 0 ? (
        <div className="px-4 py-6 text-[12px] text-dim">
          <span className="text-up">pqc@bunker</span>:~$ tail log
          <div className="mt-1">no transfers yet</div>
        </div>
      ) : (
        <ul className="divide-y divide-line">
          {transfers.map((t) => {
            const v = checks[t.id];
            const what = t.mint === "ALL" ? "rotate · everything" : t.amount_raw === "ALL" ? `all ${t.mint === "SOL" ? "SOL" : short(t.mint, 4, 4)}` : t.mint === "SOL" ? `${sol(Number(t.amount_raw) / 1e9)} SOL` : `${t.amount_raw} · ${short(t.mint, 4, 4)}`;
            return (
              <li key={t.id} className="px-4 py-2.5 text-[12px]">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                  <span className={t.status === "confirmed" ? "text-up" : t.status === "failed" ? "text-down" : "text-warn"}>
                    {t.status === "confirmed" ? "[ OK ]" : t.status === "failed" ? "[FAIL]" : "[ .. ]"}
                  </span>
                  <span className="text-muted">
                    {short(t.from_address, 4, 4)} <span className="text-dim">→</span> {short(t.to_address, 4, 4)}
                  </span>
                  <span className="text-fg">{what}</span>
                  <span className="text-dim">{SCHEMES[t.scheme as SchemeId]?.name ?? t.scheme}</span>
                  <span className="ml-auto flex items-center gap-4 text-[11.5px] text-dim">
                    {t.tx_signature && (
                      <a href={`https://solscan.io/tx/${t.tx_signature}`} target="_blank" rel="noreferrer" className="cursor-pointer hover:text-fg">
                        tx <ArrowUpRight size={10} className="inline" />
                      </a>
                    )}
                    <button onClick={() => void check(t)} className="cursor-pointer hover:text-fg">
                      {v ? (
                        v.valid ? (
                          <span className="text-up">
                            <Check size={11} className="inline" /> pq valid
                          </span>
                        ) : (
                          <span className="text-down">
                            <X size={11} className="inline" /> invalid
                          </span>
                        )
                      ) : open === t.id ? (
                        <Loader2 size={11} className="inline animate-spin" />
                      ) : (
                        "verify pq"
                      )}
                    </button>
                    <span>{ago(t.created_at)}</span>
                  </span>
                </div>
                {open === t.id && v && (
                  <div className="mt-3 font-sans">
                    <LaunchVerificationView v={v} title="Transfer attestation · verified in your browser" />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
