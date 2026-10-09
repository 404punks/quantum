import "server-only";
import { getStored, store } from "./cache";

/**
 * Last known market numbers per coin (1h, shared via Redis). A rate-limited
 * DexScreener batch or a failed holder lookup would otherwise leave a coin with
 * no value: it would sink out of a sort (behind "Load more") or blank on its
 * card. Fresh values always win; these only fill gaps.
 */

export type Metric = "mcap" | "volume" | "holders";
const TTL = 60 * 60_000;
const key = (m: Metric) => `last-known:v1:${m}`;

export async function lastKnown(metric: Metric): Promise<Record<string, number>> {
  return (await getStored<Record<string, number>>(key(metric)).catch(() => undefined)) ?? {};
}

const writes = new Map<Metric, Promise<void>>();

/** Remembers fresh values (merged into what is already known). Writes per metric run one at a time. */
export function remember(metric: Metric, fresh: Record<string, number>): Promise<void> {
  const entries = Object.entries(fresh).filter(([, v]) => typeof v === "number" && Number.isFinite(v) && v > 0);
  if (!entries.length) return Promise.resolve();
  const next = (writes.get(metric) ?? Promise.resolve())
    .then(async () => {
      const prev = await lastKnown(metric);
      store(key(metric), { ...prev, ...Object.fromEntries(entries) }, TTL);
    })
    .catch(() => {});
  writes.set(metric, next);
  return next;
}

/** Fills missing entries in `values` (in place) from the last known ones. */
export async function fillFromLastKnown(metric: Metric, mints: string[], values: Record<string, number>) {
  const missing = mints.filter((m) => values[m] === undefined);
  if (!missing.length) return 0;
  const known = await lastKnown(metric);
  let filled = 0;
  for (const m of missing) {
    if (known[m] !== undefined) {
      values[m] = known[m];
      filled++;
    }
  }
  return filled;
}
