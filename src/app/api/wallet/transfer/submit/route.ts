import { PublicKey, VersionedTransaction } from "@solana/web3.js";
import { MEMO_PROGRAM_ID, confirmSignature, connection } from "@/lib/server/solana";
import { db } from "@/lib/server/supabase";
import { bad } from "@/lib/server/validate";
import { ALLOWED_PROGRAMS } from "@/lib/server/wallet";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body.id !== "string") return bad("Invalid body");

  const { data: row } = await db.from("pqc_transfers").select("*").eq("id", body.id).maybeSingle();
  if (!row) return bad("Unknown transfer", 404);
  if (row.status === "confirmed") return Response.json({ signature: row.tx_signature, status: "confirmed" });

  let tx: VersionedTransaction;
  try {
    tx = VersionedTransaction.deserialize(Buffer.from(String(body.signedTransaction), "base64"));
  } catch {
    return bad("Malformed transaction");
  }

  // Only relay exactly the transfer we prepared: same payer, our memo, known programs.
  const keys = tx.message.staticAccountKeys;
  const payerOk = keys[0]?.equals(new PublicKey(row.from_address));
  const memoOk = tx.message.compiledInstructions.some(
    (ix) => keys[ix.programIdIndex]?.equals(MEMO_PROGRAM_ID) && Buffer.from(ix.data).toString("utf8") === row.memo,
  );
  const programsOk = tx.message.compiledInstructions.every((ix) => ALLOWED_PROGRAMS.has(keys[ix.programIdIndex]?.toBase58() ?? ""));
  if (!payerOk || !memoOk || !programsOk) return bad("Transaction does not match this transfer");

  let signature: string;
  try {
    signature = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false, maxRetries: 3, preflightCommitment: "confirmed" });
  } catch (err) {
    await db.from("pqc_transfers").update({ status: "failed" }).eq("id", row.id);
    const msg = err instanceof Error ? err.message : "Broadcast failed";
    return bad(msg.includes("insufficient") ? "Insufficient SOL in the sending wallet for the fee" : msg, 502);
  }
  await db.from("pqc_transfers").update({ tx_signature: signature }).eq("id", row.id);

  let landed = false;
  try {
    landed = await confirmSignature(signature);
  } catch (err) {
    await db.from("pqc_transfers").update({ status: "failed" }).eq("id", row.id);
    return bad(err instanceof Error ? err.message : "Transaction failed", 502);
  }
  if (landed) {
    await db.from("pqc_transfers").update({ status: "confirmed", confirmed_at: new Date().toISOString() }).eq("id", row.id);
    // A rotate empties the wallet: retire it so it never receives or sends again.
    if (row.mint === "ALL") await db.from("pqc_wallets").update({ status: "retired", retired_at: new Date().toISOString() }).eq("id", row.wallet_id);
  }
  return Response.json({ signature, status: landed ? "confirmed" : "pending" });
}
