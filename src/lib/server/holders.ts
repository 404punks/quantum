import "server-only";
import { bondingCurvePda } from "@pump-fun/pump-sdk";
import { cached } from "./cache";

/**
 * Holder counts from Helius DAS (getTokenAccounts): token accounts with a
 * non-zero balance, excluding the bonding curve's own account (that's pump.fun
 * holding the unsold supply, not a holder). Holder counts move slowly, so each
 * is cached for 5 minutes.
 */

const PAGE = 1000;
const MAX_PAGES = 10; // counts above 10k are reported as 10k
const CONCURRENCY = 6;

/** Runs `fn` over items with at most `limit` in flight. */
export async function pool<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

type TokenAccount = { owner: string; amount: number | string };

/** Throws on any RPC failure so a failed count is never cached. */
async function countHolders(mint: string): Promise<number> {
  const curve = bondingCurvePda(mint).toBase58();
  let count = 0;
  for (let page = 1; page <= MAX_PAGES; page++) {
    const res = await fetch(process.env.HELIUS_RPC_URL!, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: "holders", method: "getTokenAccounts", params: { mint, limit: PAGE, page } }),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`helius ${res.status}`);
    const json = (await res.json()) as { result?: { token_accounts?: TokenAccount[] }; error?: unknown };
    const accounts = json.result?.token_accounts;
    if (!accounts) throw new Error("helius: no token_accounts");
    for (const a of accounts) if (Number(a.amount) > 0 && a.owner !== curve) count++;
    if (accounts.length < PAGE) break;
  }
  return count;
}

export function holderCount(mint: string) {
  return cached(`holders:${mint}`, 5 * 60_000, () => countHolders(mint));
}

export async function holderCounts(mints: string[]): Promise<Record<string, number>> {
  const counts = await pool(mints, CONCURRENCY, (m) => holderCount(m).catch(() => null));
  const out: Record<string, number> = {};
  mints.forEach((m, i) => {
    const c = counts[i];
    if (typeof c === "number") out[m] = c;
  });
  return out;
}
