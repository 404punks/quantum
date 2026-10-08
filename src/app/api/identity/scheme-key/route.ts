import { bytesToHex } from "@noble/hashes/utils.js";
import { SCHEMES, bindingDigest, isSchemeId, type SchemeId } from "@/lib/pq/schemes";
import { verify } from "@/lib/pq/xmss";
import { burnLeaf, db, type IdentityRow } from "@/lib/server/supabase";
import { bad, isHexUpTo, isPubkey, parseSignature, publicKeyOf } from "@/lib/server/validate";

/**
 * Certifies a many-time scheme key (ML-DSA, SLH-DSA, Falcon) under the
 * identity's WOTS root: one leaf signs the binding digest, once per scheme.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body || !isPubkey(body.wallet)) return bad("Invalid wallet");
  if (!isSchemeId(body.scheme) || body.scheme === "wots") return bad("Unknown scheme");
  const scheme = body.scheme as Exclude<SchemeId, "wots">;
  if (!isHexUpTo(body.publicKey, SCHEMES[scheme].pkBytes) || body.publicKey.length !== SCHEMES[scheme].pkBytes * 2) {
    return bad("Invalid public key");
  }
  const binding = parseSignature(body.binding);
  if (!binding) return bad("Malformed binding signature");

  const { data: identity } = await db.from("pqc_identities").select("*").eq("wallet", body.wallet).maybeSingle<IdentityRow>();
  if (!identity) return bad("Register a post-quantum identity first", 403);

  const { data: existing } = await db
    .from("pqc_scheme_keys")
    .select("public_key")
    .eq("identity_id", identity.id)
    .eq("scheme", scheme)
    .maybeSingle();
  if (existing) return bad("This scheme key is already bound", 409);

  const d = bindingDigest({ scheme, publicKey: body.publicKey, pqAddress: identity.pq_address });
  if (!verify(d, binding, publicKeyOf(identity)).valid) return bad("Binding does not verify against your identity root");

  const burned = await burnLeaf({ identity_id: identity.id, leaf_index: binding.leaf, purpose: "bind", message_hash: bytesToHex(d), ref: scheme });
  if (!burned) return bad("That one-time key was already used. Refresh and retry.", 409);

  const { error } = await db.from("pqc_scheme_keys").insert({ identity_id: identity.id, scheme, public_key: body.publicKey, binding });
  if (error) return bad(error.message, 500);
  return Response.json({ ok: true });
}
