import { db, type IdentityRow } from "@/lib/server/supabase";
import { bad, isPubkey } from "@/lib/server/validate";

/** A user's derived wallets and their recent dual-signed transfers. */
export async function GET(request: Request) {
  const wallet = new URL(request.url).searchParams.get("wallet");
  if (!isPubkey(wallet)) return bad("Invalid wallet");

  const { data: identity } = await db.from("pqc_identities").select("*").eq("wallet", wallet).maybeSingle<IdentityRow>();
  if (!identity) return Response.json({ wallets: [], transfers: [] });

  const [{ data: wallets }, { data: transfers }] = await Promise.all([
    db.from("pqc_wallets").select("id, index, address, label, status, created_at, retired_at").eq("identity_id", identity.id).order("index"),
    db
      .from("pqc_transfers")
      .select("id, wallet_id, from_address, to_address, mint, amount_raw, scheme, attestation, message_hash, nonce, memo, tx_signature, status, created_at, confirmed_at")
      .in("wallet_id", (await db.from("pqc_wallets").select("id").eq("identity_id", identity.id)).data?.map((w) => w.id) ?? [])
      .order("created_at", { ascending: false })
      .limit(50),
  ]);
  return Response.json({ wallets: wallets ?? [], transfers: transfers ?? [] });
}
