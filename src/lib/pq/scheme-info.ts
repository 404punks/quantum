/** Scheme metadata only: no crypto imports, safe for any bundle. */
export type SchemeId =
  | "wots"
  | "ml-dsa-65"
  | "slh-dsa-128s"
  | "falcon-512"
  | "ml-dsa-87"
  | "slh-dsa-shake-128f"
  | "falcon-1024"
  | "ed25519-ml-dsa-65";

export type SchemeInfo = {
  id: SchemeId;
  name: string;
  aka: string;
  family: string;
  standard: string;
  sigBytes: number; // nominal; Falcon signatures vary by a few bytes
  pkBytes: number;
};

export const SCHEMES: Record<SchemeId, SchemeInfo> = {
  wots: { id: "wots", name: "WOTS + Merkle", aka: "XMSS-style", family: "Hash-based · one-time", standard: "RFC 8391 style", sigBytes: 2404, pkBytes: 64 },
  "ml-dsa-65": { id: "ml-dsa-65", name: "ML-DSA-65", aka: "Dilithium", family: "Lattice · Module-LWE", standard: "FIPS 204", sigBytes: 3309, pkBytes: 1952 },
  "slh-dsa-128s": { id: "slh-dsa-128s", name: "SLH-DSA-128s", aka: "SPHINCS+", family: "Hash-based · stateless", standard: "FIPS 205", sigBytes: 7856, pkBytes: 32 },
  "falcon-512": { id: "falcon-512", name: "Falcon-512", aka: "FN-DSA", family: "Lattice · NTRU", standard: "FIPS 206 (draft)", sigBytes: 657, pkBytes: 897 },
  "ml-dsa-87": { id: "ml-dsa-87", name: "ML-DSA-87", aka: "Dilithium5", family: "Lattice · level 5", standard: "FIPS 204", sigBytes: 4627, pkBytes: 2592 },
  "slh-dsa-shake-128f": { id: "slh-dsa-shake-128f", name: "SLH-DSA-SHAKE-128f", aka: "SPHINCS+", family: "Hash-based · SHA-3", standard: "FIPS 205", sigBytes: 17088, pkBytes: 32 },
  "falcon-1024": { id: "falcon-1024", name: "Falcon-1024", aka: "FN-DSA", family: "Lattice · level 5", standard: "FIPS 206 (draft)", sigBytes: 1273, pkBytes: 1793 },
  "ed25519-ml-dsa-65": { id: "ed25519-ml-dsa-65", name: "ed25519 + ML-DSA-65", aka: "Hybrid", family: "Curve + lattice · both must verify", standard: "IETF composite draft", sigBytes: 3373, pkBytes: 1984 },
};

export const SCHEME_IDS = Object.keys(SCHEMES) as SchemeId[];

/** The original four, and the four added later; used by the brand kit. */
export const SCHEME_IDS_V1: SchemeId[] = ["wots", "ml-dsa-65", "slh-dsa-128s", "falcon-512"];
export const SCHEME_IDS_V2: SchemeId[] = ["ml-dsa-87", "slh-dsa-shake-128f", "falcon-1024", "ed25519-ml-dsa-65"];

export function isSchemeId(value: unknown): value is SchemeId {
  return typeof value === "string" && value in SCHEMES;
}
