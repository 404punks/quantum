/**
 * Wallet signature → PQ seed.
 *
 * ed25519 signatures are deterministic (RFC 8032), so signing the same
 * derivation message always yields the same 64 bytes. We feed that, plus an
 * optional scrypt-hardened passphrase, into HKDF to get the secret and public
 * seeds. Nothing secret ever leaves the browser.
 *
 * Why the passphrase matters: if ed25519 itself falls, an attacker who
 * recovers the wallet key can re-sign the derivation message and rebuild the
 * tree. The passphrase is entropy the curve never sees, so a hardened identity
 * survives a curve break.
 */
import { hkdf } from "@noble/hashes/hkdf.js";
import { scryptAsync } from "@noble/hashes/scrypt.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { concatBytes, utf8ToBytes } from "@noble/hashes/utils.js";
import { Keypair } from "@solana/web3.js";

export type Seeds = { skSeed: Uint8Array; pubSeed: Uint8Array; hardened: boolean };

export async function hardenPassphrase(
  passphrase: string,
  wallet: string,
  onProgress?: (p: number) => void,
) {
  return scryptAsync(utf8ToBytes(passphrase.normalize("NFKC")), sha256(utf8ToBytes(`pqc.market/salt/${wallet}`)), {
    N: 2 ** 15,
    r: 8,
    p: 1,
    dkLen: 32,
    onProgress,
  });
}

export function deriveSeeds(walletSignature: Uint8Array, wallet: string, hardening?: Uint8Array): Seeds {
  const ikm = hardening ? concatBytes(walletSignature, hardening) : walletSignature;
  const salt = utf8ToBytes("pqc.market/identity/v1");
  return {
    skSeed: hkdf(sha256, ikm, salt, utf8ToBytes(`sk:${wallet}`), 32),
    pubSeed: hkdf(sha256, ikm, salt, utf8ToBytes(`pub:${wallet}`), 32),
    hardened: Boolean(hardening),
  };
}

/** Each launch leaf deterministically owns a mint keypair: recoverable from the identity alone. */
export function deriveMintKeypair(skSeed: Uint8Array, leaf: number) {
  const info = new Uint8Array(4);
  new DataView(info.buffer).setUint32(0, leaf);
  return Keypair.fromSeed(hkdf(sha256, skSeed, utf8ToBytes("pqc.market/mint/v1"), info, 32));
}

/**
 * Each wallet index owns an ed25519 keypair derived from the identity seed.
 * Never stored anywhere; re-derived in the browser after unlock, like mint keys.
 */
export function deriveVaultKeypair(skSeed: Uint8Array, index: number) {
  const info = new Uint8Array(4);
  new DataView(info.buffer).setUint32(0, index);
  return Keypair.fromSeed(hkdf(sha256, skSeed, utf8ToBytes("pqc.market/wallet/v1"), info, 32));
}
