/**
 * pqc.market glue around the vendored vault client: vault discovery, spend
 * records, and the spend / deposit / sweep flows the /vault page runs.
 *
 * Safety model for the one-time keys:
 *  - A spend is recorded (POST /api/vault/spends) BEFORE its signature exists
 *    anywhere but this function's memory, and every attempt for that vault
 *    replays that record. WOTS signing is deterministic, so a replay produces
 *    the identical signature: one vault key, one message, ever.
 *  - Records are keyed by tag = HMAC(k, vault) with k derived from the identity
 *    secret, so nobody else can claim a vault's slot or read the list, and the
 *    parameters carry a MAC under the same key, so a tampered record is refused.
 */
import { hkdf } from "@noble/hashes/hkdf.js";
import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";
import { ComputeBudgetProgram, PublicKey, SystemProgram, TransactionMessage, VersionedTransaction, type TransactionInstruction } from "@solana/web3.js";
import { fromBase64, toBase64 } from "@/lib/b64";
import { planSpend } from "./transactions";
import { sweepSolIx, sweepTokenIx, type TokenSpend } from "./instructions";
import { stagedPayloadMatches, vaultState, type AccountLike, type VaultState } from "./state";
import { VaultKey, spendDigest, type Identity } from "./vault";

export const PRIORITY_MICROLAMPORTS = 50_000;
/** What the payer fronts during a spend; the buffer part comes back when the withdraw lands. */
export const BUFFER_RENT = 12_197_080;

export type RawAccount = { lamports: number; owner: string; data: string } | null;
export type Chain = {
  accounts: Record<string, RawAccount>;
  blockhash: string;
  lastValidBlockHeight: number;
  rent: { zero: number; tombstone: number };
};

export type SpendRecord = {
  tag: string;
  vault: string;
  vault_index: number;
  next_vault: string;
  next_vault_hash: string;
  recipient: string;
  mint: string | null;
  token_program: string | null;
  amount_raw: string;
  digest: string;
  mac: string;
  status: "signed" | "withdrawn";
  write_txs: string[];
  withdraw_tx: string | null;
  cleanup_txs: string[];
  created_at: string;
  updated_at: string;
};

export type SignAll = (txs: VersionedTransaction[]) => Promise<VersionedTransaction[]>;

async function json<T>(res: Response): Promise<T> {
  const j = await res.json().catch(() => ({}));
  if (!res.ok && res.status !== 409) throw Object.assign(new Error(j.error ?? "Request failed"), { code: j.code ?? null });
  return j as T;
}

export async function fetchChain(addresses: string[]): Promise<Chain> {
  return json<Chain>(await fetch(`/api/vault/chain?addresses=${[...new Set(addresses)].join(",")}`, { cache: "no-store" }));
}

export function accountLike(raw: RawAccount | undefined): AccountLike | null {
  return raw ? { lamports: raw.lamports, owner: new PublicKey(raw.owner), data: fromBase64(raw.data) } : null;
}

// ---------- discovery ----------

export type VaultSlot = { index: number; key: VaultKey; state: VaultState };

/**
 * Walks vault indices from 0 until the first one that isn't a tombstone. The
 * user's whole state is that index, and it lives on-chain.
 */
export async function discoverVaults(identity: Identity): Promise<{ slots: VaultSlot[]; current: VaultSlot; chain: Chain }> {
  const slots: VaultSlot[] = [];
  const BATCH = 8;
  for (let start = 0; start < 1024; start += BATCH) {
    const keys = Array.from({ length: BATCH }, (_, i) => VaultKey.fromIdentity(identity, start + i));
    const chain = await fetchChain(keys.map((k) => k.address.toBase58()));
    for (let i = 0; i < keys.length; i++) {
      const state = vaultState(accountLike(chain.accounts[keys[i].address.toBase58()]));
      const slot = { index: start + i, key: keys[i], state };
      slots.push(slot);
      if (state.kind === "unspent") return { slots, current: slot, chain };
    }
  }
  throw new Error("No unspent vault in the first 1024 indices");
}

// ---------- spend records ----------

function recordKey(identity: Identity) {
  return hkdf(sha256, identity.skSeed, utf8ToBytes("pqc.market/vault/v1/record"), utf8ToBytes("key"), 32);
}

export function spendTag(identity: Identity, vault: PublicKey | string) {
  return bytesToHex(hmac(sha256, recordKey(identity), utf8ToBytes(`tag:${vault.toString()}`)));
}

type Params = { vault: string; index: number; recipient: string; mint: string | null; tokenProgram: string | null; amount: string; nextVaultHash: string; digest: string };

function paramsMac(identity: Identity, p: Params) {
  const canonical = [p.vault, p.index, p.recipient, p.mint ?? "SOL", p.tokenProgram ?? "-", p.amount, p.nextVaultHash, p.digest].join("|");
  return bytesToHex(hmac(sha256, recordKey(identity), utf8ToBytes(`spend:${canonical}`)));
}

export async function fetchSpends(tags: string[]): Promise<SpendRecord[]> {
  if (!tags.length) return [];
  return (await json<{ spends: SpendRecord[] }>(await fetch(`/api/vault/spends?tags=${tags.join(",")}`, { cache: "no-store" }))).spends;
}

/** Throws unless the record is ours, unaltered, and describes vault[index] → vault[index + 1]. */
export function authenticateSpend(identity: Identity, r: SpendRecord) {
  const from = VaultKey.fromIdentity(identity, r.vault_index);
  const next = VaultKey.fromIdentity(identity, r.vault_index + 1);
  const ok =
    r.tag === spendTag(identity, from.address) &&
    r.vault === from.address.toBase58() &&
    r.next_vault_hash === bytesToHex(next.pkHash) &&
    r.next_vault === next.address.toBase58() &&
    r.mac ===
      paramsMac(identity, {
        vault: r.vault,
        index: r.vault_index,
        recipient: r.recipient,
        mint: r.mint,
        tokenProgram: r.token_program,
        amount: r.amount_raw,
        nextVaultHash: r.next_vault_hash,
        digest: r.digest,
      });
  if (!ok) throw new Error("This spend record failed authentication. Nothing was signed.");
  return { from, next };
}

/**
 * Commits to one spend of vault[index]. Returns the existing record instead if
 * this vault already has one: the caller must then finish that spend.
 */
export async function commitSpend(
  identity: Identity,
  wallet: string,
  p: { index: number; recipient: string; mint: string | null; tokenProgram: string | null; amount: bigint },
): Promise<{ record: SpendRecord; existing: boolean }> {
  const from = VaultKey.fromIdentity(identity, p.index);
  const next = VaultKey.fromIdentity(identity, p.index + 1);
  const tag = spendTag(identity, from.address);
  const [prior] = await fetchSpends([tag]);
  if (prior) {
    authenticateSpend(identity, prior);
    return { record: prior, existing: true };
  }
  const digest = bytesToHex(
    spendDigest({
      vault: from.address,
      recipient: new PublicKey(p.recipient),
      mint: p.mint ? new PublicKey(p.mint) : null,
      amount: p.amount,
      nextVaultHash: next.pkHash,
    }),
  );
  const params: Params = {
    vault: from.address.toBase58(),
    index: p.index,
    recipient: p.recipient,
    mint: p.mint,
    tokenProgram: p.tokenProgram,
    amount: p.amount.toString(),
    nextVaultHash: bytesToHex(next.pkHash),
    digest,
  };
  const res = await json<{ spend: SpendRecord; existing: boolean }>(
    await fetch("/api/vault/spends", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...params, wallet, nextVault: next.address.toBase58(), tag, mac: paramsMac(identity, params) }),
    }),
  );
  authenticateSpend(identity, res.spend);
  return { record: res.spend, existing: res.existing };
}

async function updateSpend(tag: string, patch: { writeTxs?: string[]; withdrawTx?: string; cleanupTxs?: string[] }) {
  await fetch("/api/vault/spends/update", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tag, ...patch }) }).catch(() => {});
}

// ---------- transactions ----------

export function buildTx(payer: PublicKey, blockhash: string, ixs: TransactionInstruction[]) {
  const message = new TransactionMessage({
    payerKey: payer,
    recentBlockhash: blockhash,
    instructions: [ComputeBudgetProgram.setComputeUnitPrice({ microLamports: PRIORITY_MICROLAMPORTS }), ...ixs],
  }).compileToV0Message();
  return new VersionedTransaction(message);
}

export async function sendTx(tx: VersionedTransaction): Promise<string> {
  const res = await json<{ signature: string; status: string }>(
    await fetch("/api/vault/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ transaction: toBase64(tx.serialize()) }) }),
  );
  return res.signature;
}

const expired = (err: unknown) => err instanceof Error && /expired|blockhash/i.test(err.message);

/**
 * The withdraw credits `next_vault`, which must end rent-exempt. If the
 * remainder alone is too small, the payer tops the next vault up first (it
 * stays an empty system account, so the program still accepts it).
 */
function nextVaultTopUp(payer: PublicKey, nextVault: PublicKey, remainder: bigint, nextLamports: number, zeroRent: number) {
  if (remainder <= BigInt(0)) return [];
  const short = BigInt(zeroRent) - remainder - BigInt(nextLamports);
  return short > BigInt(0) ? [SystemProgram.transfer({ fromPubkey: payer, toPubkey: nextVault, lamports: short })] : [];
}

function chunk<T>(list: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

export type SpendStep = "check" | "sign" | "stage" | "verify" | "withdraw" | "sweep" | "done";

/**
 * Runs (or resumes) a recorded spend: stage the signature in three
 * transactions, wait until the RPC sees all of it, withdraw, then forward every
 * other token the vault held into the next vault. Safe to call repeatedly for
 * the same record.
 */
export async function executeSpend(p: {
  identity: Identity;
  record: SpendRecord;
  payer: PublicKey;
  signAll: SignAll;
  /** Other mints the vault holds; forwarded to the next vault after the withdraw. */
  otherTokens: TokenSpend[];
  onStep: (step: SpendStep, detail?: string) => void;
}): Promise<{ withdrawTx: string | null }> {
  const { identity, record: r, payer, signAll, onStep } = p;
  onStep("check");
  const { from, next } = authenticateSpend(identity, r);
  const token = r.mint && r.token_program ? { mint: new PublicKey(r.mint), tokenProgram: new PublicKey(r.token_program) } : null;
  const amount = BigInt(r.amount_raw);

  // Deterministic: replaying the record re-derives the identical signature.
  onStep("sign");
  const plan = planSpend({ from, nextVaultHash: next.pkHash, recipient: new PublicKey(r.recipient), amount, payer, token });
  if (bytesToHex(plan.digest) !== r.digest) throw new Error("Spend digest mismatch. Nothing was sent.");

  let chain = await fetchChain([from.address.toBase58(), plan.buffer.toBase58(), next.address.toBase58()]);
  const vaultNow = vaultState(accountLike(chain.accounts[from.address.toBase58()]));
  if (vaultNow.kind === "spent") {
    await updateSpend(r.tag, {});
    onStep("done");
    return { withdrawTx: r.withdraw_tx };
  }
  const staged = stagedPayloadMatches(accountLike(chain.accounts[plan.buffer.toBase58()]), plan.payload);

  const distributable = vaultNow.lamports > BigInt(chain.rent.tombstone) ? vaultNow.lamports - BigInt(chain.rent.tombstone) : BigInt(0);
  const remainder = distributable - (token ? BigInt(0) : amount);
  if (remainder < BigInt(0)) throw new Error("The vault no longer holds enough SOL for this withdrawal. Deposit more, then resume.");
  const topUp = nextVaultTopUp(payer, next.address, remainder, chain.accounts[next.address.toBase58()]?.lamports ?? 0, chain.rent.zero);

  const sweepIxs = p.otherTokens
    .filter((t) => !r.mint || !t.mint.equals(new PublicKey(r.mint)))
    .map((t) => sweepTokenIx({ payer, vault: from.address, nextVault: next.address, token: t, closeAta: true }));
  const cleanup = [...plan.cleanupInstructions, ...sweepIxs];

  const build = (blockhash: string) => ({
    writes: staged ? [] : plan.writeInstructions.map((ixs) => buildTx(payer, blockhash, ixs)),
    withdraw: buildTx(payer, blockhash, [...topUp, ...plan.withdrawInstructions]),
    cleanups: chunk(cleanup, 4).map((ixs) => buildTx(payer, blockhash, ixs)),
  });

  // One wallet prompt for everything, while the blockhash is fresh.
  const b = build(chain.blockhash);
  const signed = await signAll([...b.writes, b.withdraw, ...b.cleanups]);
  let writes = signed.slice(0, b.writes.length);
  let withdraw = signed[b.writes.length];
  let cleanups = signed.slice(b.writes.length + 1);

  if (writes.length) {
    onStep("stage", `0/${writes.length}`);
    let done = 0;
    const sigs = await Promise.all(
      writes.map(async (tx) => {
        const s = await sendTx(tx);
        onStep("stage", `${++done}/${writes.length}`);
        return s;
      }),
    );
    await updateSpend(r.tag, { writeTxs: sigs });
  }

  // Load-balanced RPCs can lag a chunk behind: never withdraw against a partial buffer.
  onStep("verify");
  for (let attempt = 0; ; attempt++) {
    chain = await fetchChain([plan.buffer.toBase58()]);
    if (stagedPayloadMatches(accountLike(chain.accounts[plan.buffer.toBase58()]), plan.payload)) break;
    if (attempt >= 40) throw new Error("The staged signature isn't visible yet. Resume in a minute; nothing is lost.");
    await new Promise((res) => setTimeout(res, 1_000));
  }

  onStep("withdraw");
  let withdrawTx: string;
  try {
    withdrawTx = await sendTx(withdraw);
  } catch (err) {
    if (!expired(err)) throw err;
    const fresh = build((await fetchChain([])).blockhash);
    const again = await signAll([fresh.withdraw, ...fresh.cleanups]);
    withdraw = again[0];
    cleanups = again.slice(1);
    writes = [];
    withdrawTx = await sendTx(withdraw);
  }
  await updateSpend(r.tag, { withdrawTx });

  if (cleanups.length) {
    onStep("sweep");
    const sigs: string[] = [];
    for (const tx of cleanups) {
      try {
        sigs.push(await sendTx(tx));
      } catch {
        // Best effort: sweeps are permissionless and can be rerun from the history list.
      }
    }
    if (sigs.length) await updateSpend(r.tag, { cleanupTxs: sigs });
  }
  onStep("done");
  return { withdrawTx };
}

/** Forwards late deposits sitting in a spent vault to the next vault its tombstone names. */
export async function forwardLateDeposits(p: {
  vault: PublicKey;
  nextVault: PublicKey;
  lamports: bigint;
  tokens: TokenSpend[];
  payer: PublicKey;
  signAll: SignAll;
}) {
  const chain = await fetchChain([p.nextVault.toBase58()]);
  const extraSol = p.lamports - BigInt(chain.rent.tombstone);
  const ixs: TransactionInstruction[] = [];
  if (extraSol > BigInt(0)) {
    ixs.push(...nextVaultTopUp(p.payer, p.nextVault, extraSol, chain.accounts[p.nextVault.toBase58()]?.lamports ?? 0, chain.rent.zero));
    ixs.push(sweepSolIx({ vault: p.vault, nextVault: p.nextVault }));
  }
  ixs.push(...p.tokens.map((token) => sweepTokenIx({ payer: p.payer, vault: p.vault, nextVault: p.nextVault, token, closeAta: true })));
  if (!ixs.length) return [];
  const txs = await p.signAll(chunk(ixs, 4).map((part) => buildTx(p.payer, chain.blockhash, part)));
  const sigs: string[] = [];
  for (const tx of txs) sigs.push(await sendTx(tx));
  return sigs;
}

