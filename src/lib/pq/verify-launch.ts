import { bytesToHex } from "@noble/hashes/utils.js";
import { launchDigest, transferDigest } from "./messages";
import { bindingDigest, isSchemeId, schemeVerify, type SchemeAttestation } from "./schemes";
import { verify, type PqSignature, type VerifyTrace } from "./xmss";

export type IdentityKey = { pq_address: string; root: string; pub_seed: string; height: number };

export type LaunchVerification =
  | { kind: "wots"; valid: boolean; digest: string; leaf: number; trace: VerifyTrace }
  | {
      kind: "scheme";
      valid: boolean;
      digest: string;
      scheme: SchemeAttestation["scheme"];
      signatureValid: boolean;
      signatureBytes: number;
      publicKeyBytes: number;
      leaf: number; // the WOTS leaf that certified the scheme key
      certificate: VerifyTrace;
      certificateDigest: string;
    };

/**
 * Checks any pqc.market attestation (launch or transfer) against the signer's
 * registered root. `digestFor` rebuilds the message from public fields, given
 * the leaf a WOTS signature claims; the stored hash is never trusted.
 */
export async function verifyAttestation(
  digestFor: (leaf: number | null) => Uint8Array,
  scheme: string | null | undefined,
  attestation: unknown,
  identity: IdentityKey,
): Promise<LaunchVerification> {
  const pk = { root: identity.root, pubSeed: identity.pub_seed, height: identity.height };

  if (!scheme || scheme === "wots" || !isSchemeId(scheme)) {
    const sig = attestation as PqSignature;
    const d = digestFor(sig.leaf);
    const trace = verify(d, sig, pk);
    return { kind: "wots", valid: trace.valid, digest: bytesToHex(d), leaf: sig.leaf, trace };
  }

  const att = attestation as SchemeAttestation;
  const s = scheme as SchemeAttestation["scheme"];
  const cd = bindingDigest({ scheme: s, publicKey: att.publicKey, pqAddress: identity.pq_address });
  const certificate = verify(cd, att.binding, pk);
  const d = digestFor(null);
  const signatureValid = await schemeVerify(s, d, att.signature, att.publicKey);
  return {
    kind: "scheme",
    valid: certificate.valid && signatureValid,
    digest: bytesToHex(d),
    scheme: s,
    signatureValid,
    signatureBytes: att.signature.length / 2,
    publicKeyBytes: att.publicKey.length / 2,
    leaf: att.binding.leaf,
    certificate,
    certificateDigest: bytesToHex(cd),
  };
}

export type LaunchFields = {
  mint: string;
  creator: string;
  name: string;
  symbol: string;
  image_url: string;
  leaf_index: number | null;
  scheme?: string | null;
  attestation: unknown;
};

export function verifyLaunch(launch: LaunchFields, identity: IdentityKey) {
  const base = { mint: launch.mint, creator: launch.creator, name: launch.name, symbol: launch.symbol, image: launch.image_url };
  return verifyAttestation(
    (leaf) => launchDigest({ ...base, leaf: launch.leaf_index ?? leaf, scheme: launch.scheme }),
    launch.scheme,
    launch.attestation,
    identity,
  );
}

export type TransferFields = {
  from_address: string;
  to_address: string;
  mint: string;
  amount_raw: string;
  nonce: string;
  scheme?: string | null;
  attestation: unknown;
};

export function verifyTransfer(t: TransferFields, identity: IdentityKey) {
  const base = { from: t.from_address, to: t.to_address, mint: t.mint, amount: t.amount_raw, nonce: t.nonce };
  return verifyAttestation((leaf) => transferDigest({ ...base, leaf, scheme: t.scheme }), t.scheme, t.attestation, identity);
}
