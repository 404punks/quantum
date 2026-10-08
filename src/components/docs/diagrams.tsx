/**
 * Docs diagrams. Plain SVG drawn with theme tokens via Tailwind fill-/stroke-
 * utilities, so they track the palette. No client JS.
 */

const W = 16;

export function Figure({ children, caption }: { children: React.ReactNode; caption: string }) {
  return (
    <figure className="my-6 border border-line-strong bg-[#0b0a0a]">
      <div className="overflow-x-auto p-4 sm:p-6">{children}</div>
      <figcaption className="border-t border-line-strong px-4 py-2 font-mono text-[11px] text-dim">{caption}</figcaption>
    </figure>
  );
}

/** ADRS: the 32-byte tweak fed into every hash call. */
export function AdrsDiagram() {
  const fields = [
    { label: "type", bytes: 4, note: "0 chain · 1 leaf-pk · 2 node · 3 sk-prf", tone: "fill-warn/15 stroke-warn" },
    { label: "a", bytes: 4, note: "leaf  |  height", tone: "fill-up/10 stroke-up/70" },
    { label: "b", bytes: 4, note: "chain  |  node index", tone: "fill-up/10 stroke-up/70" },
    { label: "c", bytes: 4, note: "step", tone: "fill-up/10 stroke-up/70" },
    { label: "zero pad", bytes: 16, note: "", tone: "fill-surface-2 stroke-line-strong" },
  ];
  const unit = 22;
  let x = 0;
  return (
    <svg viewBox={`0 0 ${32 * unit + 2} 92`} className="h-auto w-full min-w-[620px] font-mono">
      {fields.map((f) => {
        const x0 = x;
        x += f.bytes * unit;
        return (
          <g key={f.label}>
            <rect x={x0 + 1} y={14} width={f.bytes * unit} height={34} className={f.tone} strokeWidth={1} />
            {Array.from({ length: f.bytes - 1 }, (_, i) => (
              <line key={i} x1={x0 + 1 + (i + 1) * unit} x2={x0 + 1 + (i + 1) * unit} y1={42} y2={48} className="stroke-line-strong" />
            ))}
            <text x={x0 + 1 + (f.bytes * unit) / 2} y={36} textAnchor="middle" className="fill-fg text-[12px]">
              {f.label}
            </text>
            <text x={x0 + 1 + (f.bytes * unit) / 2} y={68} textAnchor="middle" className="fill-dim text-[10px]">
              {f.note}
            </text>
            <text x={x0 + 2} y={10} className="fill-dim text-[9px]">
              {x0 / unit}
            </text>
          </g>
        );
      })}
      <text x={32 * unit - 10} y={10} className="fill-dim text-[9px]">32</text>
      <text x={1} y={88} className="fill-muted text-[10px]">u32 big-endian fields · F(pk.seed, ADRS, x) = SHA-256(pk.seed ‖ ADRS ‖ x)</text>
    </svg>
  );
}

/** Three WOTS chains: signer walks sk → σ, verifier walks σ → pk. */
export function ChainDiagram() {
  const rows = [
    { i: 0, d: 5 },
    { i: 1, d: 12 },
    { i: 2, d: 2 },
  ];
  const step = 38;
  const x0 = 64;
  const rowH = 58;
  return (
    <svg viewBox={`0 0 ${x0 + step * (W - 1) + 90} ${rows.length * rowH + 48}`} className="h-auto w-full min-w-[680px] font-mono">
      <defs>
        <marker id="arr-up" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M0,0 L6,3 L0,6 z" className="fill-up" />
        </marker>
        <marker id="arr-fg" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M0,0 L6,3 L0,6 z" className="fill-muted" />
        </marker>
      </defs>
      {Array.from({ length: W }, (_, s) => (
        <text key={s} x={x0 + s * step} y={14} textAnchor="middle" className="fill-dim text-[9px]">
          {s}
        </text>
      ))}
      {rows.map(({ i, d }, r) => {
        const y = 40 + r * rowH;
        return (
          <g key={i}>
            <text x={0} y={y + 4} className="fill-muted text-[11px]">
              chain {i}
            </text>
            <line x1={x0} x2={x0 + step * d - 8} y1={y} y2={y} className="stroke-muted" strokeWidth={1.25} markerEnd="url(#arr-fg)" />
            <line x1={x0 + step * d + 8} x2={x0 + step * (W - 1) - 8} y1={y} y2={y} className="stroke-up" strokeWidth={1.25} markerEnd="url(#arr-up)" />
            {Array.from({ length: W }, (_, s) => {
              const cx = x0 + s * step;
              const tone = s === d ? "fill-warn stroke-warn" : s < d ? "fill-fg/70 stroke-fg/70" : "fill-up stroke-up";
              return <rect key={s} x={cx - 4} y={y - 4} width={8} height={8} className={tone} />;
            })}
            <text x={x0} y={y + 20} textAnchor="middle" className="fill-dim text-[9.5px]">sk{i}</text>
            <text x={x0 + step * d} y={y - 12} textAnchor="middle" className="fill-warn text-[10px]">σ{i} (d={d})</text>
            <text x={x0 + step * (W - 1)} y={y + 20} textAnchor="middle" className="fill-up text-[9.5px]">pk{i}</text>
          </g>
        );
      })}
      <g transform={`translate(0 ${rows.length * rowH + 30})`}>
        <rect x={0} y={-7} width={8} height={8} className="fill-fg/70" />
        <text x={14} y={0} className="fill-muted text-[10px]">signer: F applied dᵢ times</text>
        <rect x={210} y={-7} width={8} height={8} className="fill-warn" />
        <text x={224} y={0} className="fill-muted text-[10px]">signature element σᵢ</text>
        <rect x={400} y={-7} width={8} height={8} className="fill-up" />
        <text x={414} y={0} className="fill-muted text-[10px]">verifier: F applied 15 − dᵢ times</text>
      </g>
    </svg>
  );
}

/** Height-3 Merkle tree showing the auth path for leaf 5. */
export function TreeDiagram() {
  const H = 3;
  const leaf = 5;
  const width = 640;
  const levelY = (h: number) => 210 - h * 60;
  const nodeX = (h: number, j: number) => {
    const span = width / (1 << (H - h));
    return span * j + span / 2;
  };
  const onPath = (h: number, j: number) => j === leaf >> h;
  const isAuth = (h: number, j: number) => h < H && j === ((leaf >> h) ^ 1);

  const nodes: { h: number; j: number }[] = [];
  for (let h = 0; h <= H; h++) for (let j = 0; j < 1 << (H - h); j++) nodes.push({ h, j });

  return (
    <svg viewBox={`0 0 ${width} 250`} className="h-auto w-full min-w-[560px] font-mono">
      {nodes
        .filter(({ h }) => h > 0)
        .map(({ h, j }) =>
          [0, 1].map((c) => {
            const child = 2 * j + c;
            const hot = onPath(h, j) && onPath(h - 1, child);
            return (
              <line
                key={`${h}-${j}-${c}`}
                x1={nodeX(h, j)}
                y1={levelY(h) + 11}
                x2={nodeX(h - 1, child)}
                y2={levelY(h - 1) - 11}
                className={hot ? "stroke-up" : "stroke-line-strong"}
                strokeWidth={hot ? 1.5 : 1}
              />
            );
          }),
        )}
      {nodes.map(({ h, j }) => {
        const x = nodeX(h, j);
        const y = levelY(h);
        const path = onPath(h, j);
        const auth = isAuth(h, j);
        const tone = path ? "fill-up/15 stroke-up" : auth ? "fill-warn/15 stroke-warn" : "fill-surface stroke-line-strong";
        const label = h === H ? "root" : h === 0 ? `ℓ${j}` : `n${h},${j}`;
        return (
          <g key={`${h}-${j}`}>
            <rect x={x - 26} y={y - 11} width={52} height={22} className={tone} strokeWidth={1} />
            <text x={x} y={y + 4} textAnchor="middle" className={path ? "fill-up text-[10.5px]" : auth ? "fill-warn text-[10.5px]" : "fill-muted text-[10.5px]"}>
              {label}
            </text>
            {auth && (
              <text x={x} y={y + 25} textAnchor="middle" className="fill-warn text-[9px]">
                a{h}
              </text>
            )}
          </g>
        );
      })}
      <text x={0} y={246} className="fill-dim text-[10px]">
        node(h, j) = SHA-256(pk.seed ‖ ADRS(2, h, j) ‖ left ‖ right) · signature carries a0, a1, a2 · production h = 8
      </text>
    </svg>
  );
}

function Box({ x, y, w, h = 34, title, sub, tone = "neutral" }: { x: number; y: number; w: number; h?: number; title: string; sub?: string; tone?: "neutral" | "up" | "warn" | "secret" }) {
  const cls =
    tone === "up" ? "fill-up/10 stroke-up" : tone === "warn" ? "fill-warn/10 stroke-warn" : tone === "secret" ? "fill-down/10 stroke-down/70" : "fill-surface stroke-line-strong";
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} className={cls} strokeWidth={1} />
      <text x={x + w / 2} y={y + (sub ? 15 : h / 2 + 4)} textAnchor="middle" className="fill-fg text-[11px]">
        {title}
      </text>
      {sub && (
        <text x={x + w / 2} y={y + 27} textAnchor="middle" className="fill-dim text-[9.5px]">
          {sub}
        </text>
      )}
    </g>
  );
}

function Arrow({ x1, y1, x2, y2, label }: { x1: number; y1: number; x2: number; y2: number; label?: string }) {
  return (
    <g>
      <line x1={x1} y1={y1} x2={x2} y2={y2} className="stroke-muted" strokeWidth={1} markerEnd="url(#arr-flow)" />
      {label && (
        <text x={(x1 + x2) / 2 + 6} y={(y1 + y2) / 2 + 3} className="fill-dim text-[9px]">
          {label}
        </text>
      )}
    </g>
  );
}

/** Wallet signature → seeds → tree → root → pq address. */
export function DerivationDiagram() {
  return (
    <svg viewBox="0 0 700 330" className="h-auto w-full min-w-[620px] font-mono">
      <defs>
        <marker id="arr-flow" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M0,0 L6,3 L0,6 z" className="fill-muted" />
        </marker>
      </defs>
      <Box x={20} y={10} w={250} title="wallet.signMessage(M_derive)" sub="ed25519 · RFC 8032 deterministic" />
      <Box x={430} y={10} w={250} title="passphrase (optional)" sub="never on-chain · never sent" tone="secret" />
      <Arrow x1={145} y1={44} x2={145} y2={80} label="σ_wallet (64 B)" />
      <Arrow x1={555} y1={44} x2={555} y2={80} />
      <Box x={430} y={82} w={250} title="scrypt(N=2¹⁵, r=8, p=1)" sub="salt = SHA-256(domain/salt/wallet)" tone="secret" />
      <Box x={20} y={82} w={250} title="IKM = σ_wallet ‖ h_pass" sub="h_pass omitted if no passphrase" />
      <Arrow x1={430} y1={99} x2={272} y2={99} label="32 B" />
      <Arrow x1={145} y1={116} x2={145} y2={150} />
      <Box x={20} y={152} w={660} title="HKDF-SHA256(IKM, salt = 'pqc.market/identity/v1', info = 'sk:' | 'pub:' ‖ wallet)" />
      <Arrow x1={180} y1={186} x2={180} y2={216} label="sk.seed" />
      <Arrow x1={520} y1={186} x2={520} y2={216} label="pk.seed" />
      <Box x={20} y={218} w={320} title="256 × WOTS keypairs" sub="sk_i,j = SHA-256(sk.seed ‖ ADRS(3, i, j))" tone="secret" />
      <Box x={360} y={218} w={320} title="Merkle tree, h = 8" sub="leaves ℓ_i = T(pk.seed, pk_i,0 … pk_i,66)" tone="up" />
      <Arrow x1={340} y1={235} x2={358} y2={235} />
      <Arrow x1={520} y1={252} x2={520} y2={282} />
      <Box x={360} y={284} w={150} title="root (32 B)" tone="up" />
      <Box x={530} y={284} w={150} title="pq1… address" sub="b58(H(seed‖root)[:20])" tone="up" />
      <Arrow x1={510} y1={301} x2={528} y2={301} />
      <Box x={20} y={284} w={320} title="mint_i = ed25519(HKDF(sk.seed, 'mint/v1', i))" sub="launch leaf i owns its mint keypair" tone="warn" />
    </svg>
  );
}

/** Launch: browser ↔ server ↔ IPFS/Solana. */
export function LaunchSequence() {
  const lanes = [
    { x: 90, label: "browser" },
    { x: 330, label: "pqc.market API" },
    { x: 530, label: "IPFS (Pinata)" },
    { x: 650, label: "Solana" },
  ];
  const msgs: { from: number; to: number; text: string; tone?: "up" | "warn" }[] = [
    { from: 0, to: 0, text: "mint_i ← HKDF(sk.seed, i); d ← H(launch fields)" },
    { from: 0, to: 0, text: "σ ← WOTS.sign(d, leaf i) + auth path", tone: "up" },
    { from: 0, to: 1, text: "POST /launch/prepare {fields, mint_i, σ}" },
    { from: 1, to: 1, text: "XMSS.verify(d, σ, root) · burn leaf i", tone: "up" },
    { from: 1, to: 2, text: "pin metadata {…, pqc: {root, σ}}" },
    { from: 1, to: 0, text: "v0 tx: create_v2 (+buy) · creator = treasury" },
    { from: 0, to: 0, text: "sign as mint_i, then wallet", tone: "warn" },
    { from: 0, to: 1, text: "POST /launch/submit {signed tx}" },
    { from: 1, to: 3, text: "check payer/mint/program · sendRawTransaction" },
    { from: 3, to: 1, text: "confirmed → status = live" },
  ];
  const top = 40;
  const gap = 30;
  const height = top + msgs.length * gap + 20;
  return (
    <svg viewBox={`0 0 720 ${height}`} className="h-auto w-full min-w-[640px] font-mono">
      <defs>
        <marker id="arr-seq" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M0,0 L6,3 L0,6 z" className="fill-muted" />
        </marker>
      </defs>
      {lanes.map((l) => (
        <g key={l.label}>
          <rect x={l.x - 52} y={4} width={104} height={22} className="fill-surface stroke-line-strong" />
          <text x={l.x} y={19} textAnchor="middle" className="fill-fg text-[10.5px]">
            {l.label}
          </text>
          <line x1={l.x} x2={l.x} y1={26} y2={height - 6} className="stroke-line-strong" strokeDasharray="3 4" />
        </g>
      ))}
      {msgs.map((m, k) => {
        const y = top + k * gap;
        const a = lanes[m.from].x;
        const b = lanes[m.to].x;
        const color = m.tone === "up" ? "fill-up" : m.tone === "warn" ? "fill-warn" : "fill-muted";
        if (m.from === m.to) {
          return (
            <g key={k}>
              <rect x={a - 4} y={y - 5} width={8} height={8} className={m.tone === "up" ? "fill-up" : m.tone === "warn" ? "fill-warn" : "fill-fg/70"} />
              <text x={a + 12} y={y + 3} className={`${color} text-[10px]`}>
                {k + 1}. {m.text}
              </text>
            </g>
          );
        }
        const dir = b > a ? 1 : -1;
        return (
          <g key={k}>
            <line x1={a} x2={b - dir * 4} y1={y} y2={y} className="stroke-muted" markerEnd="url(#arr-seq)" />
            <text x={Math.min(a, b) + 8} y={y - 5} className={`${color} text-[10px]`}>
              {k + 1}. {m.text}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
