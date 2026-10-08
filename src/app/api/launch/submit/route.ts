import { PublicKey, VersionedTransaction } from "@solana/web3.js";
import { PUMP_PROGRAM_ID } from "@pump-fun/pump-sdk";
import { confirmSignature, connection } from "@/lib/server/solana";
import { db, type LaunchRow } from "@/lib/server/supabase";
import { bad, isPubkey } from "@/lib/server/validate";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body || !isPubkey(body.mint)) return bad("Invalid mint");

  const { data: launch } = await db.from("pqc_launches").select("*").eq("mint", body.mint).maybeSingle<LaunchRow>();
  if (!launch) return bad("Unknown launch", 404);
  if (launch.status === "live") return Response.json({ signature: launch.tx_signature, status: "live" });

  let tx: VersionedTransaction;
  try {
    tx = VersionedTransaction.deserialize(Buffer.from(String(body.signedTransaction), "base64"));
  } catch {
    return bad("Malformed transaction");
  }

  // Never broadcast a transaction we did not prepare.
  const keys = tx.message.staticAccountKeys;
  const payerOk = keys[0]?.equals(new PublicKey(launch.creator));
  const mintOk = keys.some((k) => k.toBase58() === launch.mint);
  const pumpOk = tx.message.compiledInstructions.some((ix) => keys[ix.programIdIndex]?.equals(PUMP_PROGRAM_ID));
  if (!payerOk || !mintOk || !pumpOk) return bad("Transaction does not match this launch");

  let signature: string;
  try {
    signature = await connection.sendRawTransaction(tx.serialize(), {
      skipPreflight: false,
      maxRetries: 3,
      preflightCommitment: "confirmed",
    });
  } catch (err) {
    await db.from("pqc_launches").update({ status: "failed" }).eq("mint", launch.mint);
    return bad(err instanceof Error ? err.message : "Broadcast failed", 502);
  }

  await db.from("pqc_launches").update({ tx_signature: signature }).eq("mint", launch.mint);

  let landed = false;
  try {
    landed = await confirmSignature(signature);
  } catch (err) {
    await db.from("pqc_launches").update({ status: "failed" }).eq("mint", launch.mint);
    return bad(err instanceof Error ? err.message : "Transaction failed", 502);
  }

  // Landed-but-unconfirmed stays pending rather than being marked failed.
  // TODO: background job that re-checks pending rows with a tx_signature.
  if (landed) {
    await db
      .from("pqc_launches")
      .update({ status: "live", launched_at: new Date().toISOString() })
      .eq("mint", launch.mint);
  }
  return Response.json({ signature, status: landed ? "live" : "pending" });
}
