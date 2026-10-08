import { bytesToHex } from "@noble/hashes/utils.js";
import { proofDigest } from "@/lib/pq/messages";
import { verify } from "@/lib/pq/xmss";
import { burnLeaf, db, type IdentityRow } from "@/lib/server/supabase";
import { bad, isPubkey, parseSignature, publicKeyOf } from "@/lib/server/validate";

/**
 * Proof of post-quantum key possession. Deliberately does NOT check any
 * ed25519 signature: the only thing proving control here is the hash-based
 * signature against the registered root. This is the login that keeps working
 * after elliptic curves fall.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body || !isPubkey(body.wallet) || typeof body.challengeId !== "string") return bad("Invalid body");
  const signature = parseSignature(body.signature);
  if (!signature) return bad("Malformed signature");

  const { data: challenge } = await db.from("pqc_challenges").select("*").eq("id", body.challengeId).maybeSingle();
  if (!challenge || challenge.wallet !== body.wallet) return bad("Unknown challenge", 404);
  if (challenge.used) return bad("Challenge already used", 409);
  if (new Date(challenge.expires_at).getTime() < Date.now()) return bad("Challenge expired", 410);

  const { data: identity } = await db
    .from("pqc_identities")
    .select("*")
    .eq("wallet", body.wallet)
    .maybeSingle<IdentityRow>();
  if (!identity) return bad("No identity", 404);

  const digest = proofDigest({ nonce: challenge.nonce, wallet: body.wallet, leaf: signature.leaf });
  const trace = verify(digest, signature, publicKeyOf(identity));

  // Consume the challenge whatever the outcome: no retries against one nonce.
  await db.from("pqc_challenges").update({ used: true }).eq("id", challenge.id);

  if (!trace.valid) return Response.json({ verified: false, trace });

  const burned = await burnLeaf({
    identity_id: identity.id,
    leaf_index: signature.leaf,
    purpose: "proof",
    message_hash: bytesToHex(digest),
    ref: challenge.id,
  });
  if (!burned) return bad("That one-time key was already used", 409);

  const { data: proof } = await db
    .from("pqc_proofs")
    .insert({
      identity_id: identity.id,
      wallet: body.wallet,
      pq_address: identity.pq_address,
      leaf_index: signature.leaf,
      challenge_id: challenge.id,
      message_hash: bytesToHex(digest),
      verified: true,
    })
    .select("*")
    .single();

  return Response.json({ verified: true, trace, proof });
}
