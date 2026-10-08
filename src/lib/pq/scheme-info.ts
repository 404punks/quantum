/** Scheme metadata only: no crypto imports, safe for any bundle. */
export type SchemeId = "wots" | "ml-dsa-65" | "slh-dsa-128s" | "falcon-512";

export type SchemeInfo = {
  id: SchemeId;
  name: string;
  aka: string;
  family: string;
  standard: string;
  sigBytes: number;
  pkBytes: number;
};

export const SCHEMES: Record<SchemeId, SchemeInfo> = {
  wots: { id: "wots", name: "WOTS + Merkle", aka: "XMSS-style", family: "Hash-based · one-time", standard: "RFC 8391 style", sigBytes: 2404, pkBytes: 64 },
  "ml-dsa-65": { id: "ml-dsa-65", name: "ML-DSA-65", aka: "Dilithium", family: "Lattice · Module-LWE", standard: "FIPS 204", sigBytes: 3309, pkBytes: 1952 },
  "slh-dsa-128s": { id: "slh-dsa-128s", name: "SLH-DSA-128s", aka: "SPHINCS+", family: "Hash-based · stateless", standard: "FIPS 205", sigBytes: 7856, pkBytes: 32 },
  "falcon-512": { id: "falcon-512", name: "Falcon-512", aka: "FN-DSA", family: "Lattice · NTRU", standard: "FIPS 206 (draft)", sigBytes: 657, pkBytes: 897 },
};

export const SCHEME_IDS = Object.keys(SCHEMES) as SchemeId[];

export function isSchemeId(value: unknown): value is SchemeId {
  return typeof value === "string" && value in SCHEMES;
}
