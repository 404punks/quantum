import { cached } from "@/lib/server/cache";
import { graduatedMints } from "@/lib/server/graduation";
import { rankMints, type RankSort } from "@/lib/server/ranking";
import { db } from "@/lib/server/supabase";

const COLUMNS =
  "mint, name, symbol, description, image_url, creator, pq_address, leaf_index, scheme, message_hash, dev_buy_sol, dev_vault, quote_mint, quote_symbol, quote_image, created_at, launched_at, twitter, telegram, website, pqc_identities(passphrase_hardened, anchor_tx)";

const PAGE = 48;
const SORTS = new Set<RankSort>(["mcap", "volume", "holders"]);

type Row = Record<string, unknown> & { mint: string; pqc_identities: unknown };

function shape(rows: Row[]) {
  return rows.map(({ pqc_identities, ...row }) => {
    const identity = pqc_identities as { passphrase_hardened: boolean; anchor_tx: string | null } | null;
    return { ...row, hardened: Boolean(identity?.passphrase_hardened), anchored: Boolean(identity?.anchor_tx) };
  });
}

/**
 * Live launches, paginated with `offset`.
 * - `kind=quantum|standard` splits on whether the dev buy went into a quantum vault.
 * - `status=graduated` filters across every live launch (graduation lives on-chain).
 * - `sort=mcap|volume|holders` ranks every matching launch on the server, so the
 *   first page really is the top of the list; default is newest first.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  params.sort();
  // One database read per distinct query every 10s, however many visitors ask.
  // New coins still appear instantly through the broadcast feed.
  try {
    return Response.json(await cached(`launches:list:${params.toString()}`, 10_000, () => list(params)));
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Failed to load coins" }, { status: 500 });
  }
}

const ID_PAGE = 1000;

/** Throws on database errors so a failure is never cached. */
async function list(params: URLSearchParams) {
  const q = (params.get("q") ?? "").trim().slice(0, 40);
  const creator = params.get("creator");
  const status = params.get("status");
  const sortParam = params.get("sort") as RankSort | null;
  const sort = sortParam && SORTS.has(sortParam) ? sortParam : null;
  const offset = Math.max(0, Math.min(10_000, Number(params.get("offset")) || 0));

  // Narrow the candidate set first (search, creator, graduation) as newest-first mint ids.
  // Ties on launched_at are broken by mint so the pages below never overlap or skip.
  let idQuery = db.from("pqc_launches").select("mint").eq("status", "live").order("launched_at", { ascending: false }).order("mint");
  if (q) {
    const safe = q.replace(/[%,()]/g, "");
    // Name or ticker anywhere; a contract address in full or by its first characters.
    const mintPrefix = /^[1-9A-HJ-NP-Za-km-z]{4,44}$/.test(safe) ? `,mint.like.${safe}*` : "";
    idQuery = idQuery.or(`name.ilike.%${safe}%,symbol.ilike.%${safe}%,mint.eq.${safe}${mintPrefix}`);
  }
  if (creator) idQuery = idQuery.eq("creator", creator);
  // Quantum launches delivered their dev buy into a pqc-vault.
  const kind = params.get("kind");
  if (kind === "quantum") idQuery = idQuery.not("dev_vault", "is", null);
  else if (kind === "standard") idQuery = idQuery.is("dev_vault", null);
  // Pair: "sol" (the default quote), "token" (any non-SOL pair) or a specific pair mint.
  const pair = params.get("pair");
  if (pair === "sol") idQuery = idQuery.is("quote_mint", null);
  else if (pair === "token") idQuery = idQuery.not("quote_mint", "is", null);
  else if (pair && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(pair)) idQuery = idQuery.eq("quote_mint", pair);
  // PostgREST caps a response at 1,000 rows, which silently dropped the oldest
  // launches (including $PQC) from every list once there were more than that.
  let mints: string[] = [];
  for (let from = 0; ; from += ID_PAGE) {
    const { data: ids, error: idError } = await idQuery.range(from, from + ID_PAGE - 1);
    if (idError) throw new Error(idError.message);
    mints.push(...(ids ?? []).map((r) => r.mint as string));
    if (!ids || ids.length < ID_PAGE) break;
  }

  if (status === "graduated") {
    const grad = new Set(await graduatedMints(mints).catch(() => [] as string[]));
    mints = mints.filter((m) => grad.has(m));
  }
  if (sort) mints = await rankMints(mints, sort).catch(() => mints);

  const page = mints.slice(offset, offset + PAGE);
  if (!page.length) return { launches: [], hasMore: false };

  const { data, error } = await db.from("pqc_launches").select(COLUMNS).in("mint", page);
  if (error) throw new Error(error.message);
  const byMint = new Map((data as Row[] | null ?? []).map((r) => [r.mint, r]));

  return {
    hasMore: offset + PAGE < mints.length,
    launches: shape(page.map((m) => byMint.get(m)).filter((r): r is Row => Boolean(r))),
  };
}
