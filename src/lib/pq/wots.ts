/**
 * Winternitz one-time signatures (WOTS, w = 16) over SHA-256.
 *
 * Every hash call is tweaked with a public seed and a 32-byte address that
 * pins it to one (leaf, chain, step) position, in the style of SPHINCS+ /
 * XMSS. Security rests only on SHA-256 second-preimage resistance: no curves,
 * no lattices, no algebraic structure. Each key may sign exactly ONE message.
 */
import { sha256 } from "@noble/hashes/sha2.js";
import { concatBytes } from "@noble/hashes/utils.js";

export const N = 32; // hash output, bytes
export const W = 16; // Winternitz parameter
export const LEN1 = 64; // 256 bits / log2(16)
export const LEN2 = 3; // checksum digits: max 64 * 15 = 960 < 16^3
export const LEN = LEN1 + LEN2; // 67 chains

export const AddrType = {
  Chain: 0,
  LeafPk: 1,
  TreeNode: 2,
  SecretPrf: 3,
} as const;

/** 32-byte hash address: type | a | b | c, big-endian u32s, zero padded. */
export function address(type: number, a: number, b = 0, c = 0): Uint8Array {
  const out = new Uint8Array(32);
  const view = new DataView(out.buffer);
  view.setUint32(0, type);
  view.setUint32(4, a);
  view.setUint32(8, b);
  view.setUint32(12, c);
  return out;
}

/** Tweakable hash F(pubSeed, adrs, x). */
export function thash(pubSeed: Uint8Array, adrs: Uint8Array, ...parts: Uint8Array[]) {
  return sha256(concatBytes(pubSeed, adrs, ...parts));
}

/** Secret chain start for (leaf, chain), derived from the secret seed. */
export function secretElement(skSeed: Uint8Array, leaf: number, chain: number) {
  return sha256(concatBytes(skSeed, address(AddrType.SecretPrf, leaf, chain)));
}

/** Walk a hash chain `steps` times starting at position `start`. */
export function chain(
  x: Uint8Array,
  start: number,
  steps: number,
  pubSeed: Uint8Array,
  leaf: number,
  chainIdx: number,
): Uint8Array {
  let out = x;
  for (let i = start; i < start + steps && i < W - 1; i++) {
    out = thash(pubSeed, address(AddrType.Chain, leaf, chainIdx, i), out);
  }
  return out;
}

/** Message digest → 64 base-16 digits + 3 checksum digits. */
export function digits(msg: Uint8Array): number[] {
  if (msg.length !== N) throw new Error("WOTS signs 32-byte digests only");
  const d: number[] = [];
  for (const byte of msg) d.push(byte >> 4, byte & 15);
  let checksum = 0;
  for (const v of d) checksum += W - 1 - v;
  d.push((checksum >> 8) & 15, (checksum >> 4) & 15, checksum & 15);
  return d;
}

/** Compress the 67 chain ends into one 32-byte leaf. */
export function leafFromPk(pubSeed: Uint8Array, leaf: number, pk: Uint8Array[]) {
  return thash(pubSeed, address(AddrType.LeafPk, leaf), ...pk);
}

export function publicKey(skSeed: Uint8Array, pubSeed: Uint8Array, leaf: number) {
  const pk: Uint8Array[] = [];
  for (let i = 0; i < LEN; i++) {
    pk.push(chain(secretElement(skSeed, leaf, i), 0, W - 1, pubSeed, leaf, i));
  }
  return pk;
}

export function leafHash(skSeed: Uint8Array, pubSeed: Uint8Array, leaf: number) {
  return leafFromPk(pubSeed, leaf, publicKey(skSeed, pubSeed, leaf));
}

export function sign(
  msg: Uint8Array,
  skSeed: Uint8Array,
  pubSeed: Uint8Array,
  leaf: number,
): Uint8Array[] {
  return digits(msg).map((d, i) =>
    chain(secretElement(skSeed, leaf, i), 0, d, pubSeed, leaf, i),
  );
}

/** Finish every chain from the signature; yields the signer's public key. */
export function publicKeyFromSignature(
  msg: Uint8Array,
  sig: Uint8Array[],
  pubSeed: Uint8Array,
  leaf: number,
): Uint8Array[] {
  if (sig.length !== LEN) throw new Error(`WOTS signature must have ${LEN} chains`);
  return digits(msg).map((d, i) => chain(sig[i], d, W - 1 - d, pubSeed, leaf, i));
}
