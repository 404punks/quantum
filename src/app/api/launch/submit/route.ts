import { ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { ComputeBudgetProgram, PublicKey, SystemProgram, VersionedTransaction } from "@solana/web3.js";
import { PUMP_PROGRAM_ID } from "@pump-fun/pump-sdk";
import { announceLaunch } from "@/lib/server/feed";
import { JUPITER_PROGRAM_ID } from "@/lib/server/jupiter";
import { confirmSignature, connection } from "@/lib/server/solana";
import { db, type LaunchRow } from "@/lib/server/supabase";
import { bad, isPubkey } from "@/lib/server/validate";

/** Top-level programs a pre-launch Jupiter swap may call (DEXes run inside Jupiter's CPI). */
const SWAP_PROGRAMS = new Set(
  [JUPITER_PROGRAM_ID, ComputeBudgetProgram.programId, SystemProgram.programId, TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID].map((k) => k.toBase58()),
);

async function send(tx: VersionedTransaction) {
  const signature = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false, maxRetries: 3, preflightCommitment: "confirmed" });
  return { signature, landed: await confirmSignature(signature) };
}

/**
 * Broadcasts a prepared launch. SOL pairs (and token pairs without a dev buy)
 * are one transaction. A token pair with a dev buy is two, signed in one
 * wallet prompt: the Jupiter swap SOL → quote token, then the launch, which
 * is only sent once the swap has confirmed.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body || !isPubkey(body.mint)) return bad("Invalid mint");

  const { data: launch } = await db.from("pqc_launches").select("*").eq("mint", body.mint).maybeSingle<LaunchRow>();
  if (!launch) return bad("Unknown launch", 404);
  if (launch.status === "live") return Response.json({ signature: launch.tx_signature, status: "live" });

  const raw: unknown[] = Array.isArray(body.signedTransactions) ? body.signedTransactions : [body.signedTransaction];
  if (!raw.length || raw.length > 2) return bad("Malformed transaction");
  let txs: VersionedTransaction[];
  try {
    txs = raw.map((t) => VersionedTransaction.deserialize(Buffer.from(String(t), "base64")));
  } catch {
    return bad("Malformed transaction");
  }

  // Never broadcast a transaction we did not prepare.
  const creator = new PublicKey(launch.creator);
  const launchTx = txs[txs.length - 1];
  const keys = launchTx.message.staticAccountKeys;
  const payerOk = txs.every((tx) => tx.message.staticAccountKeys[0]?.equals(creator));
  const mintOk = keys.some((k) => k.toBase58() === launch.mint);
  const pumpOk = launchTx.message.compiledInstructions.some((ix) => keys[ix.programIdIndex]?.equals(PUMP_PROGRAM_ID));
  const swapOk = txs.slice(0, -1).every((tx) => {
    const k = tx.message.staticAccountKeys;
    return tx.message.compiledInstructions.every((ix) => SWAP_PROGRAMS.has(k[ix.programIdIndex]?.toBase58() ?? ""));
  });
  if (!payerOk || !mintOk || !pumpOk || !swapOk) return bad("Transaction does not match this launch");

  const pair = launch.quote_symbol ?? "the pair token";
  let swapSignature: string | null = null;
  if (txs.length === 2) {
    try {
      const swap = await send(txs[0]);
      swapSignature = swap.signature;
      if (!swap.landed) return bad(`The SOL → ${pair} swap didn't confirm in time. Nothing was launched; try again.`, 502);
    } catch (err) {
      await db.from("pqc_launches").update({ status: "failed" }).eq("mint", launch.mint);
      const msg = err instanceof Error ? err.message : "Swap failed";
      return bad(`The SOL → ${pair} swap failed, so nothing was launched. ${msg.includes("insufficient") ? "Not enough SOL." : msg}`, 502);
    }
  }

  let signature: string;
  try {
    signature = await connection.sendRawTransaction(launchTx.serialize(), { skipPreflight: false, maxRetries: 3, preflightCommitment: "confirmed" });
  } catch (err) {
    await db.from("pqc_launches").update({ status: "failed" }).eq("mint", launch.mint);
    const msg = err instanceof Error ? err.message : "Broadcast failed";
    return bad(swapSignature ? `Swapped to ${pair}, but the launch failed: ${msg}. Your ${pair} is in your wallet.` : msg, 502);
  }

  await db.from("pqc_launches").update({ tx_signature: signature }).eq("mint", launch.mint);

  let landed = false;
  try {
    landed = await confirmSignature(signature);
  } catch (err) {
    await db.from("pqc_launches").update({ status: "failed" }).eq("mint", launch.mint);
    const msg = err instanceof Error ? err.message : "Transaction failed";
    return bad(swapSignature ? `Swapped to ${pair}, but the launch failed: ${msg}. Your ${pair} is in your wallet.` : msg, 502);
  }

  // Landed-but-unconfirmed stays pending rather than being marked failed.
  // TODO: background job that re-checks pending rows with a tx_signature.
  if (landed) {
    await db
      .from("pqc_launches")
      .update({ status: "live", launched_at: new Date().toISOString() })
      .eq("mint", launch.mint);
    await announceLaunch(launch.mint);
  }
  return Response.json({ signature, swapSignature, status: landed ? "live" : "pending" });
}
