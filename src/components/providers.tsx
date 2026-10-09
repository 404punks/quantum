"use client";

import { createAppKit } from "@reown/appkit/react";
import { solana } from "@reown/appkit/networks";
import { SolanaAdapter } from "@reown/appkit-adapter-solana/react";
import type { ReactNode } from "react";
import { IdentityProvider } from "./identity";
import { UnlockModal } from "./unlock";

createAppKit({
  adapters: [new SolanaAdapter()],
  networks: [solana],
  defaultNetwork: solana,
  projectId: process.env.NEXT_PUBLIC_PROJECT_ID!,
  metadata: {
    name: "quantum",
    description: "Post-quantum launchpad",
    url: "https://pqc.market",
    icons: [],
  },
  themeMode: "dark",
  themeVariables: {
    "--w3m-accent": "#ececec",
    "--w3m-border-radius-master": "1px",
    "--w3m-font-family": "var(--font-geist-sans)",
  },
  features: { analytics: false, email: false, socials: false, swaps: false, onramp: false },
});

export function Providers({ children }: { children: ReactNode }) {
  return (
    <IdentityProvider>
      {children}
      <UnlockModal />
    </IdentityProvider>
  );
}
