import "server-only";
import { bondingCurvePda } from "@pump-fun/pump-sdk";
import { cached } from "./cache";
import { connection, pumpSdk } from "./solana";

/**
 * Which of these mints have graduated (curve complete, liquidity on PumpSwap).
 * Chunked: getMultipleAccountsInfo accepts at most 100 accounts per call.
 * Kept out of solana.ts: adding ESM-only imports there broke Turbopack dev.
 */
export function graduatedMints(mints: string[]): Promise<string[]> {
  if (!mints.length) return Promise.resolve([]);
  const sorted = [...mints].sort();
  return cached(`graduated:${sorted.length}:${sorted.join(",")}`, 30_000, async () => {
    const out: string[] = [];
    for (let i = 0; i < sorted.length; i += 100) {
      const chunk = sorted.slice(i, i + 100);
      const infos = await connection.getMultipleAccountsInfo(chunk.map((m) => bondingCurvePda(m)));
      infos.forEach((info, j) => {
        const curve = info ? pumpSdk.decodeBondingCurveNullable(info) : null;
        if (curve?.complete) out.push(chunk[j]);
      });
    }
    return out;
  });
}
