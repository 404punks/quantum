import "server-only";
import { ComputeBudgetProgram, SystemProgram, VersionedTransaction } from "@solana/web3.js";
import { ASSOCIATED_TOKEN_PROGRAM_ID, ERRORS, PROGRAM_ID, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID, TOMBSTONE_LEN } from "@/lib/vault";
import { cached } from "./cache";
import { confirmSignature, connection } from "./solana";

/** Everything a vault deposit, spend, sweep or cleanup touches. Anything else is refused. */
const VAULT_PROGRAMS = new Set(
  [PROGRAM_ID, SystemProgram.programId, ComputeBudgetProgram.programId, ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID].map((k) =>
    k.toBase58(),
  ),
);

export function rentFloors() {
  return cached("vault:rent", 60 * 60_000, async () => {
    const [zero, tombstone] = await Promise.all([
      connection.getMinimumBalanceForRentExemption(0),
      connection.getMinimumBalanceForRentExemption(TOMBSTONE_LEN),
    ]);
    return { zero, tombstone };
  });
}

/** Turns "custom program error: 0x1770" / {"Custom":6000} into the program's own message. */
export function explainVaultError(message: string) {
  const hex = /custom program error: 0x([0-9a-f]+)/i.exec(message);
  const dec = /"Custom":\s*(\d+)/.exec(message);
  const code = hex ? parseInt(hex[1], 16) : dec ? Number(dec[1]) : null;
  if (code !== null && ERRORS[code]) return { code, message: ERRORS[code] };
  if (/insufficient (funds|lamports)/i.test(message)) return { code: null, message: "Your wallet doesn't have enough SOL to pay for this." };
  if (/blockhash not found|block height exceeded/i.test(message)) return { code: null, message: "Transaction expired before it landed. Try again." };
  return { code, message };
}

/**
 * Relays one signed vault transaction and waits for confirmation. A withdraw
 * simulated on a node that hasn't seen the last signature chunk fails with
 * InvalidSignature (6000), so that one error is retried a few times.
 */
export async function relayVaultTransaction(serialized: Uint8Array) {
  const tx = VersionedTransaction.deserialize(serialized);
  const keys = tx.message.staticAccountKeys;
  if (tx.message.addressTableLookups.length) throw new Error("Lookup tables are not used by vault transactions");
  if (!tx.message.compiledInstructions.every((ix) => VAULT_PROGRAMS.has(keys[ix.programIdIndex]?.toBase58() ?? ""))) {
    throw new Error("Transaction calls a program the vault relay does not allow");
  }

  let signature = "";
  for (let attempt = 0; ; attempt++) {
    try {
      signature = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false, maxRetries: 3, preflightCommitment: "confirmed" });
      break;
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      const logs = (err as { logs?: string[] }).logs?.join("\n") ?? "";
      const explained = explainVaultError(`${raw}\n${logs}`);
      if (explained.code === 6000 && attempt < 4) {
        await new Promise((r) => setTimeout(r, 1_500));
        continue;
      }
      throw Object.assign(new Error(explained.message), { code: explained.code });
    }
  }

  try {
    const landed = await confirmSignature(signature);
    return { signature, status: landed ? ("confirmed" as const) : ("pending" as const) };
  } catch (err) {
    const explained = explainVaultError(err instanceof Error ? err.message : String(err));
    throw Object.assign(new Error(explained.message), { code: explained.code, signature });
  }
}
