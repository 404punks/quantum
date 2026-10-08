import "server-only";
import { Connection, PublicKey, type AddressLookupTableAccount } from "@solana/web3.js";
import { OnlinePumpSdk, PumpSdk, bondingCurvePda, bondingCurveMarketCap } from "@pump-fun/pump-sdk";
import { cached } from "./cache";

export const connection = new Connection(process.env.HELIUS_RPC_URL!, "confirmed");
export const pumpSdk = new PumpSdk();
export const onlinePump = new OnlinePumpSdk(connection);

export const LAMPORTS_PER_SOL = 1_000_000_000;
export const MEMO_PROGRAM_ID = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");

let alt: AddressLookupTableAccount | null = null;
export async function pumpLookupTable() {
  if (alt) return alt;
  // Without the ALT a create+buy tx exceeds the size limit, so fail loudly instead of compiling without it.
  const value = (await connection.getAddressLookupTable(new PublicKey(process.env.PUMPFUN_LOOKUP_TABLE!))).value;
  if (!value) throw new Error("pump.fun address lookup table not found");
  alt = value;
  return alt;
}

export function fetchGlobal() {
  // Global holds BN/PublicKey values that do not survive JSON, so it stays in-process.
  return cached("pump:global", 5 * 60_000, () => onlinePump.fetchGlobal(), { shared: false });
}

export type CurveState = {
  progress: number; // 0..1
  complete: boolean;
  marketCapSol: number;
};

/** Curve state for many mints in one RPC round trip. Missing curves are omitted. */
export async function curveStates(mints: string[]): Promise<Record<string, CurveState>> {
  if (!mints.length) return {};
  const key = `curves:${[...mints].sort().join(",")}`;
  return cached(key, 15_000, async () => {
    const global = await fetchGlobal();
    const infos = await connection.getMultipleAccountsInfo(mints.map((m) => bondingCurvePda(m)));
    const initial = global.initialRealTokenReserves;
    const out: Record<string, CurveState> = {};
    infos.forEach((info, i) => {
      if (!info) return;
      const curve = pumpSdk.decodeBondingCurveNullable(info);
      if (!curve) return;
      const sold = initial.sub(curve.realTokenReserves);
      const mcap = curve.virtualTokenReserves.isZero()
        ? 0
        : bondingCurveMarketCap({
            mintSupply: curve.tokenTotalSupply,
            virtualQuoteReserves: curve.virtualQuoteReserves,
            virtualTokenReserves: curve.virtualTokenReserves,
          }).toNumber() / LAMPORTS_PER_SOL;
      out[mints[i]] = {
        complete: curve.complete,
        progress: curve.complete ? 1 : Math.max(0, Math.min(1, sold.toNumber() / initial.toNumber())),
        marketCapSol: mcap,
      };
    });
    return out;
  });
}

const CONFIRM_TIMEOUT_MS = 45_000;

export async function confirmSignature(signature: string) {
  const deadline = Date.now() + CONFIRM_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const { value } = await connection.getSignatureStatus(signature, { searchTransactionHistory: true });
    if (value?.err) throw new Error(`Transaction failed: ${JSON.stringify(value.err)}`);
    if (value?.confirmationStatus === "confirmed" || value?.confirmationStatus === "finalized") return true;
    await new Promise((r) => setTimeout(r, 1_500));
  }
  return false;
}
