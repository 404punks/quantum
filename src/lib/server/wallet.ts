import "server-only";
import { utf8ToBytes } from "@noble/hashes/utils.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import {
  ComputeBudgetProgram,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import { tokenMeta } from "./birdeye";
import { cached } from "./cache";
import { MEMO_PROGRAM_ID, connection } from "./solana";
import { db } from "./supabase";

export type TokenBalance = {
  mint: string;
  programId: string;
  amountRaw: string;
  decimals: number;
  uiAmount: number;
  symbol: string | null;
  name: string | null;
};
export type WalletBalance = { address: string; lamports: number; sol: number; tokens: TokenBalance[] };

const TX_FEE = 5_000;
const ATA_RENT = 2_100_000; // generous for a Token-2022 ATA with ImmutableOwner
const MAX_TOKENS_PER_SWEEP = 4;

export const ALLOWED_PROGRAMS = new Set(
  [SystemProgram.programId, MEMO_PROGRAM_ID, TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, ComputeBudgetProgram.programId].map((k) =>
    k.toBase58(),
  ),
);

async function rawBalance(address: string): Promise<WalletBalance> {
  const owner = new PublicKey(address);
  const [lamports, legacy, t22] = await Promise.all([
    connection.getBalance(owner),
    connection.getParsedTokenAccountsByOwner(owner, { programId: TOKEN_PROGRAM_ID }),
    connection.getParsedTokenAccountsByOwner(owner, { programId: TOKEN_2022_PROGRAM_ID }),
  ]);
  const tokens: TokenBalance[] = [];
  for (const [list, programId] of [
    [legacy.value, TOKEN_PROGRAM_ID],
    [t22.value, TOKEN_2022_PROGRAM_ID],
  ] as const) {
    for (const acc of list) {
      const info = (acc.account.data as { parsed: { info: { mint: string; tokenAmount: { amount: string; decimals: number; uiAmount: number | null } } } }).parsed.info;
      if (!info.tokenAmount.uiAmount) continue;
      tokens.push({
        mint: info.mint,
        programId: programId.toBase58(),
        amountRaw: info.tokenAmount.amount,
        decimals: info.tokenAmount.decimals,
        uiAmount: info.tokenAmount.uiAmount,
        symbol: null,
        name: null,
      });
    }
  }
  return { address, lamports, sol: lamports / 1e9, tokens };
}

/** SOL + token balances, with names from our launches first and Birdeye second. */
export async function walletBalances(addresses: string[]): Promise<Record<string, WalletBalance>> {
  const balances = await Promise.all(addresses.map((a) => cached(`wallet:bal:${a}`, 10_000, () => rawBalance(a), { shared: false })));
  const mints = [...new Set(balances.flatMap((b) => b.tokens.map((t) => t.mint)))];
  if (mints.length) {
    const { data: launches } = await db.from("pqc_launches").select("mint, name, symbol").in("mint", mints);
    const known = new Map((launches ?? []).map((l) => [l.mint, l]));
    const metas = await Promise.all(mints.map((m) => (known.has(m) ? null : tokenMeta(m).catch(() => null))));
    mints.forEach((m, i) => {
      const l = known.get(m);
      const meta = metas[i];
      for (const b of balances) for (const t of b.tokens) if (t.mint === m) {
        t.symbol = l?.symbol ?? meta?.symbol ?? null;
        t.name = l?.name ?? meta?.name ?? null;
      }
    });
  }
  return Object.fromEntries(balances.map((b) => [b.address, b]));
}

function memoIx(memo: string) {
  return new TransactionInstruction({ programId: MEMO_PROGRAM_ID, keys: [], data: Buffer.from(utf8ToBytes(memo)) });
}

/**
 * Builds the transfer the derived wallet will sign. `mint` is "SOL", a token
 * mint, or "ALL" (rotate: every token plus the remaining SOL). `amountRaw` is
 * base units or "ALL". Fee payer is the source wallet itself.
 */
export async function buildTransfer(p: { from: string; to: string; mint: string; amountRaw: string; memo: string }) {
  const from = new PublicKey(p.from);
  const to = new PublicKey(p.to);
  const bal = await rawBalance(p.from);
  const ixs: TransactionInstruction[] = [ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 50_000 }), memoIx(p.memo)];

  const tokenIxs = async (t: TokenBalance, amount: bigint) => {
    const mint = new PublicKey(t.mint);
    const programId = new PublicKey(t.programId);
    const src = getAssociatedTokenAddressSync(mint, from, false, programId);
    const dst = getAssociatedTokenAddressSync(mint, to, true, programId);
    const exists = await connection.getAccountInfo(dst);
    if (!exists) ixs.push(createAssociatedTokenAccountIdempotentInstruction(from, dst, to, mint, programId));
    ixs.push(createTransferCheckedInstruction(src, mint, dst, from, amount, t.decimals, [], programId));
    return exists ? 0 : ATA_RENT;
  };

  if (p.mint === "ALL") {
    let reserve = TX_FEE + 10_000; // dust left behind so the account never dips below zero mid-tx
    for (const t of bal.tokens.slice(0, MAX_TOKENS_PER_SWEEP)) reserve += await tokenIxs(t, BigInt(t.amountRaw));
    const lamports = bal.lamports - reserve;
    if (lamports > 0) ixs.push(SystemProgram.transfer({ fromPubkey: from, toPubkey: to, lamports }));
    else if (!bal.tokens.length) throw new Error("Nothing to move");
  } else if (p.mint === "SOL") {
    const lamports = p.amountRaw === "ALL" ? bal.lamports - TX_FEE - 10_000 : Number(BigInt(p.amountRaw));
    if (lamports <= 0) throw new Error("Amount must be positive");
    if (lamports + TX_FEE > bal.lamports) throw new Error("Insufficient SOL (keep some for the fee)");
    ixs.push(SystemProgram.transfer({ fromPubkey: from, toPubkey: to, lamports }));
  } else {
    const t = bal.tokens.find((x) => x.mint === p.mint);
    if (!t) throw new Error("No balance for that token");
    const amount = p.amountRaw === "ALL" ? BigInt(t.amountRaw) : BigInt(p.amountRaw);
    if (amount <= BigInt(0) || amount > BigInt(t.amountRaw)) throw new Error("Amount exceeds balance");
    const rent = await tokenIxs(t, amount);
    if (bal.lamports < TX_FEE + rent) throw new Error("Not enough SOL in this wallet to pay the fee");
  }

  const { blockhash } = await connection.getLatestBlockhash("confirmed");
  const message = new TransactionMessage({ payerKey: from, recentBlockhash: blockhash, instructions: ixs }).compileToV0Message();
  return new VersionedTransaction(message);
}
