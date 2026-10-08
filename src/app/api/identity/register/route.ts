import { ed25519 } from "@noble/curves/ed25519.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";
import { PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import { registrationStatement } from "@/lib/pq/messages";
import { TREE_HEIGHT, pqAddress, verify } from "@/lib/pq/xmss";
import { burnLeaf, db } from "@/lib/server/supabase";
import { bad, isHex32, isPubkey, parseSignature } from "@/lib/server/validate";

/**
 * Registers a PQ identity. Two independent signatures over the same statement:
 *  - the wallet's ed25519 signature (proves the wallet consents today), and
 *  - a WOTS signature from leaf 0 (proves possession of the hash-based keys).
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body) return bad("Invalid body");
  const { wallet, root, pubSeed, height, hardened, edSignature } = body;
  const genesis = parseSignature(body.genesis);

  if (!isPubkey(wallet)) return bad("Invalid wallet");
  if (!isHex32(root) || !isHex32(pubSeed)) return bad("Invalid public key");
  if (height !== TREE_HEIGHT) return bad(`Tree height must be ${TREE_HEIGHT}`);
  if (!genesis || genesis.leaf !== 0) return bad("Genesis signature must use leaf 0");
  if (typeof edSignature !== "string") return bad("Missing wallet signature");

  const pk = { root, pubSeed, height };
  const address = pqAddress(pk);
  const statement = registrationStatement({ wallet, pqAddress: address, root, pubSeed, height });

  let edOk = false;
  try {
    edOk = ed25519.verify(bs58.decode(edSignature), utf8ToBytes(statement), new PublicKey(wallet).toBytes());
  } catch {
    edOk = false;
  }
  if (!edOk) return bad("Wallet signature does not verify");

  const digest = sha256(utf8ToBytes(statement));
  const trace = verify(digest, genesis, pk);
  if (!trace.valid) return bad("Genesis WOTS signature does not verify against root");

  // TODO(rotation): allow a registered identity to rotate to a new root, signed
  // by the old tree's next leaf. For now one identity per wallet.
  const { data: existing } = await db.from("pqc_identities").select("id").eq("wallet", wallet).maybeSingle();
  if (existing) return bad("This wallet already has a registered identity", 409);

  const { data, error } = await db
    .from("pqc_identities")
    .insert({
      wallet,
      pq_address: address,
      root,
      pub_seed: pubSeed,
      height,
      passphrase_hardened: Boolean(hardened),
      ed_signature: edSignature,
      genesis,
    })
    .select("*")
    .single();
  if (error) return bad(error.message, 500);

  await burnLeaf({
    identity_id: data.id,
    leaf_index: 0,
    purpose: "genesis",
    message_hash: bytesToHex(digest),
  });

  return Response.json({ identity: data, nextLeaf: 1, used: 1 });
}
