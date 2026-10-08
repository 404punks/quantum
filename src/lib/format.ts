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
