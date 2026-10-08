import "server-only";
import { bytesToHex } from "@noble/hashes/utils.js";
import { SCHEMES, bindingDigest, schemeVerify, type SchemeAttestation, type SchemeId } from "@/lib/pq/schemes";
import { verify, type PqSignature } from "@/lib/pq/xmss";
import { burnLeaf, db, type IdentityRow } from "./supabase";
import { isHexUpTo, parseSignature, publicKeyOf } from "./validate";

export type Verified = { digest: Uint8Array; messageHash: string; leaf: number | null; stored: PqSignature | SchemeAttestation };
export type Rejected = { error: string; status: number };

/**
 * Server-side check of a client attestation, shared by every signed action.
 * WOTS: verifies against the root and burns the leaf (one-time use enforced by
 * the ledger). Schemes: re-checks the certificate chain root → binding → key,
 * then the scheme signature. `digestFor` rebuilds the message for a given leaf.
 */
export async function verifyAndBurn(
  identity: IdentityRow,
  scheme: SchemeId,
  body: unknown,
  digestFor: (leaf: number | null) => Uint8Array,
  burn: { purpose: "launch" | "transfer"; ref: string },
): Promise<Verified | Rejected> {
  if (scheme === "wots") {
    const attestation = parseSignature(body);
    if (!attestation) return { error: "Missing post-quantum attestation", status: 400 };
    const digest = digestFor(attestation.leaf);
    if (!verify(digest, attestation, publicKeyOf(identity)).valid) {
      return { error: "Attestation does not verify against your identity root", status: 400 };
    }
    const messageHash = bytesToHex(digest);
    const burned = await burnLeaf({ identity_id: identity.id, leaf_index: attestation.leaf, purpose: burn.purpose, message_hash: messageHash, ref: burn.ref });
    if (!burned) return { error: "That one-time key was already used. Refresh and retry.", status: 409 };
    return { digest, messageHash, leaf: attestation.leaf, stored: attestation };
  }

  const info = SCHEMES[scheme];
  const signature = (body as { signature?: unknown } | null)?.signature;
  if (!isHexUpTo(signature, info.sigBytes + 64)) return { error: "Missing or malformed signature", status: 400 };
  const { data: key } = await db
    .from("pqc_scheme_keys")
    .select("public_key, binding")
    .eq("identity_id", identity.id)
    .eq("scheme", scheme)
    .maybeSingle<{ public_key: string; binding: PqSignature }>();
  if (!key) return { error: `Bind your ${info.name} key to your identity first`, status: 403 };
  const bindOk = verify(bindingDigest({ scheme, publicKey: key.public_key, pqAddress: identity.pq_address }), key.binding, publicKeyOf(identity)).valid;
  if (!bindOk) return { error: "Stored scheme binding is invalid", status: 500 };
  const digest = digestFor(null);
  if (!(await schemeVerify(scheme, digest, signature, key.public_key))) return { error: `${info.name} signature does not verify`, status: 400 };
  return { digest, messageHash: bytesToHex(digest), leaf: null, stored: { scheme, signature, publicKey: key.public_key, binding: key.binding } };
}

export function isRejected(v: Verified | Rejected): v is Rejected {
  return "error" in v;
}
