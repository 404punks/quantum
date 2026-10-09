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
  /** Quantum launches: the pqc-vault the dev buy was delivered into. */
  dev_vault?: string | null;
  /** Coins paired with a token other than SOL (USDC, tokenized stocks, ...). */
  quote_mint?: string | null;
  quote_symbol?: string | null;
  quote_image?: string | null;
  created_at: string;
  launched_at: string | null;
  twitter: string | null;
  telegram: string | null;
  website: string | null;
  hardened: boolean;
  anchored: boolean;
};

export type CurveState = { progress: number; complete: boolean; marketCapSol: number | null; quoteMint?: string | null; marketCapQuoteRaw?: number | null };

export type MarketItem = {
  price: number | null;
  change24h: number | null;
  marketCap: number | null;
  volume24h: number | null;
  holders: number | null;
  curve: CurveState | null;
  indexed: boolean;
};
