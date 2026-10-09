import { cached } from "@/lib/server/cache";
import { curveMarketCapsUsd } from "@/lib/server/curve-usd";
import { dexStatsChecked, solPrice } from "@/lib/server/dexscreener";
import { lastKnown } from "@/lib/server/last-known";
import { curveStates, type CurveState } from "@/lib/server/solana";
import { db } from "@/lib/server/supabase";

/**
 * Platform-wide numbers for the brand graphics: launches, creators, the
 * post-quantum side (identities, signatures, vaults) and combined market cap
 * and 24h volume. Cached 5 minutes; only the brand page asks for it.
 */

async function count(table: string, filter: (q: any) => any = (q) => q) {
  const { count, error } = await filter(db.from(table).select("*", { count: "exact", head: true }));
  if (error) throw new Error(`${table}: ${error.message}`);
  return count ?? 0;
}

async function curvesFor(mints: string[]): Promise<Record<string, CurveState>> {
  const parts = [];
  for (let i = 0; i < mints.length; i += 100) parts.push(curveStates(mints.slice(i, i + 100)).catch(() => ({})));
  return Object.assign({}, ...(await Promise.all(parts)));
}

export async function GET() {
  try {
    const stats = await cached("platform:stats:v1", 5 * 60_000, async () => {
      const since = new Date(Date.now() - 86_400_000).toISOString();
      const live = (q: any) => q.eq("status", "live");
      const [launches24h, quantum, paired, identities, hardened, signatures, vaultWithdrawals] = await Promise.all([
        count("pqc_launches", (q) => live(q).gte("launched_at", since)),
        count("pqc_launches", (q) => live(q).not("dev_vault", "is", null)),
        count("pqc_launches", (q) => live(q).not("quote_mint", "is", null)),
        count("pqc_identities"),
        count("pqc_identities", (q) => q.eq("passphrase_hardened", true)),
        count("pqc_leaves"),
        count("pqc_vault_spends"),
      ]);
      const { data: rows, error } = await db.from("pqc_launches").select("mint, creator, scheme, dev_buy_sol, launched_at").eq("status", "live");
      if (error) throw new Error(error.message);
      const mints = rows.map((r) => r.mint as string);
      const schemes = new Set(rows.map((r) => (r.scheme as string) || "wots"));

      const [{ stats }, curves, sol, knownMcap, knownVol] = await Promise.all([
        dexStatsChecked(mints),
        curvesFor(mints),
        solPrice().catch(() => null),
        lastKnown("mcap"),
        lastKnown("volume"),
      ]);
      const curveUsd = await curveMarketCapsUsd(curves, sol).catch(() => ({}) as Record<string, number>);
      let marketCap = 0;
      let volume24h = 0;
      for (const m of mints) {
        marketCap += stats[m]?.marketCap ?? curveUsd[m] ?? knownMcap[m] ?? 0;
        volume24h += stats[m]?.volume24h ?? knownVol[m] ?? 0;
      }
      const firstLaunch = rows.map((r) => r.launched_at as string).filter(Boolean).sort()[0] ?? null;
      return {
        launches: rows.length,
        launches24h,
        creators: new Set(rows.map((r) => r.creator)).size,
        quantum,
        paired,
        graduated: Object.values(curves).filter((c) => c.complete).length,
        identities,
        hardened,
        signatures,
        schemes: schemes.size,
        vaultWithdrawals,
        devBuySol: Math.round(rows.reduce((s, r) => s + Number(r.dev_buy_sol || 0), 0) * 100) / 100,
        marketCap: Math.round(marketCap),
        volume24h: Math.round(volume24h),
        firstLaunch,
        at: new Date().toISOString(),
      };
    });
    return Response.json(stats);
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "stats unavailable" }, { status: 500 });
  }
}
