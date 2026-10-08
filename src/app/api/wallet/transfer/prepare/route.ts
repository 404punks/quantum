import { transferDigest, transferMemo } from "@/lib/pq/messages";
import { isSchemeId, type SchemeId } from "@/lib/pq/schemes";
import { isRejected, verifyAndBurn } from "@/lib/server/attest";
import { db, type IdentityRow } from "@/lib/server/supabase";
import { bad, isPubkey } from "@/lib/server/validate";
import { buildTransfer } from "@/lib/server/wallet";

const HEX_NONCE = /^[0-9a-f]{32}$/;

/**
 * Verifies the post-quantum attestation over the transfer, then builds the
 * transaction the derived wallet signs. The memo carries the attestation hash
 * so the on-chain record points at a quantum-proof authorization.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body || !isPubkey(body.wallet) || !isPubkey(body.from) || !isPubkey(body.to)) return bad("Invalid addresses");
  if (body.from === body.to) return bad("Source and destination are the same");
  const mint = String(body.mint ?? "");
  if (mint !== "SOL" && mint !== "ALL" && !isPubkey(mint)) return bad("Invalid asset");
  const amountRaw = String(body.amountRaw ?? "");
  if (amountRaw !== "ALL" && !/^[0-9]{1,24}$/.test(amountRaw)) return bad("Invalid amount");
  if (mint === "ALL" && amountRaw !== "ALL") return bad("A rotate moves everything");
  if (typeof body.nonce !== "string" || !HEX_NONCE.test(body.nonce)) return bad("Invalid nonce");
  const scheme: SchemeId = isSchemeId(body.scheme) ? body.scheme : "wots";

  const { data: identity } = await db.from("pqc_identities").select("*").eq("wallet", body.wallet).maybeSingle<IdentityRow>();
  if (!identity) return bad("Register a post-quantum identity first", 403);
  const { data: source } = await db.from("pqc_wallets").select("id, status").eq("address", body.from).eq("identity_id", identity.id).maybeSingle();
  if (!source) return bad("That wallet is not one of yours", 403);
  if (source.status !== "active") return bad("That wallet was rotated away; it no longer sends", 409);

  const base = { from: body.from, to: body.to, mint, amount: amountRaw, nonce: body.nonce };
  const verified = await verifyAndBurn(identity, scheme, body.attestation, (leaf) => transferDigest({ ...base, leaf, scheme }), {
    purpose: "transfer",
    ref: `${body.from}→${body.to}`,
  });
  if (isRejected(verified)) return bad(verified.error, verified.status);

  const memo = transferMemo(identity.pq_address, scheme, verified.messageHash);
  let tx;
  try {
    tx = await buildTransfer({ from: body.from, to: body.to, mint, amountRaw, memo });
  } catch (err) {
    return bad(err instanceof Error ? err.message : "Could not build transfer", 400);
  }

  const { data: row, error } = await db
    .from("pqc_transfers")
    .insert({
      wallet_id: source.id,
      from_address: body.from,
      to_address: body.to,
      mint,
      amount_raw: amountRaw,
      scheme,
      attestation: verified.stored,
      message_hash: verified.messageHash,
      nonce: body.nonce,
      memo,
      status: "pending",
    })
    .select("id")
    .single();
  if (error) return bad(error.message, 500);

  return Response.json({ id: row.id, memo, transaction: Buffer.from(tx.serialize()).toString("base64") });
}
