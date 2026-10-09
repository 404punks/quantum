import "server-only";
import {
  AddressLookupTableAccount,
  AddressLookupTableProgram,
  Keypair,
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
  type TransactionInstruction,
} from "@solana/web3.js";
import bs58 from "bs58";
import { confirmSignature, connection, pumpLookupTable } from "./solana";

/**
 * pqc.market's own address lookup tables. Each address in one costs a launch
 * transaction 1 byte instead of 32, which is what lets a pair launch (quote
 * mint, its curve, pool and fee accounts) plus a quantum-vault dev buy fit in
 * Solana's 1,232-byte limit.
 *
 * A table holds 256 addresses (about 30 pump.fun-coin pairs), so there are as
 * many tables as needed: the server finds every table its authority owns on
 * chain, puts a pair's accounts in one with room, and creates a new table when
 * they are all full. A launch only loads the one table holding its pair.
 */

const TABLE_CAPACITY = 256;
const PER_EXTEND = 20;
/** Byte offset of the authority pubkey in a lookup-table account. */
const AUTHORITY_OFFSET = 22;

export function lookupAuthority(): Keypair | null {
  const secret = process.env.PQC_ALT_AUTHORITY;
  return secret ? Keypair.fromSecretKey(bs58.decode(secret)) : null;
}

export const lookupTablesEnabled = () => Boolean(lookupAuthority());

let tables: AddressLookupTableAccount[] | null = null;
let fetchedAt = 0;

/** Every lookup table our authority owns, straight from the chain (no database to drift). */
export async function ourLookupTables(force = false): Promise<AddressLookupTableAccount[]> {
  const authority = lookupAuthority();
  if (!authority) return [];
  if (!force && tables && Date.now() - fetchedAt < 60_000) return tables;
  const accounts = await connection.getProgramAccounts(AddressLookupTableProgram.programId, {
    commitment: "confirmed",
    filters: [{ memcmp: { offset: AUTHORITY_OFFSET, bytes: authority.publicKey.toBase58() } }],
  });
  tables = accounts
    .map(({ pubkey, account }) => new AddressLookupTableAccount({ key: pubkey, state: AddressLookupTableAccount.deserialize(account.data) }))
    .filter((t) => t.isActive())
    .sort((a, b) => a.key.toBase58().localeCompare(b.key.toBase58()));
  fetchedAt = Date.now();
  return tables;
}

const keysOf = (ixs: TransactionInstruction[]) => {
  const out = new Map<string, boolean>();
  for (const ix of ixs) {
    out.set(ix.programId.toBase58(), out.get(ix.programId.toBase58()) ?? false);
    for (const k of ix.keys) out.set(k.pubkey.toBase58(), (out.get(k.pubkey.toBase58()) ?? false) || k.isSigner);
  }
  return out;
};

/**
 * The accounts that depend only on the pair, not on who launches or which mint:
 * the instruction set is built twice with throwaway users and mints, and only
 * non-signer accounts present in both are kept.
 */
export async function pairStaticKeys(build: (mint: PublicKey, user: PublicKey) => Promise<TransactionInstruction[]>): Promise<PublicKey[]> {
  const [a, b] = await Promise.all([
    build(Keypair.generate().publicKey, Keypair.generate().publicKey),
    build(Keypair.generate().publicKey, Keypair.generate().publicKey),
  ]);
  const ka = keysOf(a);
  const kb = keysOf(b);
  return [...ka].filter(([k, signer]) => !signer && kb.has(k) && !kb.get(k)).map(([k]) => new PublicKey(k));
}

async function send(authority: Keypair, instructions: TransactionInstruction[]) {
  const { blockhash } = await connection.getLatestBlockhash("confirmed");
  const tx = new VersionedTransaction(new TransactionMessage({ payerKey: authority.publicKey, recentBlockhash: blockhash, instructions }).compileToV0Message());
  tx.sign([authority]);
  await confirmSignature(await connection.sendRawTransaction(tx.serialize()));
}

async function extend(authority: Keypair, table: PublicKey, addresses: PublicKey[]) {
  for (let i = 0; i < addresses.length; i += PER_EXTEND) {
    await send(authority, [
      AddressLookupTableProgram.extendLookupTable({ lookupTable: table, authority: authority.publicKey, payer: authority.publicKey, addresses: addresses.slice(i, i + PER_EXTEND) }),
    ]);
  }
}

let pending: Promise<unknown> | null = null;

/**
 * The one table of ours that holds every one of `keys` not already in pump.fun's
 * table, adding them (to a table with room, or a brand-new table) if needed.
 * Null when lookup tables aren't configured or nothing is missing from pump's.
 */
export async function lookupTableFor(keys: PublicKey[]): Promise<AddressLookupTableAccount | null> {
  const authority = lookupAuthority();
  if (!authority || !keys.length) return null;
  while (pending) await pending.catch(() => {});

  const pump = await pumpLookupTable();
  const inPump = new Set(pump.state.addresses.map((k) => k.toBase58()));
  const needed = [...new Set(keys.map((k) => k.toBase58()))].filter((k) => !inPump.has(k));
  if (!needed.length) return null;

  const run = (async () => {
    const owned = await ourLookupTables();
    const holds = (t: AddressLookupTableAccount) => {
      const set = new Set(t.state.addresses.map((k) => k.toBase58()));
      return needed.filter((k) => !set.has(k));
    };

    // 1. Already all in one table.
    const full = owned.find((t) => holds(t).length === 0);
    if (full) return full;

    // 2. A table with room for what it's missing.
    const roomy = owned.find((t) => t.state.addresses.length + holds(t).length <= TABLE_CAPACITY);
    let target: PublicKey;
    let toAdd: PublicKey[];
    if (roomy) {
      target = roomy.key;
      toAdd = holds(roomy).map((k) => new PublicKey(k));
    } else {
      // 3. Everything full: open a new table.
      const recentSlot = await connection.getSlot("finalized");
      const [create, table] = AddressLookupTableProgram.createLookupTable({ authority: authority.publicKey, payer: authority.publicKey, recentSlot });
      await send(authority, [create]);
      target = table;
      toAdd = needed.map((k) => new PublicKey(k));
    }
    await extend(authority, target, toAdd);
    // Addresses become usable from the slot after they are added.
    await new Promise((r) => setTimeout(r, 1_500));
    const refreshed = await ourLookupTables(true);
    return refreshed.find((t) => t.key.equals(target)) ?? null;
  })();
  pending = run;
  try {
    return await run;
  } finally {
    pending = null;
  }
}
