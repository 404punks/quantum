/**
 * Canonical messages. Shared verbatim by client and server: any drift between
 * the two breaks every signature, so build them only through these helpers.
 */
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";

export const DOMAIN = "pqc.market";
export const VERSION = 1;

/** Signed by the wallet to derive the PQ seed. Must never change for v1. */
export function derivationMessage(wallet: string) {
  return [
    `${DOMAIN} — Post-Quantum Identity Derivation v${VERSION}`,
    "",
    "Signing this message derives your hash-based (WOTS/XMSS) keys locally in your browser.",
    "It is not a transaction and costs nothing.",
    "Never sign this exact message on any other site.",
    "",
    `Wallet: ${wallet}`,
    `Domain: ${DOMAIN}`,
    `Version: ${VERSION}`,
  ].join("\n");
}

/** Binds the wallet to the PQ public key. Signed by BOTH key types. */
export function registrationStatement(p: {
  wallet: string;
  pqAddress: string;
  root: string;
  pubSeed: string;
  height: number;
}) {
  return [
    `${DOMAIN} — Register Post-Quantum Identity`,
    "",
    `Wallet: ${p.wallet}`,
    `PQ address: ${p.pqAddress}`,
    `Root: ${p.root}`,
    `Public seed: ${p.pubSeed}`,
    `Tree height: ${p.height}`,
    `Scheme: WOTS(w=16,SHA-256)+Merkle`,
  ].join("\n");
}

/** Domain-separated digest over sorted key/value fields. */
export function digest(domain: string, fields: Record<string, string | number>) {
  const body = Object.keys(fields)
    .sort()
    .map((k) => `${k}=${fields[k]}`)
    .join("\n");
  return sha256(utf8ToBytes(`${DOMAIN}/${domain}/v${VERSION}\n${body}`));
}

/**
 * WOTS launches commit to their one-time leaf; other schemes commit to the
 * scheme id instead, so a signature can never be replayed across schemes.
 */
export function launchDigest(f: {
  mint: string;
  creator: string;
  name: string;
  symbol: string;
  image: string;
  leaf?: number | null;
  scheme?: string | null;
}) {
  const { mint, creator, name, symbol, image } = f;
  const base = { mint, creator, name, symbol, image };
  return f.scheme && f.scheme !== "wots" ? digest("launch", { ...base, scheme: f.scheme }) : digest("launch", { ...base, leaf: f.leaf ?? 0 });
}

export function proofDigest(f: { nonce: string; wallet: string; leaf: number }) {
  return digest("proof", f);
}

export function anchorMemo(pqAddress: string, root: string) {
  return `${DOMAIN}:v${VERSION}:anchor:${pqAddress}:${root}`;
}

export const hex = bytesToHex;
