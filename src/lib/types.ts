export type LaunchItem = {
  mint: string;
  name: string;
  symbol: string;
  description: string | null;
  image_url: string | null;
  creator: string;
  pq_address: string;
  leaf_index: number;
  message_hash?: string;
  scheme?: string;
  dev_buy_sol: number;
  created_at: string;
  launched_at: string | null;
  twitter: string | null;
  telegram: string | null;
  website: string | null;
  hardened: boolean;
  anchored: boolean;
};

export type CurveState = { progress: number; complete: boolean; marketCapSol: number };

export type MarketItem = {
  price: number | null;
  change24h: number | null;
  marketCap: number | null;
  volume24h: number | null;
  holders: number | null;
  curve: CurveState | null;
  indexed: boolean;
};
