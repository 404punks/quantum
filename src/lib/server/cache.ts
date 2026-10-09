import "server-only";
import Redis from "ioredis";

/**
 * Two-level TTL cache.
 *  L1: per-process memory, with request coalescing so concurrent callers share one load.
 *  L2: Redis (REDIS_URL), shared across instances and dev reloads, so Birdeye credits
 *      are spent once per TTL no matter how many servers or tabs ask.
 * Redis failures degrade to L1 only; they never fail a request.
 */

const PREFIX = "pqc:cache:";
const L1_MAX_MS = 3_000; // L2 hits are re-checked against Redis after this, keeping instances in sync

type Entry = { value: unknown; expires: number };
const memory = new Map<string, Entry>();
const pending = new Map<string, Promise<unknown>>();

const globalForRedis = globalThis as unknown as { pqcRedis?: Redis | null };

function redis(): Redis | null {
  if (globalForRedis.pqcRedis !== undefined) return globalForRedis.pqcRedis;
  const url = process.env.REDIS_URL;
  if (!url) return (globalForRedis.pqcRedis = null);
  const client = new Redis(url, {
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    connectTimeout: 3_000,
    commandTimeout: 1_500,
  });
  client.on("error", (err) => console.warn("redis:", err.message));
  return (globalForRedis.pqcRedis = client);
}

/** Waits up to 1s for a cold client to connect; never throws. */
async function ready(r: Redis) {
  if (r.status === "ready") return true;
  if (r.status !== "connecting" && r.status !== "connect" && r.status !== "wait") return false;
  return new Promise<boolean>((resolve) => {
    const done = (ok: boolean) => {
      clearTimeout(timer);
      r.off("ready", onReady);
      resolve(ok);
    };
    const onReady = () => done(true);
    const timer = setTimeout(() => done(false), 1_000);
    r.once("ready", onReady);
  });
}

async function l2Get<T>(key: string): Promise<T | undefined> {
  const r = redis();
  if (!r || !(await ready(r))) return undefined;
  try {
    const raw = await r.get(PREFIX + key);
    return raw == null ? undefined : (JSON.parse(raw) as T);
  } catch {
    return undefined;
  }
}

function l2Set(key: string, value: unknown, ttlMs: number) {
  const r = redis();
  if (!r || r.status !== "ready") return;
  r.set(PREFIX + key, JSON.stringify(value), "PX", ttlMs).catch(() => {});
}

/**
 * `shared: false` keeps a value in L1 only. Use it for values that don't survive
 * JSON (BN, PublicKey) such as the pump Global account.
 */
export async function cached<T>(
  key: string,
  ttlMs: number,
  load: () => Promise<T>,
  { shared = true }: { shared?: boolean } = {},
): Promise<T> {
  const now = Date.now();
  const hit = memory.get(key);
  if (hit && hit.expires > now) return hit.value as T;

  const inflight = pending.get(key);
  if (inflight) return inflight as Promise<T>;

  const task = (async () => {
    if (shared) {
      const remote = await l2Get<T>(key);
      if (remote !== undefined) {
        memory.set(key, { value: remote, expires: Date.now() + Math.min(ttlMs, L1_MAX_MS) });
        return remote;
      }
    }
    const value = await load();
    memory.set(key, { value, expires: Date.now() + ttlMs });
    if (shared) l2Set(key, value, ttlMs);
    return value;
  })().finally(() => pending.delete(key));

  pending.set(key, task);
  return task;
}

/**
 * Drops every cached value whose key starts with `prefix`, in this process and
 * in Redis. Other instances keep at most their short L1 copy (L1_MAX_MS).
 */
export async function invalidate(prefix: string) {
  for (const key of memory.keys()) if (key.startsWith(prefix)) memory.delete(key);
  const r = redis();
  if (!r || !(await ready(r))) return;
  try {
    let cursor = "0";
    do {
      const [next, keys] = await r.scan(cursor, "MATCH", `${PREFIX}${prefix}*`, "COUNT", 200);
      cursor = next;
      if (keys.length) await r.del(...keys);
    } while (cursor !== "0");
  } catch {
    // Expiry still bounds staleness.
  }
}

/** Reads a value written with `store` (memory first, then Redis). */
export async function getStored<T>(key: string): Promise<T | undefined> {
  const hit = memory.get(key);
  if (hit && hit.expires > Date.now()) return hit.value as T;
  const remote = await l2Get<T>(key);
  if (remote !== undefined) memory.set(key, { value: remote, expires: Date.now() + L1_MAX_MS });
  return remote;
}

/** Writes a value directly (no loader), shared across instances through Redis. */
export function store(key: string, value: unknown, ttlMs: number) {
  memory.set(key, { value, expires: Date.now() + Math.min(ttlMs, L1_MAX_MS) });
  l2Set(key, value, ttlMs);
}
