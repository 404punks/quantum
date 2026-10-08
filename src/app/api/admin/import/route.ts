import { bytesToHex } from "@noble/hashes/utils.js";
import { launchDigest } from "@/lib/pq/messages";
import { verify } from "@/lib/pq/xmss";
import { isAdmin, unauthorized } from "@/lib/server/admin";
import { ImportError, resolveImport } from "@/lib/server/import";
import { pinMetadata, pinnedLogo } from "@/lib/server/pinata";
import { platformIdentity, platformSign } from "@/lib/server/platform";
import { burnLeaf, db, nextFreeLeaf } from "@/lib/server/supabase";
import { bad, isPubkey, publicKeyOf } from "@/lib/server/validate";

/**
 * Lists an externally launched coin exactly like a native launch: the platform
 * identity signs the same launch digest with a fresh leaf, the attestation is
 * pinned to IPFS, and the row goes straight to `live` (which also fires the
 * realtime feed). Only pqc_imports, which is service-role only, records the origin.
 */
export async function POST(request: Request) {
  if (!(await isAdmin())) return unauthorized();
  const body = await request.json().catch(() => null);
  const mint = body?.mint;
  if (!isPubkey(mint)) return bad("Invalid contract address");

  try {
    const [coin, image, { platform, identity }] = await Promise.all([resolveImport(mint), pinnedLogo(), platformIdentity()]);

    // Claim a leaf; retry if a concurrent import grabbed the same index.
    let leaf = -1;
    let attestation = null;
    let digest: Uint8Array | null = null;
    for (let attempt = 0; attempt < 3 && leaf < 0; attempt++) {
      const candidate = await nextFreeLeaf(identity.id);
      if (candidate >= 1 << identity.height) return bad("Platform identity has no unused keys left", 507);
      const d = launchDigest({ mint, creator: coin.creator, name: coin.name, symbol: coin.symbol, image, leaf: candidate });
      const sig = platformSign(platform, d, candidate);
      if (!verify(d, sig, publicKeyOf(identity)).valid) return bad("Self-check of platform signature failed", 500);
      const burned = await burnLeaf({
        identity_id: identity.id,
        leaf_index: candidate,
        purpose: "launch",
        message_hash: bytesToHex(d),
        ref: mint,
      });
      if (burned) {
        leaf = candidate;
        attestation = sig;
        digest = d;
      }
    }
    if (leaf < 0 || !attestation || !digest) return bad("Could not reserve a one-time key, retry", 409);

    const messageHash = bytesToHex(digest);
    const website = `https://pqc.market/coin/${mint}`;
    const uri = await pinMetadata(
      {
        name: coin.name,
        symbol: coin.symbol,
        ...(coin.description && { description: coin.description }),
        image,
        showName: true,
        createdOn: "https://pqc.market",
        ...(coin.twitter && { twitter: coin.twitter }),
        website,
        pqc: {
          version: 1,
          scheme: "WOTS(w=16,SHA-256)+Merkle(h=8)",
          pqAddress: identity.pq_address,
          root: identity.root,
          pubSeed: identity.pub_seed,
          height: identity.height,
          messageHash,
          signature: attestation,
          verify: website,
        },
      },
      coin.symbol,
    );

    const { error } = await db.from("pqc_launches").insert({
      mint,
      name: coin.name,
      symbol: coin.symbol,
      description: coin.description,
      image_url: image,
      metadata_uri: uri,
      twitter: coin.twitter,
      website,
      creator: coin.creator,
      identity_id: identity.id,
      pq_address: identity.pq_address,
      leaf_index: leaf,
      message_hash: messageHash,
      attestation,
      dev_buy_sol: 0,
      status: "live",
      tx_signature: coin.txHash,
      created_at: coin.launchedAt,
      launched_at: coin.launchedAt,
    });
    if (error) return bad(error.message, 500);
    await db.from("pqc_imports").insert({ mint });

    return Response.json({ mint, leaf });
  } catch (err) {
    if (err instanceof ImportError) return bad(err.message, err.status);
    return bad(err instanceof Error ? err.message : "Import failed", 502);
  }
}
