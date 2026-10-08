import { ed25519 } from "@noble/curves/ed25519.js";
import { utf8ToBytes } from "@noble/hashes/utils.js";
import { PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import { walletStatement } from "@/lib/pq/messages";
import { db, type IdentityRow } from "@/lib/server/supabase";
import { bad, isPubkey } from "@/lib/server/validate";

/**
 * Registers a derived wallet's public address. The server never sees the key;
 * the derived key signs a statement so nobody can attach addresses they don't hold.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body || !isPubkey(body.wallet) || !isPubkey(body.address)) return bad("Invalid wallet");
  const index = Number(body.index);
  if (!Number.isInteger(index) || index < 0 || index > 1_000_000) return bad("Invalid index");
  const label = typeof body.label === "string" ? body.label.trim().slice(0, 40) : "";

  const { data: identity } = await db.from("pqc_identities").select("*").eq("wallet", body.wallet).maybeSingle<IdentityRow>();
  if (!identity) return bad("Register a post-quantum identity first", 403);

  let ok = false;
  try {
    ok = ed25519.verify(
      bs58.decode(String(body.proof)),
      utf8ToBytes(walletStatement({ pqAddress: identity.pq_address, index, address: body.address })),
      new PublicKey(body.address).toBytes(),
    );
  } catch {
    ok = false;
  }
  if (!ok) return bad("Wallet proof does not verify");

  const { data, error } = await db
    .from("pqc_wallets")
    .insert({ identity_id: identity.id, index, address: body.address, label: label || null, proof: String(body.proof) })
    .select("id, index, address, label, status, created_at, retired_at")
    .single();
  if (error?.code === "23505") return bad("That wallet already exists", 409);
  if (error) return bad(error.message, 500);
  return Response.json({ wallet: data });
}
