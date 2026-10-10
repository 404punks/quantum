import { cached } from "@/lib/server/cache";
import { allLiveLaunches } from "@/lib/server/supabase";

type PairUse = { mint: string; symbol: string; image: string | null; count: number };

/** Every pair token live coins actually use, most used first, plus how many coins trade against SOL. */
export async function GET() {
  try {
    const result = await cached("launches:pairs:v2", 60_000, async () => {
      const data = await allLiveLaunches<{ quote_mint: string | null; quote_symbol: string | null; quote_image: string | null }>("quote_mint, quote_symbol, quote_image");
      const byMint = new Map<string, PairUse>();
      let sol = 0;
      for (const row of data ?? []) {
        if (!row.quote_mint) {
          sol++;
          continue;
        }
        const cur = byMint.get(row.quote_mint);
        if (cur) cur.count++;
        else byMint.set(row.quote_mint, { mint: row.quote_mint, symbol: row.quote_symbol ?? "?", image: row.quote_image ?? null, count: 1 });
      }
      const pairs = [...byMint.values()].sort((a, b) => b.count - a.count || a.symbol.localeCompare(b.symbol));
      return { sol, token: pairs.reduce((n, p) => n + p.count, 0), pairs };
    });
    return Response.json(result);
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Failed to load pairs" }, { status: 500 });
  }
}
