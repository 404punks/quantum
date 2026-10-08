"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Eye, EyeOff, Loader2, X } from "lucide-react";
import { cn } from "@/lib/format";
import { derivationMessage } from "@/lib/pq/messages";
import { useIdentity } from "./identity";
import { KeyGrid } from "./key-grid";
import { Button, ButtonLink, Panel } from "./ui";

/**
 * The page's primary action, swapped for whatever is missing first:
 * wallet → registered identity → unlocked keys → the real action.
 * Pages render fully for everyone; only this button changes.
 */
export function GatedButton({
  children,
  onClick,
  disabled,
  busy,
  needsIdentity = true,
  className,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  busy?: boolean;
  needsIdentity?: boolean;
  className?: string;
}) {
  const { connected, connect, remote, remoteLoading, unlocked, requestUnlock } = useIdentity();

  if (!connected) {
    return <Button variant="primary" onClick={connect} className={className}>Connect Wallet</Button>;
  }
  if (remoteLoading && !remote) {
    return (
      <Button variant="primary" disabled className={className}>
        <Loader2 size={14} className="animate-spin" />
      </Button>
    );
  }
  if (needsIdentity && !remote) {
    return <ButtonLink href="/identity" variant="primary" className={className}>Create a PQ identity to continue</ButtonLink>;
  }
  if (!unlocked) {
    return <Button variant="primary" onClick={requestUnlock} className={className}>Unlock keys to continue</Button>;
  }
  return (
    <Button variant="primary" onClick={onClick} disabled={disabled || busy} className={className}>
      {busy && <Loader2 size={14} className="animate-spin" />}
      {children}
    </Button>
  );
}

/** Modal around UnlockPanel, opened by requestUnlock() from anywhere. */
export function UnlockModal() {
  const { unlockOpen, closeUnlock, unlocked } = useIdentity();

  useEffect(() => {
    if (unlocked) closeUnlock();
  }, [unlocked, closeUnlock]);

  useEffect(() => {
    if (!unlockOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeUnlock();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [unlockOpen, closeUnlock]);

  if (!unlockOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm sm:items-center" onClick={closeUnlock}>
      <div className="fade-up relative w-full max-w-3xl" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={closeUnlock}
          className="absolute right-3 top-3 z-10 cursor-pointer rounded-xl p-1.5 text-muted transition-colors hover:bg-surface-2 hover:text-fg"
          aria-label="Close"
        >
          <X size={16} />
        </button>
        <UnlockPanel />
      </div>
    </div>
  );
}

export function UnlockPanel({ title }: { title?: string }) {
  const { wallet, connected, connect, remote, unlock, phase } = useIdentity();
  const registered = Boolean(remote);
  const mustHarden = Boolean(remote?.passphrase_hardened);
  const [harden, setHarden] = useState(true);
  const [passphrase, setPassphrase] = useState("");
  const [show, setShow] = useState(false);
  const busy = phase.step === "signing" || phase.step === "hardening" || phase.step === "building";
  const usePassphrase = registered ? mustHarden : harden;
  const built = phase.step === "building" ? phase.done : phase.step === "ready" ? 256 : 0;

  return (
    <Panel className="grid gap-0 overflow-hidden md:grid-cols-[1.1fr_1fr]">
      <div className="p-6">
        <div className="text-[11px] uppercase tracking-wider text-dim">{registered ? "Unlock" : "Step 1 · Derive"}</div>
        <h2 className="mt-2 font-serif text-[20px] font-bold">
          {title ?? (registered ? "Unlock your post-quantum keys" : "Derive your post-quantum keys")}
        </h2>
        <p className="mt-2 text-[13px] leading-relaxed text-muted">
          Your wallet signs a fixed message. Its deterministic signature seeds 256 Winternitz one-time keys, hashed into a
          Merkle tree in this tab. Secrets never leave the browser and are forgotten when you close it.
        </p>

        <div className="mt-5 rounded-xl border border-line bg-bg p-3">
          <div className="mb-2 text-[11px] uppercase tracking-wider text-dim">Message you will sign</div>
          <pre className="max-h-40 overflow-auto whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-muted">
            {derivationMessage(wallet ?? "<your wallet>")}
          </pre>
        </div>

        {!registered && (
          <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-line p-3 transition-colors hover:border-line-strong">
            <input
              type="checkbox"
              checked={harden}
              onChange={(e) => setHarden(e.target.checked)}
              className="mt-0.5 cursor-pointer accent-white"
            />
            <span>
              <span className="text-[13px] font-medium">
                Harden with a passphrase <span className="text-up">(recommended)</span>
              </span>
              <span className="mt-1 block text-[12px] leading-relaxed text-muted">
                If ed25519 itself breaks, anyone who recovers your wallet key could re-derive wallet-only keys. A passphrase
                adds entropy the curve never sees. Scrypt (N=2¹⁵). Lose it and the identity is gone.
              </span>
            </span>
          </label>
        )}

        {usePassphrase && (
          <div className="relative mt-3">
            <input
              type={show ? "text" : "password"}
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              placeholder={registered ? "Your identity passphrase" : "Choose a strong passphrase"}
              className="h-10 w-full rounded-xl border border-line bg-bg px-3 pr-10 font-mono text-[13px] outline-none placeholder:text-dim focus:border-line-strong"
            />
            <button
              type="button"
              onClick={() => setShow((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer p-1 text-dim hover:text-fg"
              aria-label="Toggle passphrase visibility"
            >
              {show ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
        )}

        {!connected ? (
          <Button variant="primary" className="mt-5 w-full" onClick={connect}>Connect Wallet</Button>
        ) : (
          <Button
            variant="primary"
            className="mt-5 w-full"
            disabled={busy || (usePassphrase && passphrase.length < 8)}
            onClick={() => void unlock(usePassphrase ? passphrase : undefined).catch(() => {})}
          >
            {busy && <Loader2 size={14} className="animate-spin" />}
            {phase.step === "signing"
              ? "Waiting for wallet signature…"
              : phase.step === "hardening"
                ? `Hardening passphrase… ${Math.round(phase.progress * 100)}%`
                : phase.step === "building"
                  ? `Generating keys ${phase.done}/${phase.total}`
                  : registered
                    ? "Sign & unlock"
                    : "Sign & derive keys"}
          </Button>
        )}
        {usePassphrase && passphrase.length > 0 && passphrase.length < 8 && (
          <p className="mt-2 text-[11.5px] text-dim">At least 8 characters.</p>
        )}
        {phase.step === "error" && <p className="mt-3 text-[12px] text-down">{phase.message}</p>}
      </div>

      <div className="border-t border-line bg-bg p-6 md:border-l md:border-t-0">
        <div className="mb-3 flex items-center justify-between text-[11px] uppercase tracking-wider text-dim">
          <span>One-time key tree</span>
          <span className="font-mono normal-case tracking-normal">{built}/256</span>
        </div>
        <KeyGrid built={built} />
        <div className="mt-4 space-y-1.5 font-mono text-[11px] text-dim">
          <Row label="scheme" value="WOTS w=16 · SHA-256" />
          <Row label="chains / key" value="67 × 15 hashes" />
          <Row label="tree height" value="8 → 256 keys" />
          <Row label="signature" value="2,404 bytes" />
          <Row label="assumption" value="hash 2nd-preimage only" />
        </div>
        <div className={cn("mt-4 h-1 overflow-hidden rounded-full bg-surface-3", !busy && "opacity-0")}>
          <div
            className="h-full bg-fg transition-[width]"
            style={{
              width:
                phase.step === "building"
                  ? `${(phase.done / phase.total) * 100}%`
                  : phase.step === "hardening"
                    ? `${phase.progress * 100}%`
                    : "0%",
            }}
          />
        </div>
      </div>
    </Panel>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span>{label}</span>
      <span className="text-muted">{value}</span>
    </div>
  );
}
