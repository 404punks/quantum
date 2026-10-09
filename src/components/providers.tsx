"use client";

import { createAppKit } from "@reown/appkit/react";
import { solana } from "@reown/appkit/networks";
import { SolanaAdapter } from "@reown/appkit-adapter-solana/react";
import type { ReactNode } from "react";
import { IdentityProvider } from "./identity";
import { UnlockModal } from "./unlock";

// Public WalletConnect client id. A deployment can override it with NEXT_PUBLIC_PROJECT_ID.
const PROJECT_ID = process.env.NEXT_PUBLIC_PROJECT_ID || "e03bd55830b4bd0e4243b28e4e1a8572";
const origin = typeof window === "undefined" ? "https://quantum.404punks.xyz" : window.location.origin;

createAppKit({
  adapters: [new SolanaAdapter()],
  networks: [solana],
  defaultNetwork: solana,
  projectId: PROJECT_ID,
  metadata: {
    name: "quantum",
    description: "Post-quantum launch terminal",
    url: origin,
    icons: [`${origin}/logo-mark.png`],
  },
  themeMode: "dark",
  themeVariables: {
    "--w3m-accent": "#ccff00",
    "--w3m-border-radius-master": "1px",
    "--w3m-font-family": "var(--font-quantum-mono)",
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
