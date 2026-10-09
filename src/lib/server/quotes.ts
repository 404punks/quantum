import "server-only";
import { NATIVE_MINT } from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import { cached } from "./cache";
import { dexStats } from "./dexscreener";
import { proxiedImage } from "./img";
import { onlinePump } from "./solana";

/**
 * Every token pump.fun accepts as a curve quote (SOL, the Global whitelist and
 * the QuoteControl list: USDC, tokenized stocks, majors, memecoins), with the
 * metadata the launch form shows. Refreshed every 10 minutes.
 */

/** "pump": a pump.fun coin that isn't on the list but prices within range (see checkPair). */
export type QuoteCategory = "sol" | "stock" | "crypto" | "pump";

export type QuoteToken = {
  mint: string;
  symbol: string;
  name: string;
  image: string | null;
  decimals: number;
  tokenProgram: string;
  category: QuoteCategory;
  priceUsd: number | null;
};

const SOL = NATIVE_MINT.toBase58();

/** Shown first within their group, in this order. */
const FEATURED = ["USDC", "NVDAx", "TSLAx", "SPYx", "QQQx", "AAPLx", "SPCX", "MSTRx", "COINx", "GOOGLx", "METAx", "AMZNx", "MSFTx", "GLDx", "WBTC", "WETH"];

type Asset = {
  id: string;
  content?: { metadata?: { name?: string; symbol?: string }; links?: { image?: string } };
  token_info?: { decimals?: number; token_program?: string };
};

async function assetBatch(ids: string[]): Promise<Asset[]> {
  const out: Asset[] = [];
  for (let i = 0; i < ids.length; i += 1000) {
    const res = await fetch(process.env.HELIUS_RPC_URL!, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: "quotes", method: "getAssetBatch", params: { ids: ids.slice(i, i + 1000) } }),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`helius ${res.status}`);
    const json = (await res.json()) as { result?: (Asset | null)[] };
    if (!json.result) throw new Error("helius: no assets");
    out.push(...json.result.filter((a): a is Asset => Boolean(a)));
  }
  return out;
}

function categorize(mint: string, name: string): QuoteCategory {
  if (mint === SOL) return "sol";
  return /xStock|Securities/i.test(name) ? "stock" : "crypto";
}

function rank(t: QuoteToken) {
  const featured = FEATURED.indexOf(t.symbol);
  return [t.category === "sol" ? 0 : 1, featured === -1 ? 1 : 0, featured === -1 ? 0 : featured] as const;
}

export function supportedQuotes(): Promise<QuoteToken[]> {
  return cached("quotes:supported:v3", 10 * 60_000, async () => {
    const supported = await onlinePump.fetchSupportedQuoteMints();
    const ids = supported.map((s) => s.mint.toBase58());
    const [assets, prices] = await Promise.all([assetBatch(ids), dexStats(ids.filter((id) => id !== SOL)).catch(() => ({}) as Awaited<ReturnType<typeof dexStats>>)]);
    const byId = new Map(assets.map((a) => [a.id, a]));
    const tokens: QuoteToken[] = [];
    for (const id of ids) {
      const a = byId.get(id);
      const symbol = id === SOL ? "SOL" : a?.content?.metadata?.symbol?.trim();
      const name = id === SOL ? "Solana" : a?.content?.metadata?.name?.trim();
      if (!symbol || !name || a?.token_info?.decimals == null || !a.token_info.token_program) continue;
      tokens.push({
        mint: id,
        symbol,
        name,
        // DexScreener hosts small copies; original logos can be multi-MB or on rate-limited IPFS.
        image: prices[id]?.image ?? proxiedImage(a.content?.links?.image),
        decimals: a.token_info.decimals,
        tokenProgram: a.token_info.token_program,
        category: categorize(id, name),
        priceUsd: prices[id]?.price ?? null,
      });
    }
    return tokens.sort((x, y) => {
      const [a1, a2, a3] = rank(x);
      const [b1, b2, b3] = rank(y);
      return a1 - b1 || a2 - b2 || a3 - b3 || x.symbol.localeCompare(y.symbol);
    });
  });
}

export async function quoteToken(mint: string): Promise<QuoteToken | null> {
  return (await supportedQuotes()).find((t) => t.mint === mint) ?? null;
}

/** pump.fun coins featured as pairs in the picker (checked live; dropped if ineligible). */
const FEATURED_PUMP = ["7K52aYQW9rWGjwZmQ7o2d1P6E7bji6hSMsqaLy5EcxLh"]; // $PQC

/** Turns the SDK's quote admission errors into something a creator can act on. */
function pairRefusal(message: string) {
  if (/out of range/i.test(message)) return "This coin's price is too low to pair with yet. pump.fun needs an established coin.";
  if (/Unsupported quote mint/i.test(message)) return "Not a pump.fun coin and not on pump.fun's pair list.";
  if (/depth/i.test(message)) return "This coin is itself paired with a pump.fun coin; pump.fun allows one level.";
  if (/not eligible|mayhem/i.test(message)) return "Mayhem-mode coins can't be used as a pair.";
  if (/not migrated|awaiting migration/i.test(message)) return "This coin just graduated and is still migrating. Try again shortly.";
  if (/no pump-amm pool|QuotePoolNotFound/i.test(message)) return "This coin graduated but has no PumpSwap pool to price it from.";
  return "pump.fun won't accept this coin as a pair right now.";
}

export type PairCheck = { ok: true; token: QuoteToken } | { ok: false; reason: string };

/**
 * Any mint as a pair: pump.fun's list first, otherwise a pump.fun coin checked
 * live (its curve or pool must price the new coin within pump.fun's range).
 * Cached briefly; the launch re-resolves the reserves when it builds.
 */
export function checkPair(mint: string): Promise<PairCheck> {
  return cached(`quotes:check:v3:${mint}`, 60_000, async (): Promise<PairCheck> => {
    const listed = await quoteToken(mint);
    if (listed) return { ok: true, token: listed };
    let resolved;
    try {
      resolved = await onlinePump.resolveQuoteMint(new PublicKey(mint));
    } catch (err) {
      return { ok: false, reason: pairRefusal(err instanceof Error ? err.message : String(err)) };
    }
    const [asset] = await assetBatch([mint]);
    const symbol = asset?.content?.metadata?.symbol?.trim();
    const name = asset?.content?.metadata?.name?.trim();
    if (!symbol || !name) return { ok: false, reason: "Couldn't read this coin's name and ticker." };
    const dex = (await dexStats([mint]).catch(() => ({}) as Awaited<ReturnType<typeof dexStats>>))[mint];
    const price = dex?.price ?? null;
    return {
      ok: true,
      token: {
        mint,
        symbol,
        name,
        image: dex?.image ?? proxiedImage(asset.content?.links?.image),
        decimals: resolved.decimals,
        tokenProgram: resolved.quoteTokenProgram.toBase58(),
        category: "pump",
        priceUsd: price,
      },
    };
  });
}

/** Featured pump.fun coins that are eligible right now, for the top of the picker. */
export async function featuredPumpPairs(): Promise<QuoteToken[]> {
  const checks = await Promise.all(FEATURED_PUMP.map((m) => checkPair(m).catch(() => null)));
  return checks.flatMap((c) => (c?.ok ? [c.token] : []));
}

/** What the launch builder needs for a pump.fun-coin pair: fresh reserves and pool accounts. */
export async function resolvePumpPair(mint: string) {
  const resolved = await onlinePump.resolveQuoteMint(new PublicKey(mint));
  return resolved.source === "pumpCoin" && resolved.pumpQuote ? resolved.pumpQuote : null;
}

export const isSolQuote = (mint: string | null | undefined) => !mint || mint === SOL;
