import { bytesToHex } from "@noble/hashes/utils.js";
import { launchDigest } from "./messages";
import { bindingDigest, isSchemeId, schemeVerify, type SchemeAttestation } from "./schemes";
import { verify, type PqSignature, type VerifyTrace } from "./xmss";

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
 * Rebuilds the launch digest from public fields and checks the attestation
 * against the creator's registered root. Never trusts a stored hash.
 */
export async function verifyLaunch(launch: LaunchFields, identity: IdentityKey): Promise<LaunchVerification> {
  const pk = { root: identity.root, pubSeed: identity.pub_seed, height: identity.height };
  const base = { mint: launch.mint, creator: launch.creator, name: launch.name, symbol: launch.symbol, image: launch.image_url };

  if (!launch.scheme || launch.scheme === "wots" || !isSchemeId(launch.scheme)) {
    const sig = launch.attestation as PqSignature;
    const d = launchDigest({ ...base, leaf: launch.leaf_index ?? sig.leaf });
    const trace = verify(d, sig, pk);
    return { kind: "wots", valid: trace.valid, digest: bytesToHex(d), leaf: sig.leaf, trace };
  }

  const att = launch.attestation as SchemeAttestation;
  const scheme = launch.scheme as SchemeAttestation["scheme"];
  const cd = bindingDigest({ scheme, publicKey: att.publicKey, pqAddress: identity.pq_address });
  const certificate = verify(cd, att.binding, pk);
  const d = launchDigest({ ...base, scheme });
  const signatureValid = await schemeVerify(scheme, d, att.signature, att.publicKey);
  return {
    kind: "scheme",
    valid: certificate.valid && signatureValid,
    digest: bytesToHex(d),
    scheme,
    signatureValid,
    signatureBytes: att.signature.length / 2,
    publicKeyBytes: att.publicKey.length / 2,
    leaf: att.binding.leaf,
    certificate,
    certificateDigest: bytesToHex(cd),
  };
}
