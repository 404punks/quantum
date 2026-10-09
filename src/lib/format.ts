export function short(value: string, head = 4, tail = 4) {
  if (!value) return "";
  return value.length <= head + tail + 1 ? value : `${value.slice(0, head)}…${value.slice(-tail)}`;
}

export function usd(value: number | null | undefined, compact = true) {
  if (value == null || !Number.isFinite(value)) return "—";
  if (compact && Math.abs(value) >= 1000) {
    return "$" + new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);
  }
  return "$" + value.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

export function price(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value) || value === 0) return "—";
  if (value >= 1) return "$" + value.toLocaleString("en-US", { maximumFractionDigits: 4 });
  const digits = Math.min(12, Math.max(4, -Math.floor(Math.log10(value)) + 3));
  return "$" + value.toFixed(digits);
}

export function pct(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

export function num(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toLocaleString("en-US");
}

export function ago(iso: string | null | undefined) {
  if (!iso) return "—";
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86_400)}d ago`;
}

export function cn(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

/** A coin's page: quantum launches (dev funds in a vault) live under /coin/q/. */
export function coinPath(mint: string, quantum?: boolean) {
  return quantum ? `/coin/q/${mint}` : `/coin/${mint}`;
}

/**
 * Merges a fresh snapshot over the previous one field by field: a value the new
 * snapshot is missing (a rate-limited lookup) keeps its last known value instead
 * of blanking until the next refresh.
 */
export function keepKnown<T extends Record<string, unknown>>(prev: T | null | undefined, next: T): T {
  if (!prev) return next;
  const out = { ...next } as Record<string, unknown>;
  for (const [k, v] of Object.entries(prev)) if (out[k] == null && v != null) out[k] = v;
  return out as T;
}

const PINATA_HOST = (() => {
  try {
    const g = process.env.NEXT_PUBLIC_PINATA_GATEWAY ?? "";
    return g ? new URL(/^https?:/.test(g) ? g : `https://${g}`).hostname : "";
  } catch {
    return "";
  }
})();

/**
 * A small, square version of a coin image. Uploads are often multi-MB (BNKR's
 * is 3.4 MB) but shown at 56px; our Pinata gateway resizes on the fly, which
 * turns that into ~5 KB. Other hosts are returned unchanged.
 */
export function thumb<T extends string | null | undefined>(url: T, px: number): T {
  if (!url || !PINATA_HOST) return url;
  try {
    const u = new URL(url);
    if (u.hostname !== PINATA_HOST) return url;
    u.searchParams.set("img-width", String(px));
    u.searchParams.set("img-height", String(px));
    u.searchParams.set("img-fit", "cover");
    return u.toString() as T;
  } catch {
    return url;
  }
}
