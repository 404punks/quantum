import { graduatedMints } from "@/lib/server/graduation";
import { db } from "@/lib/server/supabase";

const COLUMNS =
  "mint, name, symbol, description, image_url, creator, pq_address, leaf_index, scheme, message_hash, dev_buy_sol, created_at, launched_at, twitter, telegram, website, pqc_identities(passphrase_hardened, anchor_tx)";

const PAGE = 48;

/**
 * Live launches, newest first, paginated with `offset`.
 * `status=graduated` filters across every live launch on the server (graduation
 * lives on-chain, not in our table), so older graduated coins are never missed.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const q = (params.get("q") ?? "").trim().slice(0, 40);
  const creator = params.get("creator");
  const status = params.get("status");
  const offset = Math.max(0, Math.min(10_000, Number(params.get("offset")) || 0));

  let mintFilter: string[] | null = null;
  if (status === "graduated") {
    const { data: all, error } = await db.from("pqc_launches").select("mint").eq("status", "live");
    if (error) return Response.json({ error: error.message }, { status: 500 });
    mintFilter = await graduatedMints((all ?? []).map((r) => r.mint)).catch(() => []);
    if (!mintFilter.length) return Response.json({ launches: [], hasMore: false });
  }

  let query = db
    .from("pqc_launches")
    .select(COLUMNS)
    .eq("status", "live")
    .order("launched_at", { ascending: false })
    .range(offset, offset + PAGE); // one extra row tells us whether another page exists
  if (mintFilter) query = query.in("mint", mintFilter);
  if (q) {
    const safe = q.replace(/[%,()]/g, "");
    query = query.or(`name.ilike.%${safe}%,symbol.ilike.%${safe}%,mint.eq.${safe}`);
  }
  if (creator) query = query.eq("creator", creator);

  const { data, error } = await query;
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const rows = data ?? [];
  return Response.json({
    hasMore: rows.length > PAGE,
    launches: rows.slice(0, PAGE).map(({ pqc_identities, ...row }) => {
      const identity = pqc_identities as unknown as { passphrase_hardened: boolean; anchor_tx: string | null } | null;
      return { ...row, hardened: Boolean(identity?.passphrase_hardened), anchored: Boolean(identity?.anchor_tx) };
    }),
  });
}
