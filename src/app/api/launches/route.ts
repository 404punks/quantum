import { db } from "@/lib/server/supabase";

const COLUMNS =
  "mint, name, symbol, description, image_url, creator, pq_address, leaf_index, scheme, message_hash, dev_buy_sol, created_at, launched_at, twitter, telegram, website, pqc_identities(passphrase_hardened, anchor_tx)";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const q = (params.get("q") ?? "").trim().slice(0, 40);
  const creator = params.get("creator");

  let query = db.from("pqc_launches").select(COLUMNS).eq("status", "live").order("launched_at", { ascending: false }).limit(48);
  if (q) {
    const safe = q.replace(/[%,()]/g, "");
    query = query.or(`name.ilike.%${safe}%,symbol.ilike.%${safe}%,mint.eq.${safe}`);
  }
  if (creator) query = query.eq("creator", creator);

  const { data, error } = await query;
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({
    launches: (data ?? []).map(({ pqc_identities, ...row }) => {
      const identity = pqc_identities as unknown as { passphrase_hardened: boolean; anchor_tx: string | null } | null;
      return { ...row, hardened: Boolean(identity?.passphrase_hardened), anchored: Boolean(identity?.anchor_tx) };
    }),
  });
}
