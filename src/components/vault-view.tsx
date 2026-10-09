"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { ArrowRight, ArrowUpRight, Check, Copy, Loader2 } from "lucide-react";
import { cn, short } from "@/lib/format";
import { PROGRAM_ID, depositSolIx, depositTokenIxs } from "@/lib/vault";
import {
  BUFFER_RENT,
  buildTx,
  commitSpend,
  discoverVaults,
  executeSpend,
  fetchChain,
  fetchSpends,
  forwardLateDeposits,
  sendTx,
  spendTag,
  type SpendRecord,
  type SpendStep,
  type VaultSlot,
} from "@/lib/vault/app";
import { useIdentity } from "./identity";
import { GatedButton } from "./unlock";
import { AddressPrint } from "./wallet-view";
import { Button, ButtonLink, CopyText, Panel, Pill, Segmented, Skeleton } from "./ui";

type TokenBalance = { mint: string; programId: string; amountRaw: string; decimals: number; uiAmount: number; symbol: string | null; name: string | null };
type Balance = { address: string; lamports: number; sol: number; tokens: TokenBalance[] };
type Tab = "deposit" | "withdraw";
type Rent = { zero: number; tombstone: number };

const ZERO = BigInt(0);
const sol = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 4 });
const tokenLabel = (t: { symbol: string | null; mint: string }) => (t.symbol ? `$${t.symbol}` : short(t.mint, 4, 4));

/** "1.5" → base units, exactly (no floats). Null if malformed or too precise. */
function toBase(input: string, decimals: number): bigint | null {
  if (!/^\d*\.?\d*$/.test(input) || input === "" || input === ".") return null;
  const [whole, frac = ""] = input.split(".");
  if (frac.length > decimals) return null;
  return BigInt(whole || "0") * BigInt(10) ** BigInt(decimals) + BigInt((frac + "0".repeat(decimals)).slice(0, decimals) || "0");
}

function fromBase(v: bigint, decimals: number, maxFraction = 6): string {
  const unit = BigInt(10) ** BigInt(decimals);
  const whole = v / unit;
  const frac = (v % unit).toString().padStart(decimals, "0").slice(0, maxFraction).replace(/0+$/, "");
  return `${whole.toLocaleString("en-US")}${frac ? `.${frac}` : ""}`;
}

async function balancesFor(addresses: string[]): Promise<Record<string, Balance>> {
  if (!addresses.length) return {};
  const j = await fetch(`/api/wallet/balances?addresses=${addresses.join(",")}`, { cache: "no-store" }).then((r) => r.json());
  return j.balances ?? {};
}

export function VaultView() {
  const { unlocked } = useIdentity();
  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <div className="mb-8">
        <h1 className="font-serif text-[28px] font-bold tracking-tight">Quantum Vault</h1>
        <p className="mt-2 max-w-2xl text-[13.5px] leading-relaxed text-muted">
          An on-chain vault whose funds only move with a hash-based signature. The program verifies a one-time WOTS signature on
          Solana itself, so no ed25519 key, not even your wallet’s, can spend from it. Each withdrawal uses the vault’s key once and
          rolls whatever is left into a fresh vault.
        </p>
      </div>
      {unlocked ? <VaultBody /> : <Locked />}
    </div>
  );
}

function Locked() {
  const { connected, remote } = useIdentity();
  return (
    <Panel className="flex flex-col items-center px-6 py-14 text-center">
      <div className="font-mono text-[11px] uppercase tracking-wider text-dim">{connected && remote ? "keys locked" : "identity required"}</div>
      <h2 className="mt-3 font-serif text-[22px] font-bold">Your vault opens with your post-quantum identity</h2>
      <p className="mt-2 max-w-md text-[13px] leading-relaxed text-muted">
        Vault keys are derived from your identity in this tab and never stored. Unlock on the Identity page and you’ll come straight
        back here.
      </p>
      <ButtonLink href="/identity?next=/vault" variant="primary" className="mt-6">
        {connected && remote ? "Unlock on Identity" : "Go to Identity"}
      </ButtonLink>
    </Panel>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-xl border border-line bg-bg p-3">
      <dt className="text-[11px] text-dim">{label}</dt>
      <dd className="mt-1 truncate font-mono text-[12.5px] text-muted">{value}</dd>
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

function KV({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-dim">{k}</dt>
      <dd className="text-muted">{v}</dd>
    </div>
  );
}

const STEPS: { id: SpendStep; label: string }[] = [
  { id: "check", label: "authenticate spend record" },
  { id: "sign", label: "WOTS sign · 67 hash chains" },
  { id: "stage", label: "stage signature on-chain" },
  { id: "verify", label: "read back staged signature" },
  { id: "withdraw", label: "withdraw · program verifies WOTS" },
  { id: "sweep", label: "forward other tokens to next vault" },
  { id: "done", label: "vault retired" },
];

function VaultBody() {
  const { wallet, unlocked, signTransaction, signAllTransactions, lock } = useIdentity();
  const identity = useMemo(() => (unlocked ? { skSeed: unlocked.skSeed, pubSeed: unlocked.pubSeed } : null), [unlocked]);

  const [slots, setSlots] = useState<VaultSlot[] | null>(null);
  const [rent, setRent] = useState<Rent | null>(null);
  const [records, setRecords] = useState<SpendRecord[]>([]);
  const [balances, setBalances] = useState<Record<string, Balance>>({});
  const [own, setOwn] = useState<Balance | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ step: SpendStep; detail?: string } | null>(null);
  const [tab, setTab] = useState<Tab>("deposit");

  const load = useCallback(async () => {
    if (!identity || !wallet) return;
    const found = await discoverVaults(identity);
    setSlots(found.slots);
    setRent(found.chain.rent);
    // Balances for the current vault and the most recent spent ones (late deposits).
    const watch = found.slots.slice(-32).map((s) => s.key.address.toBase58());
    const [recs, bals, mine] = await Promise.all([
      fetchSpends(found.slots.slice(-64).map((s) => spendTag(identity, s.key.address))),
      balancesFor(watch),
      balancesFor([wallet]),
    ]);
    setRecords(recs);
    setBalances(bals);
    setOwn(mine[wallet] ?? null);
  }, [identity, wallet]);

  useEffect(() => {
    setSlots(null);
    setRecords([]);
    setBalances({});
    void load().catch((err) => setError(err instanceof Error ? err.message : "Could not load the vault"));
  }, [load]);

  const current = slots?.[slots.length - 1] ?? null;
  const currentAddress = current?.key.address.toBase58() ?? "";
  const balance = current ? balances[currentAddress] : undefined;
  const lamports = current ? Number(current.state.lamports) : 0;
  const pending = records.find((r) => r.vault === currentAddress && r.status === "signed") ?? null;
  const spent = (slots ?? []).filter((s) => s.state.kind === "spent");

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

  async function finish(record: SpendRecord) {
    if (!identity || !wallet) throw new Error("Unlock first");
    const vaultTokens = balances[record.vault]?.tokens ?? [];
    setProgress({ step: "check" });
    const res = await executeSpend({
      identity,
      record,
      payer: new PublicKey(wallet),
      signAll: signAllTransactions,
      otherTokens: vaultTokens.map((t) => ({ mint: new PublicKey(t.mint), tokenProgram: new PublicKey(t.programId) })),
      onStep: (step, detail) => setProgress({ step, detail }),
    });
    await load();
    return `Withdrawn from vault #${record.vault_index}. Remainder is in vault #${record.vault_index + 1}${res.withdrawTx ? ` · tx ${short(res.withdrawTx, 8, 8)}` : ""}`;
  }

  const withdraw = (p: { recipient: string; mint: string | null; tokenProgram: string | null; amount: bigint }) =>
    run("withdraw", async () => {
      if (!identity || !wallet || !current || !rent) throw new Error("Unlock first");
      // Every check happens before the spend is committed: a committed spend can't be changed.
      const chain = await fetchChain([p.recipient, wallet]);
      const payerLamports = chain.accounts[wallet]?.lamports ?? 0;
      const tokenSpend = p.mint !== null;
      const need = BUFFER_RENT + 60_000 + Math.max(0, rent.tombstone - lamports) + (tokenSpend ? 2 * 2_100_000 : 0);
      if (payerLamports < need) throw new Error(`Your connected wallet pays the fees and fronts ${sol(need / 1e9)} SOL (mostly refunded). Top it up first.`);
      if (!tokenSpend) {
        const recipientLamports = chain.accounts[p.recipient]?.lamports ?? 0;
        if (BigInt(recipientLamports) + p.amount < BigInt(rent.zero)) {
          throw new Error(`An empty recipient needs at least ${sol(rent.zero / 1e9)} SOL to exist on Solana. Send more, or pick a funded address.`);
        }
      }
      const { record, existing } = await commitSpend(identity, wallet, { index: current.index, ...p });
      setRecords((rs) => [record, ...rs.filter((r) => r.tag !== record.tag)]);
      if (existing) throw new Error("This vault already has a signed withdrawal. It has to be finished as signed; see the pending withdrawal above.");
      return finish(record);
    }).finally(() => setTimeout(() => setProgress(null), 4_000));

  const resume = () => pending && run("resume", () => finish(pending)).finally(() => setTimeout(() => setProgress(null), 4_000));

  const deposit = (p: { mint: string | null; amount: bigint }) =>
    run("deposit", async () => {
      if (!wallet || !current || !rent) throw new Error("Connect a wallet first");
      const from = new PublicKey(wallet);
      const chain = await fetchChain([]);
      let ixs;
      if (p.mint === null) {
        if (BigInt(lamports) + p.amount < BigInt(rent.zero)) throw new Error(`The first SOL deposit must be at least ${sol(rent.zero / 1e9)} SOL so the account can exist.`);
        ixs = [depositSolIx({ from, vault: current.key.address, lamports: p.amount })];
      } else {
        const t = own?.tokens.find((x) => x.mint === p.mint);
        if (!t) throw new Error("That token isn't in your wallet");
        ixs = depositTokenIxs({ depositor: from, vault: current.key.address, mint: new PublicKey(t.mint), tokenProgram: new PublicKey(t.programId), amount: p.amount, decimals: t.decimals });
      }
      const signed = await signTransaction(buildTx(from, chain.blockhash, ixs));
      const sig = await sendTx(signed);
      setTimeout(() => void load(), 11_000); // balances are cached for 10s
      await load();
      return `Deposited into vault #${current.index} · tx ${short(sig, 8, 8)}`;
    });

  const forward = (slot: VaultSlot) =>
    run(`forward-${slot.index}`, async () => {
      if (!wallet || slot.state.kind !== "spent") return;
      const b = balances[slot.key.address.toBase58()];
      const sigs = await forwardLateDeposits({
        vault: slot.key.address,
        nextVault: slot.state.tombstone.nextVault,
        lamports: slot.state.lamports,
        tokens: (b?.tokens ?? []).map((t) => ({ mint: new PublicKey(t.mint), tokenProgram: new PublicKey(t.programId) })),
        payer: new PublicKey(wallet),
        signAll: signAllTransactions,
      });
      setTimeout(() => void load(), 11_000);
      await load();
      return sigs.length ? `Forwarded to vault #${slot.index + 1} · tx ${short(sigs[sigs.length - 1], 8, 8)}` : "Nothing to forward";
    });

  const late = spent.filter((s) => {
    const b = balances[s.key.address.toBase58()];
    return (rent && Number(s.state.lamports) > rent.tombstone) || (b?.tokens.length ?? 0) > 0;
  });

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <div className="min-w-0 space-y-6">
        <Panel className="p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-[11px] uppercase tracking-wider text-dim">Vault balance</div>
              <div className="mt-1 flex items-baseline gap-2">
                {!current ? (
                  <Skeleton className="h-9 w-40" />
                ) : (
                  <>
                    <span className="font-serif text-[36px] font-bold leading-none">{sol(lamports / 1e9)}</span>
                    <span className="font-mono text-[14px] text-muted">SOL</span>
                  </>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Pill tone="up">
                <Check size={10} /> wots-enforced on-chain
              </Pill>
              {unlocked?.hardened ? <Pill tone="up">hardened</Pill> : <Pill tone="warn">wallet-only</Pill>}
            </div>
          </div>
          <dl className="mt-6 grid gap-3 text-[12.5px] sm:grid-cols-4">
            <Field label="Current vault" value={current ? `#${current.index}` : "…"} />
            <Field label="Withdrawals" value={slots ? spent.length : "…"} />
            <Field label="Tokens held" value={balance ? balance.tokens.length : "…"} />
            <Field label="Program" value={short(PROGRAM_ID.toBase58(), 4, 4)} />
          </dl>
        </Panel>

        {unlocked && !unlocked.hardened && (
          <div className="rounded-xl border border-warn/40 bg-warn/[0.04] px-4 py-3 text-[12.5px] leading-relaxed text-muted">
            <span className="font-medium text-warn">Wallet-only identity.</span> Your vault keys come from your wallet’s signature. If
            ed25519 were ever broken, an attacker holding your wallet key could re-derive them. Identities hardened with a passphrase
            don’t have this gap; you choose that when the identity is first created.
          </div>
        )}

        {(error || notice) && (
          <div className={cn("rounded-xl border px-4 py-2.5 font-mono text-[12px]", error ? "border-down/40 text-down" : "border-up/40 text-up")}>
            {error ? `[ ERR ] ${error}` : `[ OK ] ${notice}`}
          </div>
        )}

        {progress && <Progress progress={progress} />}

        {pending && (
          <Panel className="border-warn/50 p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="font-mono text-[11px] uppercase tracking-wider text-warn">signed withdrawal pending</div>
                <p className="mt-2 text-[13px] leading-relaxed text-muted">
                  Vault #{pending.vault_index} has already signed{" "}
                  <span className="text-fg">
                    {pending.mint ? `${pending.amount_raw} base units of ${short(pending.mint, 4, 4)}` : `${fromBase(BigInt(pending.amount_raw), 9)} SOL`}
                  </span>{" "}
                  to <span className="font-mono text-fg">{short(pending.recipient, 6, 6)}</span>. A one-time key can’t sign anything else,
                  so this exact withdrawal is the only way forward.
                </p>
              </div>
              <GatedButton busy={busy === "resume"} disabled={busy !== null} onClick={() => void resume()}>
                {busy === "resume" ? "Finishing…" : "Finish withdrawal"}
              </GatedButton>
            </div>
          </Panel>
        )}

        {current && (
          <div className="rounded-xl border border-line bg-surface">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
              <div className="min-w-0">
                <div className="truncate font-serif text-[20px] font-bold">Vault #{current.index}</div>
                <div className="mt-0.5 font-mono text-[11.5px] text-dim">one-time key · signs once, then rolls into #{current.index + 1}</div>
              </div>
              <Segmented
                value={tab}
                onChange={setTab}
                options={[
                  { value: "deposit", label: "Deposit" },
                  { value: "withdraw", label: "Withdraw" },
                ]}
              />
            </div>
            <div className="p-5">
              {tab === "deposit" ? (
                <DepositTab address={currentAddress} balance={balance} own={own} busy={busy} onDeposit={deposit} />
              ) : (
                <WithdrawTab
                  key={currentAddress}
                  current={current}
                  lamports={lamports}
                  rent={rent}
                  balance={balance}
                  wallet={wallet ?? ""}
                  blocked={Boolean(pending)}
                  busy={busy}
                  onWithdraw={withdraw}
                />
              )}
            </div>
          </div>
        )}

        <History slots={slots} records={records} late={late} balances={balances} rent={rent} busy={busy} onForward={forward} />
      </div>

      <aside className="space-y-4">
        <Panel className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-[11px] uppercase tracking-wider text-dim">Current vault</span>
            {current && <span className="font-mono text-[11.5px] text-muted">#{current.index}</span>}
          </div>
          {current ? (
            <>
              <AddressPrint address={currentAddress} cellClass="h-3" />
              <dl className="mt-4 space-y-2 font-mono text-[11.5px]">
                <KV k="address" v={<CopyText value={currentAddress} display={short(currentAddress, 6, 6)} />} />
                <KV k="derivation" v={`vault/v1 · ${current.index}`} />
                <KV k="key stored" v="nowhere" />
                <KV k="program" v={<CopyText value={PROGRAM_ID.toBase58()} display={short(PROGRAM_ID.toBase58(), 4, 4)} />} />
              </dl>
            </>
          ) : (
            <div className="space-y-2">
              <Skeleton className="h-24" />
              <Skeleton className="h-4" />
            </div>
          )}
        </Panel>

        <Panel className="p-5">
          <div className="mb-4 text-[11px] uppercase tracking-wider text-dim">Protection</div>
          <div className="space-y-3.5">
            <StatusRow tone="up" label="Spends verified on-chain" value="The program checks a WOTS signature over SHA-256" />
            <StatusRow tone="up" label="No ed25519 spend path" value="Your wallet only pays fees; it can’t move vault funds" />
            <StatusRow tone="up" label="Every key used once" value="Each withdrawal retires the vault for a fresh one" />
            <StatusRow
              tone={unlocked?.hardened ? "up" : "warn"}
              label={unlocked?.hardened ? "Passphrase-hardened identity" : "Wallet-only identity"}
              value={unlocked?.hardened ? "Keys don’t depend on ed25519 alone" : "Keys are re-derivable from your wallet key"}
            />
          </div>
          <Link href="/docs#vault" className="mt-4 inline-block cursor-pointer text-[12px] text-muted underline-offset-2 hover:text-fg hover:underline">
            How the vault works →
          </Link>
        </Panel>

        <Panel className="p-5">
          <div className="mb-3 text-[11px] uppercase tracking-wider text-dim">Cost of a withdrawal</div>
          <dl className="space-y-2 font-mono text-[11.5px]">
            <KV k="signature buffer" v="0.0122 SOL, refunded" />
            <KV k="retired vault" v={rent ? `${sol(rent.tombstone / 1e9)} SOL, kept` : "…"} />
            <KV k="transactions" v="4 (+1 for tokens)" />
            <KV k="wallet prompts" v="1" />
          </dl>
          <p className="mt-3 text-[11.5px] leading-relaxed text-dim">Your connected wallet pays these. The vault itself never needs SOL for fees.</p>
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

function Progress({ progress }: { progress: { step: SpendStep; detail?: string } }) {
  const at = STEPS.findIndex((s) => s.id === progress.step);
  return (
    <div className="border border-line-strong bg-[#0b0a0a] font-mono">
      <div className="flex items-center justify-between border-b border-line-strong bg-surface px-4 py-2 text-[11px] text-dim">
        <span>quantum@node: ~/vault/spend</span>
        <span>{progress.step === "done" ? "complete" : "running"}</span>
      </div>
      <ul className="space-y-1 px-4 py-3 text-[12px]">
        {STEPS.map((s, i) => (
          <li key={s.id} className={cn(i < at || progress.step === "done" ? "text-up" : i === at ? "text-fg" : "text-dim")}>
            {i < at || progress.step === "done" ? "[ OK ]" : i === at ? "[ .. ]" : "[    ]"} {s.label}
            {i === at && progress.detail ? ` · ${progress.detail}` : ""}
          </li>
        ))}
      </ul>
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

function AmountInput({
  amount,
  setAmount,
  onMax,
  asset,
  setAsset,
  options,
  available,
}: {
  amount: string;
  setAmount: (v: string) => void;
  onMax: () => void;
  asset: string;
  setAsset: (v: string) => void;
  options: { value: string; label: string }[];
  available: string;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <label className="font-mono text-[11px] uppercase tracking-wider text-dim">Amount</label>
        <span className="font-mono text-[11px] text-dim">available {available}</span>
      </div>
      <div className="mt-1.5 flex">
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
          placeholder="0.00"
          className="h-11 min-w-0 flex-1 border border-r-0 border-line bg-bg px-3 font-mono text-[15px] outline-none placeholder:text-dim focus:border-line-strong"
        />
        <button onClick={onMax} className="h-11 cursor-pointer border border-r-0 border-line px-3 font-mono text-[12px] text-muted transition-colors hover:text-fg">
          MAX
        </button>
        <select value={asset} onChange={(e) => setAsset(e.target.value)} className="h-11 cursor-pointer border border-line bg-bg px-3 font-mono text-[13px] outline-none">
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

function DepositTab({
  address,
  balance,
  own,
  busy,
  onDeposit,
}: {
  address: string;
  balance?: Balance;
  own: Balance | null;
  busy: string | null;
  onDeposit: (p: { mint: string | null; amount: bigint }) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [asset, setAsset] = useState("SOL");
  const [amount, setAmount] = useState("");
  const token = own?.tokens.find((t) => t.mint === asset);
  const decimals = asset === "SOL" ? 9 : (token?.decimals ?? 0);
  const raw = toBase(amount, decimals);
  const max = asset === "SOL" ? (own ? BigInt(Math.max(0, own.lamports - 10_000_000)) : ZERO) : token ? BigInt(token.amountRaw) : ZERO;
  const valid = raw !== null && raw > ZERO && raw <= max;

  return (
    <div className="grid min-w-0 gap-6 [&>*]:min-w-0">
      <div>
        <div className="font-mono text-[11px] uppercase tracking-wider text-dim">Deposit address</div>
        <button
          onClick={() => {
            void navigator.clipboard?.writeText(address);
            setCopied(true);
            setTimeout(() => setCopied(false), 1200);
          }}
          className="group mt-2 flex w-full cursor-pointer items-center justify-between gap-3 border border-line bg-bg px-4 py-3 text-left transition-colors hover:border-line-strong"
        >
          <span className="break-all font-mono text-[13.5px] text-fg">{address}</span>
          <span className="shrink-0 text-muted group-hover:text-fg">{copied ? <Check size={14} className="text-up" /> : <Copy size={14} />}</span>
        </button>
        <div className="mt-2 flex items-center justify-between gap-3 text-[11.5px] text-dim">
          <span>Send SOL or any SPL / Token-2022 token from anywhere. This address changes after each withdrawal.</span>
          <a href={`https://solscan.io/account/${address}`} target="_blank" rel="noreferrer" className="flex shrink-0 cursor-pointer items-center gap-1 hover:text-fg">
            Solscan <ArrowUpRight size={11} />
          </a>
        </div>
      </div>

      <div>
        <div className="font-mono text-[11px] uppercase tracking-wider text-dim">From your connected wallet</div>
        <div className="mt-2 space-y-3">
          <AmountInput
            amount={amount}
            setAmount={setAmount}
            onMax={() => setAmount(fromBase(max, decimals, decimals).replace(/,/g, ""))}
            asset={asset}
            setAsset={(v) => {
              setAsset(v);
              setAmount("");
            }}
            options={[{ value: "SOL", label: "SOL" }, ...(own?.tokens ?? []).map((t) => ({ value: t.mint, label: tokenLabel(t) }))]}
            available={own ? (asset === "SOL" ? sol(own.sol) : token ? sol(token.uiAmount) : "0") : "…"}
          />
          <GatedButton className="w-full" busy={busy === "deposit"} disabled={!valid || busy !== null} onClick={() => valid && onDeposit({ mint: asset === "SOL" ? null : asset, amount: raw })}>
            {busy === "deposit" ? "Depositing…" : "Deposit"}
          </GatedButton>
          {asset === "SOL" && <p className="text-[11px] text-dim">MAX keeps 0.01 SOL in your wallet for fees.</p>}
        </div>
      </div>

      <div>
        <div className="font-mono text-[11px] uppercase tracking-wider text-dim">Holdings</div>
        <div className="mt-2 divide-y divide-line border border-line">
          <Row left="SOL" right={balance ? sol(balance.sol) : "…"} />
          {balance?.tokens.map((t) => (
            <Row key={t.mint} left={tokenLabel(t)} sub={t.name ?? undefined} right={t.uiAmount.toLocaleString("en-US", { maximumFractionDigits: 4 })} />
          ))}
        </div>
      </div>
    </div>
  );
}

function WithdrawTab({
  current,
  lamports,
  rent,
  balance,
  wallet,
  blocked,
  busy,
  onWithdraw,
}: {
  current: VaultSlot;
  lamports: number;
  rent: Rent | null;
  balance?: Balance;
  wallet: string;
  blocked: boolean;
  busy: string | null;
  onWithdraw: (p: { recipient: string; mint: string | null; tokenProgram: string | null; amount: bigint }) => void;
}) {
  const [to, setTo] = useState(wallet);
  const [asset, setAsset] = useState("SOL");
  const [amount, setAmount] = useState("");
  const [confirming, setConfirming] = useState(false);

  const token = balance?.tokens.find((t) => t.mint === asset);
  const decimals = asset === "SOL" ? 9 : (token?.decimals ?? 0);
  const raw = toBase(amount, decimals);
  const tombstone = rent?.tombstone ?? 0;
  const max = asset === "SOL" ? BigInt(Math.max(0, lamports - tombstone)) : token ? BigInt(token.amountRaw) : ZERO;
  const recipient = to.trim();
  const addrOk = (() => {
    try {
      return new PublicKey(recipient).toBase58() === recipient && recipient !== current.key.address.toBase58();
    } catch {
      return false;
    }
  })();
  const remainder = asset === "SOL" && raw !== null ? max - raw : ZERO;
  const dust = asset === "SOL" && raw !== null && remainder > ZERO && rent !== null && remainder < BigInt(rent.zero);
  const valid = addrOk && raw !== null && raw > ZERO && raw <= max && !blocked;
  const label = asset === "SOL" ? "SOL" : token ? tokenLabel(token) : "";

  return (
    <div className="grid min-w-0 gap-5 [&>*]:min-w-0">
      <div className="space-y-4">
        <div>
          <label className="font-mono text-[11px] uppercase tracking-wider text-dim">To</label>
          <input
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setConfirming(false);
            }}
            placeholder="Destination address"
            className={cn(
              "mt-1.5 h-11 w-full border bg-bg px-3 font-mono text-[13px] outline-none placeholder:font-sans placeholder:text-dim",
              to && !addrOk ? "border-down/50" : "border-line focus:border-line-strong",
            )}
          />
          {recipient === wallet && <div className="mt-1 text-[11px] text-dim">Your connected wallet</div>}
        </div>
        <AmountInput
          amount={amount}
          setAmount={(v) => {
            setAmount(v);
            setConfirming(false);
          }}
          onMax={() => {
            setAmount(fromBase(max, decimals, decimals).replace(/,/g, ""));
            setConfirming(false);
          }}
          asset={asset}
          setAsset={(v) => {
            setAsset(v);
            setAmount("");
            setConfirming(false);
          }}
          options={[{ value: "SOL", label: "SOL" }, ...(balance?.tokens ?? []).map((t) => ({ value: t.mint, label: tokenLabel(t) }))]}
          available={fromBase(max, decimals, 4)}
        />
        {dust && (
          <p className="text-[11.5px] text-dim">
            The {fromBase(remainder, 9)} SOL left over is below Solana’s account minimum; your wallet adds the difference to vault #
            {current.index + 1}.
          </p>
        )}

        {!confirming ? (
          <GatedButton className="w-full" disabled={!valid || busy !== null} onClick={() => setConfirming(true)}>
            Review withdrawal <ArrowRight size={14} />
          </GatedButton>
        ) : (
          <div className="space-y-3 border border-warn/50 bg-warn/[0.04] p-4">
            <p className="text-[12.5px] leading-relaxed text-muted">
              Vault #{current.index} signs <span className="text-fg">exactly this withdrawal</span> and can never sign anything else. Once
              you confirm, it can only be finished, not changed.
            </p>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setConfirming(false)} disabled={busy !== null}>
                Cancel
              </Button>
              <GatedButton
                className="flex-1"
                busy={busy === "withdraw"}
                disabled={!valid || busy !== null}
                onClick={() =>
                  valid && onWithdraw({ recipient, mint: asset === "SOL" ? null : asset, tokenProgram: asset === "SOL" ? null : (token?.programId ?? null), amount: raw })
                }
              >
                {busy === "withdraw" ? "Withdrawing…" : "Sign & withdraw"}
              </GatedButton>
            </div>
          </div>
        )}
        {blocked && <p className="text-[11.5px] text-warn">Finish the pending withdrawal above first.</p>}
      </div>

      <div className="border border-line bg-[#0b0a0a] p-4 font-mono text-[11.5px] leading-relaxed">
        <div className="text-dim"># plan</div>
        <div className="text-muted">
          spend <span className="text-fg">vault #{current.index}</span> {short(current.key.address.toBase58(), 4, 4)}
        </div>
        <div className="text-muted">
          pay&nbsp;&nbsp; <span className="text-fg">{raw && raw > ZERO ? `${fromBase(raw, decimals)} ${label}` : "—"}</span> → {addrOk ? short(recipient, 4, 4) : "—"}
        </div>
        <div className="text-muted">
          roll&nbsp; everything else → <span className="text-up">vault #{current.index + 1}</span>
        </div>
        <div className="mt-2 text-muted">
          sign <span className="text-up">WOTS</span> · verified by the program on-chain
        </div>
        <div className="text-muted">
          fees <span className="text-fg">your wallet</span> · 1 prompt
        </div>
        <div className="mt-2 text-warn">then vault #{current.index} retires</div>
      </div>
    </div>
  );
}

function History({
  slots,
  records,
  late,
  balances,
  rent,
  busy,
  onForward,
}: {
  slots: VaultSlot[] | null;
  records: SpendRecord[];
  late: VaultSlot[];
  balances: Record<string, Balance>;
  rent: Rent | null;
  busy: string | null;
  onForward: (slot: VaultSlot) => void;
}) {
  const spent = (slots ?? []).filter((s) => s.state.kind === "spent").reverse();
  const byVault = new Map(records.map((r) => [r.vault, r]));
  const decimalsOf = (mint: string) => {
    for (const b of Object.values(balances)) for (const t of b.tokens) if (t.mint === mint) return { decimals: t.decimals, label: tokenLabel(t) };
    return null;
  };

  return (
    <div className="border border-line-strong bg-[#0b0a0a] font-mono">
      <div className="flex items-center justify-between border-b border-line-strong bg-surface px-4 py-2 text-[11px] text-dim">
        <span>quantum@node: ~/vault/log</span>
        <span>withdrawals</span>
      </div>
      {slots === null ? (
        <div className="px-4 py-6 text-[12px] text-dim">
          <Loader2 size={12} className="inline animate-spin" /> scanning vaults…
        </div>
      ) : spent.length === 0 ? (
        <div className="px-4 py-6 text-[12px] text-dim">
          <span className="text-up">quantum@node</span>:~$ tail log
          <div className="mt-1">no withdrawals yet</div>
        </div>
      ) : (
        <ul className="divide-y divide-line">
          {spent.map((s) => {
            const address = s.key.address.toBase58();
            const r = byVault.get(address);
            const t = r?.mint ? decimalsOf(r.mint) : null;
            const what = r
              ? r.mint
                ? t
                  ? `${fromBase(BigInt(r.amount_raw), t.decimals)} ${t.label}`
                  : `${r.amount_raw} units · ${short(r.mint, 4, 4)}`
                : `${fromBase(BigInt(r.amount_raw), 9)} SOL`
              : "spent";
            const isLate = late.includes(s);
            const extra = rent && s.state.kind === "spent" ? Number(s.state.lamports) - rent.tombstone : 0;
            return (
              <li key={address} className="px-4 py-2.5 text-[12px]">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                  <span className="text-up">[ OK ]</span>
                  <span className="text-muted">#{s.index}</span>
                  <span className="text-fg">{what}</span>
                  {r && (
                    <span className="text-muted">
                      <span className="text-dim">→</span> {short(r.recipient, 4, 4)}
                    </span>
                  )}
                  <span className="ml-auto flex items-center gap-4 text-[11.5px] text-dim">
                    {r?.withdraw_tx && (
                      <a href={`https://solscan.io/tx/${r.withdraw_tx}`} target="_blank" rel="noreferrer" className="cursor-pointer hover:text-fg">
                        tx <ArrowUpRight size={10} className="inline" />
                      </a>
                    )}
                    <a href={`https://solscan.io/account/${address}`} target="_blank" rel="noreferrer" className="cursor-pointer hover:text-fg">
                      vault <ArrowUpRight size={10} className="inline" />
                    </a>
                  </span>
                </div>
                {isLate && (
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-[11.5px]">
                    <span className="text-warn">
                      late deposit: {extra > 0 ? `${sol(extra / 1e9)} SOL` : ""}
                      {extra > 0 && (balances[address]?.tokens.length ?? 0) > 0 ? " + " : ""}
                      {(balances[address]?.tokens.length ?? 0) > 0 ? `${balances[address].tokens.length} token(s)` : ""}
                    </span>
                    <button
                      onClick={() => onForward(s)}
                      disabled={busy !== null}
                      className="cursor-pointer border border-line px-2 py-0.5 text-muted transition-colors hover:border-line-strong hover:text-fg disabled:opacity-50"
                    >
                      {busy === `forward-${s.index}` ? "forwarding…" : `forward to #${s.index + 1}`}
                    </button>
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

