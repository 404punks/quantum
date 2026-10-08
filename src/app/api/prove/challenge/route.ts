import { bytesToHex, randomBytes } from "@noble/hashes/utils.js";
import { db, nextFreeLeaf, type IdentityRow } from "@/lib/server/supabase";
import { bad, isPubkey } from "@/lib/server/validate";

const TTL_MS = 5 * 60_000;

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body || !isPubkey(body.wallet)) return bad("Invalid wallet");

  const { data: identity } = await db
    .from("pqc_identities")
    .select("*")
    .eq("wallet", body.wallet)
    .maybeSingle<IdentityRow>();
  if (!identity) return bad("Register a post-quantum identity first", 404);

  const nonce = bytesToHex(randomBytes(32));
  const expiresAt = new Date(Date.now() + TTL_MS).toISOString();
  const { data, error } = await db
    .from("pqc_challenges")
    .insert({ wallet: body.wallet, nonce, expires_at: expiresAt })
    .select("id")
    .single();
  if (error) return bad(error.message, 500);

  return Response.json({ id: data.id, nonce, expiresAt, nextLeaf: await nextFreeLeaf(identity.id) });
}
