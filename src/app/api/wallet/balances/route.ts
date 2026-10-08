import { walletBalances } from "@/lib/server/wallet";
import { isPubkey } from "@/lib/server/validate";

export async function GET(request: Request) {
  const addresses = (new URL(request.url).searchParams.get("addresses") ?? "").split(",").filter(isPubkey).slice(0, 32);
  if (!addresses.length) return Response.json({ balances: {} });
  try {
    return Response.json({ balances: await walletBalances(addresses) });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "RPC error" }, { status: 502 });
  }
}
