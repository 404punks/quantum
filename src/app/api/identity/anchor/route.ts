import { utf8ToBytes } from "@noble/hashes/utils.js";
import {
  ComputeBudgetProgram,
  PublicKey,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import { anchorMemo } from "@/lib/pq/messages";
import { MEMO_PROGRAM_ID, confirmSignature, connection } from "@/lib/server/solana";
import { db, type IdentityRow } from "@/lib/server/supabase";
import { bad, isPubkey } from "@/lib/server/validate";

/**
 * Timestamps the identity root on Solana with a memo, signed by the wallet.
 * If ed25519 ever breaks, this pre-break anchor is what proves the root
 * belonged to the wallet before anyone could forge its signatures.
 *
 * action "prepare" → unsigned memo tx; action "submit" → broadcast signed tx.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body || !isPubkey(body.wallet)) return bad("Invalid wallet");

  const { data: identity } = await db
    .from("pqc_identities")
    .select("*")
    .eq("wallet", body.wallet)
    .maybeSingle<IdentityRow>();
  if (!identity) return bad("No registered identity", 404);
  if (identity.anchor_tx) return bad("Identity is already anchored", 409);

  const memo = anchorMemo(identity.pq_address, identity.root);
  const wallet = new PublicKey(body.wallet);

  if (body.action === "prepare") {
    const { blockhash } = await connection.getLatestBlockhash("confirmed");
    const message = new TransactionMessage({
      payerKey: wallet,
      recentBlockhash: blockhash,
      instructions: [
        ComputeBudgetProgram.setComputeUnitLimit({ units: 30_000 }),
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 100_000 }),
        new TransactionInstruction({
          programId: MEMO_PROGRAM_ID,
          keys: [{ pubkey: wallet, isSigner: true, isWritable: false }],
          data: Buffer.from(utf8ToBytes(memo)),
        }),
      ],
    }).compileToV0Message();
    return Response.json({
      memo,
      transaction: Buffer.from(new VersionedTransaction(message).serialize()).toString("base64"),
    });
  }

  if (body.action === "submit") {
    let tx: VersionedTransaction;
    try {
      tx = VersionedTransaction.deserialize(Buffer.from(String(body.signedTransaction), "base64"));
    } catch {
      return bad("Malformed transaction");
    }
    // Only broadcast exactly the memo we prepared, paid by this wallet.
    const keys = tx.message.staticAccountKeys;
    const payerOk = keys[0]?.equals(wallet);
    const memoOk = tx.message.compiledInstructions.some(
      (ix) =>
        keys[ix.programIdIndex]?.equals(MEMO_PROGRAM_ID) &&
        Buffer.from(ix.data).toString("utf8") === memo,
    );
    const onlyExpectedPrograms = tx.message.compiledInstructions.every((ix) => {
      const program = keys[ix.programIdIndex]?.toBase58();
      return program === MEMO_PROGRAM_ID.toBase58() || program === "ComputeBudget111111111111111111111111111111";
    });
    if (!payerOk || !memoOk || !onlyExpectedPrograms) return bad("Transaction does not match the anchor memo");

    const signature = await connection.sendRawTransaction(tx.serialize(), { maxRetries: 3 });
    const landed = await confirmSignature(signature);
    if (landed) {
      await db
        .from("pqc_identities")
        .update({ anchor_tx: signature, anchored_at: new Date().toISOString() })
        .eq("id", identity.id);
    }
    return Response.json({ signature, status: landed ? "confirmed" : "pending" });
  }

  return bad("Unknown action");
}
