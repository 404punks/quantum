/**
 * Signature schemes a launch can be attested with.
 *
 * WOTS + Merkle is the identity's root of trust. The NIST schemes are
 * many-time keys derived from the same identity seed; each is certified once
 * by a WOTS signature over a binding digest, after which it can sign any
 * number of launches without burning one-time leaves.
 */
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes, utf8ToBytes } from "@noble/hashes/utils.js";
import { digest } from "./messages";
import type { PqSignature } from "./xmss";

export * from "./scheme-info";
import type { SchemeId } from "./scheme-info";

type Impl = {
  lengths: { seed?: number };
  keygen: (seed?: Uint8Array) => { secretKey: Uint8Array; publicKey: Uint8Array };
  sign: (msg: Uint8Array, secretKey: Uint8Array) => Uint8Array;
  verify: (sig: Uint8Array, msg: Uint8Array, publicKey: Uint8Array) => boolean;
};

type Impls = Record<Exclude<SchemeId, "wots">, Impl>;

// The NIST implementations are large and only needed when a non-WOTS scheme is
// actually used, so they load on demand and stay out of every page's bundle.
let implsPromise: Promise<Impls> | null = null;
function impls(): Promise<Impls> {
  implsPromise ??= Promise.all([
    import("@noble/post-quantum/ml-dsa.js"),
    import("@noble/post-quantum/slh-dsa.js"),
    import("@noble/post-quantum/falcon.js"),
    import("@noble/post-quantum/hybrid.js"),
    import("@noble/curves/ed25519.js"),
    import("@noble/hashes/sha3.js"),
  ]).then(([m, s, f, h, ed, sha3]) => ({
    "ml-dsa-65": m.ml_dsa65 as unknown as Impl,
    "slh-dsa-128s": s.slh_dsa_sha2_128s as unknown as Impl,
    "falcon-512": f.falcon512 as unknown as Impl,
    "ml-dsa-87": m.ml_dsa87 as unknown as Impl,
    "slh-dsa-shake-128f": s.slh_dsa_shake_128f as unknown as Impl,
    "falcon-1024": f.falcon1024 as unknown as Impl,
    // Composite: one 32-byte seed expanded with SHAKE256 into an ed25519 key and an
    // ML-DSA-65 key; a signature is both signatures and verifies only if both do.
    "ed25519-ml-dsa-65": h.combineSigners(32, h.expandSeedXof(sha3.shake256), h.ecSigner(ed.ed25519), m.ml_dsa65) as unknown as Impl,
  }));
  return implsPromise;
}

/** Deterministic per-scheme keypair from the identity's secret seed. */
export async function deriveSchemeKeys(skSeed: Uint8Array, id: Exclude<SchemeId, "wots">) {
  const impl = (await impls())[id];
  const seed = hkdf(sha256, skSeed, utf8ToBytes("pqc.market/scheme/v1"), utf8ToBytes(id), impl.lengths.seed ?? 32);
  return impl.keygen(seed);
}

/** What the identity's WOTS leaf signs to certify a scheme public key. */
export function bindingDigest(f: { scheme: SchemeId; publicKey: string; pqAddress: string }) {
  return digest("bind", { pqAddress: f.pqAddress, scheme: f.scheme, publicKeyHash: bytesToHex(sha256(hexToBytes(f.publicKey))) });
}

export async function schemeSign(id: Exclude<SchemeId, "wots">, msg: Uint8Array, secretKey: Uint8Array) {
  return bytesToHex((await impls())[id].sign(msg, secretKey));
}

export async function schemeVerify(id: Exclude<SchemeId, "wots">, msg: Uint8Array, sigHex: string, pkHex: string) {
  try {
    return (await impls())[id].verify(hexToBytes(sigHex), msg, hexToBytes(pkHex));
  } catch {
    return false;
  }
}

/** Attestation stored with a non-WOTS launch: self-contained, verifiable from the root alone. */
export type SchemeAttestation = {
  scheme: Exclude<SchemeId, "wots">;
  signature: string; // hex
  publicKey: string; // hex
  binding: PqSignature; // WOTS signature over bindingDigest
};
