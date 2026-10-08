import "server-only";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes, utf8ToBytes } from "@noble/hashes/utils.js";
import { registrationStatement } from "@/lib/pq/messages";
import { buildTree, pqAddress, sign, treeRoot, type Tree } from "@/lib/pq/xmss";
import { burnLeaf, db, type IdentityRow } from "./supabase";

/**
 * The platform's own PQ identity, used to attest imported coins.
 *
 * Seeded from PQC_PLATFORM_SEED (32 random bytes, server-only) rather than a
 * wallet signature, so it does not depend on any ed25519 key. Registered
 * under the treasury wallet like any other identity; it has 256 leaves.
 */

type Platform = { skSeed: Uint8Array; pubSeed: Uint8Array; tree: Tree; root: string; pubSeedHex: string; pqAddress: string };

const g = globalThis as unknown as { pqcPlatform?: Promise<Platform> };

function load(): Promise<Platform> {
  if (!g.pqcPlatform) {
    g.pqcPlatform = (async () => {
      const seed = hexToBytes(process.env.PQC_PLATFORM_SEED!);
      if (seed.length !== 32) throw new Error("PQC_PLATFORM_SEED must be 32 bytes hex");
      const salt = utf8ToBytes("pqc.market/platform/v1");
      const skSeed = hkdf(sha256, seed, salt, utf8ToBytes("sk"), 32);
      const pubSeed = hkdf(sha256, seed, salt, utf8ToBytes("pub"), 32);
      const tree = await buildTree(skSeed, pubSeed);
      const root = bytesToHex(treeRoot(tree));
      const pubSeedHex = bytesToHex(pubSeed);
      return { skSeed, pubSeed, tree, root, pubSeedHex, pqAddress: pqAddress({ root, pubSeed: pubSeedHex, height: tree.height }) };
    })().catch((err) => {
      g.pqcPlatform = undefined;
      throw err;
    });
  }
  return g.pqcPlatform;
}

/** Returns the platform identity row, registering it (genesis = leaf 0) on first use. */
export async function platformIdentity(): Promise<{ platform: Platform; identity: IdentityRow }> {
  const platform = await load();
  const wallet = process.env.NEXT_PUBLIC_TREASURY!;

  const { data: existing } = await db.from("pqc_identities").select("*").eq("wallet", wallet).maybeSingle<IdentityRow>();
  if (existing) {
    if (existing.root !== platform.root) throw new Error("Treasury identity root does not match PQC_PLATFORM_SEED");
    return { platform, identity: existing };
  }

  const statement = registrationStatement({
    wallet,
    pqAddress: platform.pqAddress,
    root: platform.root,
    pubSeed: platform.pubSeedHex,
    height: platform.tree.height,
  });
  const digest = sha256(utf8ToBytes(statement));
  const { data, error } = await db
    .from("pqc_identities")
    .insert({
      wallet,
      pq_address: platform.pqAddress,
      root: platform.root,
      pub_seed: platform.pubSeedHex,
      height: platform.tree.height,
      // Seeded from server entropy, not a wallet: nothing on the curve can re-derive it.
      passphrase_hardened: true,
      // No treasury ed25519 signature is available server-side; the WOTS genesis below is the binding.
      ed_signature: "platform",
      genesis: sign(digest, platform.skSeed, platform.pubSeed, platform.tree, 0),
    })
    .select("*")
    .single<IdentityRow>();
  if (error) throw new Error(error.message);
  await burnLeaf({ identity_id: data.id, leaf_index: 0, purpose: "genesis", message_hash: bytesToHex(digest) });
  return { platform, identity: data };
}

export function platformSign(platform: Platform, digest: Uint8Array, leaf: number) {
  return sign(digest, platform.skSeed, platform.pubSeed, platform.tree, leaf);
}
