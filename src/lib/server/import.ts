import "server-only";
import { tokenCreation, tokenMeta } from "./birdeye";
import { curveStates } from "./solana";
import { db } from "./supabase";
import { cleanUrl } from "./validate";

export type ImportPreview = {
  mint: string;
  name: string;
  symbol: string;
  description: string | null;
  twitter: string | null;
  creator: string;
  launchedAt: string;
  txHash: string | null;
  curve: { progress: number; complete: boolean } | null;
};

/** Everything needed to import a coin, derived from its contract address alone. */
export async function resolveImport(mint: string): Promise<ImportPreview> {
  const { data: existing } = await db.from("pqc_launches").select("mint").eq("mint", mint).maybeSingle();
  if (existing) throw new ImportError("Already listed on quantum", 409);

  const [meta, creation, curves] = await Promise.all([
    tokenMeta(mint).catch(() => null),
    tokenCreation(mint).catch(() => null),
    curveStates([mint]).catch(() => ({}) as Awaited<ReturnType<typeof curveStates>>),
  ]);
  if (!meta?.name || !meta?.symbol) {
    throw new ImportError("Birdeye has no metadata for this mint yet. Fresh mints take about a minute to index.", 404);
  }

  const curve = curves[mint] ?? null;
  return {
    mint,
    name: meta.name.trim().slice(0, 32),
    symbol: meta.symbol.trim().slice(0, 10),
    description: meta.extensions?.description?.trim().slice(0, 500) || null,
    twitter: cleanUrl(meta.extensions?.twitter),
    creator: creation?.owner ?? process.env.NEXT_PUBLIC_TREASURY!,
    launchedAt: new Date(creation?.blockUnixTime ? creation.blockUnixTime * 1000 : Date.now()).toISOString(),
    txHash: creation?.txHash ?? null,
    curve: curve ? { progress: curve.progress, complete: curve.complete } : null,
  };
}

export class ImportError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
