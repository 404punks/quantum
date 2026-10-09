import { PublicKey } from "@solana/web3.js";
import { vaultState } from "@/lib/vault";
import { connection } from "@/lib/server/solana";
import { db } from "@/lib/server/supabase";
import { bad, isHex32 } from "@/lib/server/validate";

const SIG = /^[1-9A-HJ-NP-Za-km-z]{64,90}$/;
const sigs = (v: unknown) => (Array.isArray(v) ? v.filter((s): s is string => typeof s === "string" && SIG.test(s)).slice(0, 8) : []);

/** Attaches transaction signatures to a spend; marks it withdrawn once the vault is a tombstone on-chain. */
export async function POST(request: Request) {
  const b = await request.json().catch(() => null);
  if (!b || !isHex32(b.tag)) return bad("Invalid body");
  const { data: row } = await db.from("pqc_vault_spends").select("tag, vault, write_txs, cleanup_txs, status").eq("tag", b.tag).maybeSingle();
  if (!row) return bad("Unknown spend", 404);

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  const writes = sigs(b.writeTxs);
  if (writes.length) patch.write_txs = [...new Set([...(row.write_txs ?? []), ...writes])].slice(-12);
  const cleanups = sigs(b.cleanupTxs);
  if (cleanups.length) patch.cleanup_txs = [...new Set([...(row.cleanup_txs ?? []), ...cleanups])].slice(-12);
  if (typeof b.withdrawTx === "string" && SIG.test(b.withdrawTx)) patch.withdraw_tx = b.withdrawTx;

  if (row.status !== "withdrawn") {
    const info = await connection.getAccountInfo(new PublicKey(row.vault), "confirmed");
    if (vaultState(info).kind === "spent") patch.status = "withdrawn";
  }
  await db.from("pqc_vault_spends").update(patch).eq("tag", b.tag);
  return Response.json({ ok: true, status: patch.status ?? row.status });
}
