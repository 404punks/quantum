"use client";

import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";
import { useAppKit, useAppKitAccount, useAppKitProvider, useDisconnect } from "@reown/appkit/react";
import type { Provider } from "@reown/appkit-adapter-solana/react";
import type { VersionedTransaction } from "@solana/web3.js";
import bs58 from "bs58";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { deriveSeeds, hardenPassphrase } from "@/lib/pq/derive";
import { derivationMessage, registrationStatement } from "@/lib/pq/messages";
import { bindingDigest, deriveSchemeKeys, type SchemeId } from "@/lib/pq/schemes";
import { buildTree, pqAddress, sign, treeRoot, type PqSignature, type Tree } from "@/lib/pq/xmss";

export type SchemeKey = { scheme: SchemeId; public_key: string; binding: PqSignature };
export type SchemeKeys = { secretKey: Uint8Array; publicKey: string; binding: PqSignature };

export type LeafUse = { leaf_index: number; purpose: "genesis" | "launch" | "proof" | "bind" | "transfer"; ref: string | null; used_at: string };

export type RemoteIdentity = {
  id: string;
  wallet: string;
  pq_address: string;
  root: string;
  pub_seed: string;
  height: number;
  passphrase_hardened: boolean;
  anchor_tx: string | null;
  anchored_at: string | null;
  created_at: string;
};

export type Unlocked = {
  wallet: string;
  skSeed: Uint8Array;
  pubSeed: Uint8Array;
  tree: Tree;
  root: string;
  pubSeedHex: string;
  pqAddress: string;
  hardened: boolean;
};

export type Phase =
  | { step: "idle" }
  | { step: "signing" }
  | { step: "hardening"; progress: number }
  | { step: "building"; done: number; total: number }
  | { step: "ready" }
  | { step: "error"; message: string };

type Ctx = {
  wallet?: string;
  connected: boolean;
  connect: () => void;
  disconnect: () => void;
  remote: RemoteIdentity | null;
  leaves: LeafUse[];
  schemeKeys: SchemeKey[];
  /** Derives the scheme keypair; binds it under the WOTS root (one leaf) the first time. */
  ensureSchemeKey: (scheme: Exclude<SchemeId, "wots">) => Promise<SchemeKeys>;
  nextLeaf: number;
  remoteLoading: boolean;
  refresh: () => Promise<void>;
  unlocked: Unlocked | null;
  phase: Phase;
  unlock: (passphrase?: string) => Promise<Unlocked>;
  lock: () => void;
  register: (u: Unlocked) => Promise<void>;
  signWithLeaf: (digest: Uint8Array, leaf: number) => PqSignature;
  signTransaction: (tx: VersionedTransaction) => Promise<VersionedTransaction>;
  signAllTransactions: (txs: VersionedTransaction[]) => Promise<VersionedTransaction[]>;
  unlockOpen: boolean;
  requestUnlock: () => void;
  closeUnlock: () => void;
};

const IdentityContext = createContext<Ctx | null>(null);

export function useIdentity() {
  const ctx = useContext(IdentityContext);
  if (!ctx) throw new Error("useIdentity outside IdentityProvider");
  return ctx;
}

export function IdentityProvider({ children }: { children: ReactNode }) {
  const { open } = useAppKit();
  const { disconnect } = useDisconnect();
  const { address, isConnected } = useAppKitAccount({ namespace: "solana" });
  const { walletProvider } = useAppKitProvider<Provider>("solana");

  const [remote, setRemote] = useState<RemoteIdentity | null>(null);
  const [leaves, setLeaves] = useState<LeafUse[]>([]);
  const [schemeKeys, setSchemeKeys] = useState<SchemeKey[]>([]);
  const [nextLeaf, setNextLeaf] = useState(0);
  const [remoteLoading, setRemoteLoading] = useState(false);
  const [unlocked, setUnlocked] = useState<Unlocked | null>(null);
  const [phase, setPhase] = useState<Phase>({ step: "idle" });
  const [unlockOpen, setUnlockOpen] = useState(false);
  const requestUnlock = useCallback(() => setUnlockOpen(true), []);
  const closeUnlock = useCallback(() => setUnlockOpen(false), []);

  const wallet = isConnected ? address : undefined;

  const refresh = useCallback(async () => {
    if (!wallet) return;
    setRemoteLoading(true);
    try {
      const res = await fetch(`/api/identity?wallet=${wallet}`, { cache: "no-store" });
      const json = await res.json();
      setRemote(json.identity ?? null);
      setLeaves(json.leaves ?? []);
      setSchemeKeys(json.schemeKeys ?? []);
      setNextLeaf(json.nextLeaf ?? 0);
    } finally {
      setRemoteLoading(false);
    }
  }, [wallet]);

  // Secrets never outlive the wallet they were derived from.
  useEffect(() => {
    setUnlocked(null);
    setPhase({ step: "idle" });
    setRemote(null);
    setLeaves([]);
    setSchemeKeys([]);
    setNextLeaf(0);
    if (wallet) void refresh();
  }, [wallet, refresh]);

  const unlock = useCallback(
    async (passphrase?: string) => {
      if (!wallet || !walletProvider) throw new Error("Connect a wallet first");
      try {
        setPhase({ step: "signing" });
        const signature = await walletProvider.signMessage(utf8ToBytes(derivationMessage(wallet)));

        // TODO: some MPC / hardware signers may not be RFC 8032 deterministic.
        // Detect by signing twice on first registration and refusing if they differ.

        let hardening: Uint8Array | undefined;
        if (passphrase) {
          setPhase({ step: "hardening", progress: 0 });
          hardening = await hardenPassphrase(passphrase, wallet, (p) => setPhase({ step: "hardening", progress: p }));
        }

        const seeds = deriveSeeds(signature, wallet, hardening);
        const tree = await buildTree(seeds.skSeed, seeds.pubSeed, undefined, (done, total) =>
          setPhase({ step: "building", done, total }),
        );
        const root = bytesToHex(treeRoot(tree));
        const pubSeedHex = bytesToHex(seeds.pubSeed);
        const result: Unlocked = {
          wallet,
          skSeed: seeds.skSeed,
          pubSeed: seeds.pubSeed,
          tree,
          root,
          pubSeedHex,
          pqAddress: pqAddress({ root, pubSeed: pubSeedHex, height: tree.height }),
          hardened: seeds.hardened,
        };

        if (remote && remote.root !== root) {
          throw new Error(
            remote.passphrase_hardened
              ? "Derived keys don't match your registered identity. Check your passphrase."
              : "Derived keys don't match your registered identity.",
          );
        }
        setUnlocked(result);
        setPhase({ step: "ready" });
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unlock failed";
        setPhase({ step: "error", message });
        throw err;
      }
    },
    [wallet, walletProvider, remote],
  );

  const register = useCallback(
    async (u: Unlocked) => {
      if (!walletProvider) throw new Error("Connect a wallet first");
      const statement = registrationStatement({
        wallet: u.wallet,
        pqAddress: u.pqAddress,
        root: u.root,
        pubSeed: u.pubSeedHex,
        height: u.tree.height,
      });
      const edSignature = await walletProvider.signMessage(utf8ToBytes(statement));
      const genesis = sign(sha256(utf8ToBytes(statement)), u.skSeed, u.pubSeed, u.tree, 0);
      const res = await fetch("/api/identity/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wallet: u.wallet,
          root: u.root,
          pubSeed: u.pubSeedHex,
          height: u.tree.height,
          hardened: u.hardened,
          edSignature: bs58.encode(edSignature),
          genesis,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Registration failed");
      await refresh();
    },
    [walletProvider, refresh],
  );

  const ensureSchemeKey = useCallback(
    async (scheme: Exclude<SchemeId, "wots">): Promise<SchemeKeys> => {
      if (!unlocked || !wallet) throw new Error("Unlock your identity first");
      const keys = await deriveSchemeKeys(unlocked.skSeed, scheme);
      const publicKey = bytesToHex(keys.publicKey);
      const existing = schemeKeys.find((k) => k.scheme === scheme);
      if (existing) {
        if (existing.public_key !== publicKey) throw new Error("Derived key does not match the bound key");
        return { secretKey: keys.secretKey, publicKey, binding: existing.binding };
      }
      const binding = sign(bindingDigest({ scheme, publicKey, pqAddress: unlocked.pqAddress }), unlocked.skSeed, unlocked.pubSeed, unlocked.tree, nextLeaf);
      const res = await fetch("/api/identity/scheme-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet, scheme, publicKey, binding }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Binding failed");
      await refresh();
      return { secretKey: keys.secretKey, publicKey, binding };
    },
    [unlocked, wallet, schemeKeys, nextLeaf, refresh],
  );

  const signWithLeaf = useCallback(
    (digest: Uint8Array, leaf: number) => {
      if (!unlocked) throw new Error("Unlock your identity first");
      return sign(digest, unlocked.skSeed, unlocked.pubSeed, unlocked.tree, leaf);
    },
    [unlocked],
  );

  const signTransaction = useCallback(
    async (tx: VersionedTransaction) => {
      if (!walletProvider) throw new Error("Connect a wallet first");
      return walletProvider.signTransaction(tx);
    },
    [walletProvider],
  );

  /** One wallet prompt for several transactions; falls back to one prompt each. */
  const signAllTransactions = useCallback(
    async (txs: VersionedTransaction[]) => {
      if (!walletProvider) throw new Error("Connect a wallet first");
      if (!txs.length) return [];
      if (typeof walletProvider.signAllTransactions === "function") return walletProvider.signAllTransactions(txs);
      const out: VersionedTransaction[] = [];
      for (const tx of txs) out.push(await walletProvider.signTransaction(tx));
      return out;
    },
    [walletProvider],
  );

  const value = useMemo<Ctx>(
    () => ({
      wallet,
      connected: Boolean(wallet),
      connect: () => void open(),
      disconnect: () => void disconnect(),
      remote,
      leaves,
      nextLeaf,
      remoteLoading,
      refresh,
      unlocked,
      phase,
      unlock,
      lock: () => {
        setUnlocked(null);
        setPhase({ step: "idle" });
      },
      register,
      signWithLeaf,
      schemeKeys,
      ensureSchemeKey,
      signTransaction,
      signAllTransactions,
      unlockOpen,
      requestUnlock,
      closeUnlock,
    }),
    [wallet, open, disconnect, remote, leaves, schemeKeys, ensureSchemeKey, nextLeaf, remoteLoading, refresh, unlocked, phase, unlock, register, signWithLeaf, signTransaction, signAllTransactions, unlockOpen, requestUnlock, closeUnlock],
  );

  return <IdentityContext.Provider value={value}>{children}</IdentityContext.Provider>;
}
