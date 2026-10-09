import "server-only";
import { NATIVE_MINT } from "@solana/spl-token";
import { PublicKey, TransactionInstruction, type AddressLookupTableAccount } from "@solana/web3.js";
import { connection } from "./solana";

/**
 * Jupiter (free lite API): SOL → quote token swaps, so a creator can launch a
 * coin paired with e.g. tokenized NVIDIA while only holding SOL.
 */

/** Free endpoint first, the main one when it is down (lite-api has served 503 HTML pages). */
const BASES = ["https://lite-api.jup.ag/swap/v1", "https://api.jup.ag/swap/v1"];

async function fetchJson(url: string, init: RequestInit = {}) {
  const res = await fetch(url, { ...init, cache: "no-store", signal: AbortSignal.timeout(10_000) });
  const text = await res.text();
  let json: Record<string, unknown> | null = null;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Jupiter unavailable (${new URL(url).host} ${res.status})`);
  }
  return { ok: res.ok, status: res.status, json: json as Record<string, any> };
}
export const SWAP_SLIPPAGE_BPS = 100;
/** Keeps routes small enough to share a transaction with the pump create. */
const MAX_ACCOUNTS = 24;

export type SwapQuote = {
  /** Which endpoint produced the quote; the swap is built on the same one. */
  _base?: string;
  inAmount: string;
  outAmount: string;
  otherAmountThreshold: string;
  priceImpactPct: string;
  routePlan: { swapInfo: { label?: string } }[];
};

export async function quoteSolTo(outputMint: string, lamports: bigint): Promise<SwapQuote> {
  let last: unknown = null;
  for (const base of BASES) {
    try {
      const { ok, status, json } = await fetchJson(
        `${base}/quote?inputMint=${NATIVE_MINT.toBase58()}&outputMint=${outputMint}&amount=${lamports}&slippageBps=${SWAP_SLIPPAGE_BPS}&maxAccounts=${MAX_ACCOUNTS}&restrictIntermediateTokens=true`,
      );
      if (!ok || !json.outAmount) throw new Error(json.error ?? `No Jupiter route to that token right now (${status})`);
      return { ...(json as SwapQuote), _base: base };
    } catch (err) {
      last = err;
    }
  }
  throw last instanceof Error ? last : new Error("Jupiter unavailable");
}

type RawIx = { programId: string; accounts: { pubkey: string; isSigner: boolean; isWritable: boolean }[]; data: string };

const toIx = (ix: RawIx) =>
  new TransactionInstruction({
    programId: new PublicKey(ix.programId),
    keys: ix.accounts.map((a) => ({ pubkey: new PublicKey(a.pubkey), isSigner: a.isSigner, isWritable: a.isWritable })),
    data: Buffer.from(ix.data, "base64"),
  });

/** The swap as raw instructions (no compute budget: the launch sets its own) plus the lookup tables it needs. */
export async function swapInstructions(quote: SwapQuote, user: PublicKey) {
  const { _base, ...quoteResponse } = quote;
  const bases = _base ? [_base, ...BASES.filter((b) => b !== _base)] : BASES;
  let json: Record<string, any> | null = null;
  let last: unknown = null;
  for (const base of bases) {
    try {
      const res = await fetchJson(`${base}/swap-instructions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quoteResponse, userPublicKey: user.toBase58(), wrapAndUnwrapSol: true, dynamicComputeUnitLimit: false }),
      });
      if (!res.ok || !res.json.swapInstruction) throw new Error(res.json.error ?? `Jupiter swap build failed (${res.status})`);
      json = res.json;
      break;
    } catch (err) {
      last = err;
    }
  }
  if (!json) throw last instanceof Error ? last : new Error("Jupiter swap build failed");
  const instructions: TransactionInstruction[] = [
    ...((json.otherInstructions ?? []) as RawIx[]).map(toIx),
    ...((json.setupInstructions ?? []) as RawIx[]).map(toIx),
    toIx(json.swapInstruction as RawIx),
    ...(json.cleanupInstruction ? [toIx(json.cleanupInstruction as RawIx)] : []),
  ];
  const tables = await lookupTables((json.addressLookupTableAddresses ?? []) as string[]);
  return { instructions, tables };
}

async function lookupTables(addresses: string[]): Promise<AddressLookupTableAccount[]> {
  const out = await Promise.all(addresses.map((a) => connection.getAddressLookupTable(new PublicKey(a)).then((r) => r.value)));
  return out.filter((t): t is AddressLookupTableAccount => Boolean(t));
}

/** Programs a Jupiter swap transaction may call; the submit route checks swap transactions against this. */
export const JUPITER_PROGRAM_ID = new PublicKey("JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4");
