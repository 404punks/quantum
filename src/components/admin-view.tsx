"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowUpRight, Loader2 } from "lucide-react";
import { ago, short, thumb } from "@/lib/format";
import { CoinCard } from "./coin-card";
import { Button, Panel, Skeleton } from "./ui";

type State =
  | { admin: false }
  | {
      admin: true;
      platform: { pqAddress: string; root: string; nextLeaf: number; capacity: number };
      imports: {
        mint: string;
        imported_at: string;
        pqc_launches: { name: string; symbol: string; image_url: string; leaf_index: number; launched_at: string } | null;
      }[];
    };

type Preview = {
  mint: string;
  name: string;
  symbol: string;
  description: string | null;
  twitter: string | null;
  creator: string;
  launchedAt: string;
  txHash: string | null;
  image: string;
  curve: { progress: number; complete: boolean } | null;
};

export function AdminView() {
  const [state, setState] = useState<State | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/state", { cache: "no-store" }).then((r) => r.json()).catch(() => ({ admin: false }));
    setState(res);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (!state) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-16">
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (!state.admin) return <Login onDone={load} />;
  return <Dashboard state={state} reload={load} />;
}

function Login({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    setBusy(false);
    if (res.ok) onDone();
    else setError("Wrong password");
  }

  return (
    <div className="mx-auto flex max-w-sm flex-col px-4 py-24">
      <form onSubmit={submit} className="border border-line-strong bg-[#0b0a0a] font-mono">
        <div className="border-b border-line-strong bg-surface px-3 py-1.5 text-[11px] text-dim">pqc@bunker: ~/admin</div>
        <div className="p-5">
          <label className="text-[12px] text-muted">
            <span className="text-up">$</span> sudo admin
          </label>
          <input
            autoFocus
            type="password"
            inputMode="numeric"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="password"
            className="mt-3 h-10 w-full border border-line bg-bg px-3 text-[13px] outline-none placeholder:text-dim focus:border-line-strong"
          />
          {error && <p className="mt-2 text-[12px] text-down">{error}</p>}
          <Button variant="primary" className="mt-4 w-full" disabled={!password || busy}>
            {busy && <Loader2 size={14} className="animate-spin" />}
            Enter
          </Button>
        </div>
      </form>
    </div>
  );
}

function Dashboard({ state, reload }: { state: Extract<State, { admin: true }>; reload: () => Promise<void> }) {
  const [mint, setMint] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState<"preview" | "import" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ mint: string; leaf: number } | null>(null);
  const { platform, imports } = state;

  async function lookup(value = mint) {
    const ca = value.trim();
    if (!ca) return;
    setBusy("preview");
    setError(null);
    setPreview(null);
    setDone(null);
    try {
      const res = await fetch("/api/admin/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mint: ca }),
      }).then((r) => r.json());
      if (res.error) throw new Error(res.error);
      setPreview(res.preview);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lookup failed");
    } finally {
      setBusy(null);
    }
  }

  async function importCoin() {
    if (!preview) return;
    setBusy("import");
    setError(null);
    try {
      const res = await fetch("/api/admin/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mint: preview.mint }),
      }).then((r) => r.json());
      if (res.error) throw new Error(res.error);
      setDone(res);
      setPreview(null);
      setMint("");
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setBusy(null);
    }
  }

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    await reload();
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="font-mono text-[11.5px] text-dim">/admin</div>
          <h1 className="mt-2 font-serif text-[28px] font-bold">Import coins</h1>
        </div>
        <Button size="sm" variant="ghost" onClick={() => void logout()}>Log out</Button>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_300px]">
        <div className="space-y-6">
          <Panel className="p-5">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void lookup();
              }}
              className="flex"
            >
              <input
                value={mint}
                onChange={(e) => setMint(e.target.value)}
                onPaste={(e) => {
                  const text = e.clipboardData.getData("text").trim();
                  if (text) setTimeout(() => void lookup(text), 0);
                }}
                placeholder="Contract address"
                className="h-11 flex-1 rounded-l-md border border-r-0 border-line bg-bg px-3 font-mono text-[13px] outline-none placeholder:font-sans placeholder:text-dim focus:border-line-strong"
              />
              <button
                type="submit"
                disabled={busy !== null || !mint.trim()}
                className="flex h-11 cursor-pointer items-center gap-1.5 rounded-r-md bg-white px-4 text-[13px] font-semibold text-black hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {busy === "preview" && <Loader2 size={14} className="animate-spin" />}
                Look up
              </button>
            </form>
            <p className="mt-2 text-[11.5px] text-dim">
              Name and ticker come from Birdeye, creator and launch time from the creation transaction. The image is always the
              pqc.market logo.
            </p>
            {error && <p className="mt-3 text-[12.5px] text-down">{error}</p>}
            {done && (
              <p className="mt-3 text-[12.5px] text-up">
                Imported and attested with platform leaf #{done.leaf}.{" "}
                <Link href={`/coin/${done.mint}`} className="cursor-pointer underline underline-offset-2">View coin</Link>
              </p>
            )}
          </Panel>

          {preview && (
            <div className="fade-up grid gap-5 sm:grid-cols-[1fr_1fr]">
              <CoinCard
                preview
                launch={{ mint: preview.mint, name: preview.name, symbol: preview.symbol, image_url: preview.image, leaf_index: platform.nextLeaf, launched_at: preview.launchedAt }}
                market={{
                  price: null,
                  change24h: null,
                  marketCap: null,
                  volume24h: null,
                  holders: null,
                  curve: preview.curve ? { ...preview.curve, marketCapSol: 0 } : null,
                  indexed: true,
                }}
              />
              <Panel className="flex flex-col p-5">
                <dl className="space-y-2 font-mono text-[11.5px]">
                  <Row k="mint" v={short(preview.mint, 8, 8)} />
                  <Row k="creator" v={short(preview.creator, 6, 6)} />
                  <Row k="launched" v={ago(preview.launchedAt)} />
                  <Row k="tx" v={preview.txHash ? short(preview.txHash, 6, 6) : "—"} />
                  <Row k="signer" v={short(platform.pqAddress, 8, 6)} />
                  <Row k="leaf" v={`#${platform.nextLeaf}`} />
                </dl>
                {preview.description && <p className="mt-4 line-clamp-3 text-[12px] text-muted">{preview.description}</p>}
                <Button variant="primary" className="mt-auto w-full" onClick={() => void importCoin()} disabled={busy !== null}>
                  {busy === "import" && <Loader2 size={14} className="animate-spin" />}
                  {busy === "import" ? "Signing & importing…" : "Import & attest"}
                </Button>
              </Panel>
            </div>
          )}

          <Panel>
            <div className="border-b border-line px-5 py-3 text-[11px] uppercase tracking-wider text-dim">Imported ({imports.length})</div>
            {imports.length === 0 ? (
              <p className="px-5 py-8 text-center text-[12.5px] text-dim">Nothing imported yet.</p>
            ) : (
              <ul className="divide-y divide-line">
                {imports.map((i) => (
                  <li key={i.mint} className="flex items-center gap-3 px-5 py-3">
                    {i.pqc_launches?.image_url && <img src={thumb(i.pqc_launches.image_url, 64)} alt="" className="h-8 w-8 rounded-md border border-line object-cover" />}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-medium">{i.pqc_launches?.name ?? short(i.mint)}</div>
                      <div className="font-mono text-[11px] text-dim">
                        ${i.pqc_launches?.symbol} · leaf #{i.pqc_launches?.leaf_index} · imported {ago(i.imported_at)}
                      </div>
                    </div>
                    <Link href={`/coin/${i.mint}`} className="flex cursor-pointer items-center gap-1 text-[12px] text-muted hover:text-fg">
                      View <ArrowUpRight size={12} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <aside>
          <Panel className="p-5">
            <div className="text-[11px] uppercase tracking-wider text-dim">Platform identity</div>
            <div className="mt-2 break-all font-mono text-[12.5px] text-fg">{platform.pqAddress}</div>
            <div className="mt-1 font-mono text-[11px] text-dim">root {short(platform.root, 8, 8)}</div>
            <div className="mt-5 flex justify-between text-[11.5px] text-muted">
              <span>Keys used</span>
              <span className="font-mono">{platform.nextLeaf}/{platform.capacity}</span>
            </div>
            <div className="mt-1.5 h-1 bg-surface-3">
              <div className="h-full bg-up" style={{ width: `${(platform.nextLeaf / platform.capacity) * 100}%` }} />
            </div>
            <p className="mt-4 text-[11.5px] leading-relaxed text-dim">
              Seeded from PQC_PLATFORM_SEED. Each import burns one leaf, exactly like a launch.
            </p>
          </Panel>
        </aside>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-dim">{k}</dt>
      <dd className="text-muted">{v}</dd>
    </div>
  );
}
