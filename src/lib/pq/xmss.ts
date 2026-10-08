/**
 * XMSS-style many-time scheme: a Merkle tree over 2^H WOTS leaves.
 *
 * Public key = (pubSeed, root). A signature is (leaf index, WOTS signature,
 * authentication path). The verifier finishes the WOTS chains, compresses
 * them to a leaf, and climbs H levels to recompute the root.
 *
 * TODO(vault): port `verify` to an on-chain Solana program (a Winternitz vault
 * whose PDA is seeded by the PQ address) so value, not just provenance, can be
 * held under hash-based keys. ~1k SHA-256 syscalls per verify fits in budget.
 */
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, concatBytes, hexToBytes, utf8ToBytes } from "@noble/hashes/utils.js";
import bs58 from "bs58";
import * as wots from "./wots";

export const TREE_HEIGHT = 8; // 256 one-time keys per identity
export const LEAVES = 1 << TREE_HEIGHT;

export type PqPublicKey = { root: string; pubSeed: string; height: number };

export type PqSignature = {
  leaf: number;
  wots: string; // 67 * 32 bytes, hex
  auth: string[]; // H sibling nodes, hex, leaf level first
};

export type Tree = {
  height: number;
  levels: Uint8Array[][]; // levels[0] = leaves, levels[H] = [root]
};

export function nodeHash(
  pubSeed: Uint8Array,
  height: number,
  index: number,
  left: Uint8Array,
  right: Uint8Array,
) {
  return wots.thash(pubSeed, wots.address(wots.AddrType.TreeNode, height, index), left, right);
}

/** Build the full tree, yielding to the event loop so the UI can paint progress. */
export async function buildTree(
  skSeed: Uint8Array,
  pubSeed: Uint8Array,
  height = TREE_HEIGHT,
  onProgress?: (done: number, total: number) => void,
): Promise<Tree> {
  const total = 1 << height;
  const leaves: Uint8Array[] = [];
  for (let i = 0; i < total; i++) {
    leaves.push(wots.leafHash(skSeed, pubSeed, i));
    if (i % 8 === 7) {
      onProgress?.(i + 1, total);
      await new Promise((r) => setTimeout(r, 0));
    }
  }
  const levels: Uint8Array[][] = [leaves];
  for (let h = 0; h < height; h++) {
    const below = levels[h];
    const next: Uint8Array[] = [];
    for (let j = 0; j < below.length; j += 2) {
      next.push(nodeHash(pubSeed, h + 1, j >> 1, below[j], below[j + 1]));
    }
    levels.push(next);
  }
  return { height, levels };
}

export function treeRoot(tree: Tree) {
  return tree.levels[tree.height][0];
}

export function authPath(tree: Tree, leaf: number): Uint8Array[] {
  const path: Uint8Array[] = [];
  let idx = leaf;
  for (let h = 0; h < tree.height; h++) {
    path.push(tree.levels[h][idx ^ 1]);
    idx >>= 1;
  }
  return path;
}

export function sign(
  msg: Uint8Array,
  skSeed: Uint8Array,
  pubSeed: Uint8Array,
  tree: Tree,
  leaf: number,
): PqSignature {
  if (leaf < 0 || leaf >= 1 << tree.height) throw new Error("Leaf out of range");
  return {
    leaf,
    wots: bytesToHex(concatBytes(...wots.sign(msg, skSeed, pubSeed, leaf))),
    auth: authPath(tree, leaf).map(bytesToHex),
  };
}

export type VerifyTrace = {
  valid: boolean;
  digits: number[];
  leafHash: string;
  path: { height: number; index: number; node: string; sibling: string; side: "L" | "R" }[];
  computedRoot: string;
  expectedRoot: string;
  error?: string;
};

/** Verify and return every intermediate value, so the UI can show the work. */
export function verify(msg: Uint8Array, sig: PqSignature, pk: PqPublicKey): VerifyTrace {
  const base: VerifyTrace = {
    valid: false,
    digits: [],
    leafHash: "",
    path: [],
    computedRoot: "",
    expectedRoot: pk.root,
  };
  try {
    const pubSeed = hexToBytes(pk.pubSeed);
    const raw = hexToBytes(sig.wots);
    if (raw.length !== wots.LEN * wots.N) throw new Error("Bad WOTS length");
    if (sig.auth.length !== pk.height) throw new Error("Bad auth path length");
    if (!Number.isInteger(sig.leaf) || sig.leaf < 0 || sig.leaf >= 1 << pk.height) {
      throw new Error("Bad leaf index");
    }
    const chains: Uint8Array[] = [];
    for (let i = 0; i < wots.LEN; i++) chains.push(raw.slice(i * wots.N, (i + 1) * wots.N));

    const leafNode = wots.leafFromPk(
      pubSeed,
      sig.leaf,
      wots.publicKeyFromSignature(msg, chains, pubSeed, sig.leaf),
    );
    let node = leafNode;
    let idx = sig.leaf;
    const path: VerifyTrace["path"] = [];
    for (let h = 0; h < pk.height; h++) {
      const sibling = hexToBytes(sig.auth[h]);
      const isLeft = (idx & 1) === 0;
      const parent = isLeft
        ? nodeHash(pubSeed, h + 1, idx >> 1, node, sibling)
        : nodeHash(pubSeed, h + 1, idx >> 1, sibling, node);
      path.push({
        height: h + 1,
        index: idx >> 1,
        node: bytesToHex(parent),
        sibling: sig.auth[h],
        side: isLeft ? "L" : "R",
      });
      node = parent;
      idx >>= 1;
    }
    const computedRoot = bytesToHex(node);
    return {
      ...base,
      valid: computedRoot === pk.root.toLowerCase(),
      digits: wots.digits(msg),
      leafHash: bytesToHex(leafNode),
      path,
      computedRoot,
    };
  } catch (err) {
    return { ...base, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * The "bunker address": a hash of the PQ public key. Like a never-spent
 * Bitcoin address, it reveals nothing about the keys behind it.
 */
export function pqAddress(pk: PqPublicKey) {
  const digest = sha256(
    concatBytes(utf8ToBytes("pqc.market/address/v1"), hexToBytes(pk.pubSeed), hexToBytes(pk.root)),
  );
  return "pq1" + bs58.encode(digest.slice(0, 20));
}

export function signatureBytes(sig: PqSignature) {
  return wots.LEN * wots.N + sig.auth.length * wots.N + 4;
}
