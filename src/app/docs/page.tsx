import type { ReactNode } from "react";
import { anchorMemo, derivationMessage, registrationStatement } from "@/lib/pq/messages";
import { AdrsDiagram, ChainDiagram, DerivationDiagram, Figure, LaunchSequence, TreeDiagram } from "@/components/docs/diagrams";
import { Toc, type TocItem } from "@/components/docs/toc";
import { ButtonLink } from "@/components/ui";

const TOC: TocItem[] = [
  { id: "overview", label: "Overview" },
  { id: "threat-model", label: "Threat model" },
  { id: "primitives", label: "Primitives" },
  { id: "tweakable-hash", label: "Tweakable hash", sub: true },
  { id: "wots", label: "WOTS one-time signatures" },
  { id: "wots-encoding", label: "Message encoding", sub: true },
  { id: "wots-sign-verify", label: "Sign & verify", sub: true },
  { id: "merkle", label: "Merkle identities" },
  { id: "derivation", label: "Key derivation" },
  { id: "registration", label: "Registration" },
  { id: "anchoring", label: "On-chain anchor" },
  { id: "launch", label: "Launch attestation" },
  { id: "launch-metadata", label: "Metadata extension", sub: true },
  { id: "fees", label: "Creator fees", sub: true },
  { id: "schemes", label: "Signature schemes" },
  { id: "proofs", label: "Proof of possession" },
  { id: "wallets", label: "Wallets" },
  { id: "security", label: "Security analysis" },
  { id: "parameters", label: "Parameters" },
  { id: "verify-yourself", label: "Verify it yourself" },
];

const EXAMPLE_WALLET = "7xKX…AsU";
const EXAMPLE_ROOT = "3f9a1c…e07b";
const EXAMPLE_SEED = "b41d02…9c55";
const EXAMPLE_PQ = "pq1Hn3…W8k";

export default function Page() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <div className="grid gap-12 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="hidden lg:block">
          <div className="sticky top-24">
            <Toc items={TOC} />
          </div>
        </aside>

        <article className="min-w-0 max-w-3xl">
          <div className="font-mono text-[11.5px] text-dim">docs / protocol v1</div>
          <h1 className="mt-3 font-serif text-[36px] font-bold leading-tight tracking-tight sm:text-[44px]">How pqc.market works</h1>
          <p className="mt-4 text-[15px] leading-relaxed text-muted">
            A specification of the hash-based identity, attestation and proof protocol behind every launch. Everything below is
            implemented in <Code>src/lib/pq</Code> and runs identically in the browser and on the server.
          </p>

          <Section id="overview" title="Overview">
            <P>
              Each user holds a <B>post-quantum identity</B>: an XMSS-style Merkle tree over 256 Winternitz one-time signature
              (WOTS) keys, deterministically derived from a Solana wallet signature. The tree root is the public key; a hash of the
              root is the user&apos;s <Code>pq1…</Code> address.
            </P>
            <P>
              Every launch consumes one leaf. That leaf signs a digest of the coin&apos;s identity (mint, creator, name, ticker,
              image) and also owns the mint keypair. The signature is pinned into the coin&apos;s IPFS metadata, so anyone can
              check provenance with nothing but SHA-256, after any elliptic-curve break.
            </P>
          </Section>

          <Section id="threat-model" title="Threat model">
            <P>
              We assume an adversary who can eventually forge ed25519 signatures, either via a cryptographically relevant quantum
              computer (Shor&apos;s algorithm) or via an unexpected classical advance against elliptic-curve discrete log. On
              Solana this is total: an account address <Em>is</Em> its ed25519 public key, so unlike a never-spent Bitcoin address
              there is no hash shield.
            </P>
            <Table
              head={["Asset", "Pre-break", "Post-break"]}
              rows={[
                ["SOL / tokens in ed25519 accounts", "safe", "exposed (needs on-chain PQ vault)"],
                ["Coin provenance (who launched it)", "wallet signature", "WOTS attestation + anchor"],
                ["Login / account ownership", "wallet signature", "WOTS challenge-response"],
                ["PQ identity (hardened)", "safe", "safe, given passphrase entropy"],
                ["PQ identity (wallet-only)", "safe", "re-derivable by the attacker"],
              ]}
            />
          </Section>

          <Section id="primitives" title="Primitives">
            <P>
              Every hash in the protocol is SHA-256 with n = 32 bytes. Security reduces to second-preimage resistance of SHA-256;
              Grover&apos;s algorithm lowers this to roughly 2<sup>128</sup> quantum work, which remains out of reach.
            </P>
            <Sub id="tweakable-hash" title="Tweakable hash">
              <P>
                Following SPHINCS<sup>+</sup>, each call is domain-separated by a public seed and a 32-byte address <Code>ADRS</Code>
                that pins it to exactly one position in the structure. This prevents multi-target attacks: an adversary cannot
                amortise a preimage search across many chains or users.
              </P>
              <Formula>F(pk.seed, ADRS, x) = SHA-256(pk.seed ‖ ADRS ‖ x)</Formula>
              <Figure caption="fig. 1 · ADRS layout">
                <AdrsDiagram />
              </Figure>
            </Sub>
          </Section>

          <Section id="wots" title="WOTS one-time signatures">
            <P>
              Winternitz parameter <Em>w</Em> = 16 trades signature size against hashing: each 4-bit digit of the message selects a
              position on a hash chain of length 15.
            </P>
            <Table
              head={["Symbol", "Value", "Meaning"]}
              rows={[
                ["n", "32", "hash output, bytes"],
                ["w", "16", "chain length + 1"],
                ["len₁", "64", "⌈8n / log₂ w⌉ message digits"],
                ["len₂", "3", "⌊log₂(len₁(w−1)) / log₂ w⌋ + 1 checksum digits"],
                ["len", "67", "chains per key"],
              ]}
            />
            <Sub id="wots-encoding" title="Message encoding">
              <P>
                The 32-byte digest is split into 64 nibbles d₀…d₆₃. A checksum over the &quot;remaining distance&quot; of every
                chain is appended as three more base-16 digits:
              </P>
              <Formula>C = Σᵢ (15 − dᵢ) ≤ 960 &lt; 16³ → d₆₄, d₆₅, d₆₆</Formula>
              <P>
                The checksum is what makes the scheme unforgeable: to change a message digit upward (which needs only extra hashing
                from a public σᵢ), a forger necessarily lowers C, and inverting a checksum chain requires a SHA-256 preimage.
              </P>
            </Sub>
            <Sub id="wots-sign-verify" title="Sign & verify">
              <Formula>
                skᵢ = SHA-256(sk.seed ‖ ADRS(3, leaf, i)) · pkᵢ = F<sup>15</sup>(skᵢ)
                <br />
                σᵢ = F<sup>dᵢ</sup>(skᵢ) · verify: F<sup>15−dᵢ</sup>(σᵢ) ≟ pkᵢ
              </Formula>
              <Figure caption="fig. 2 · three of 67 chains. The signer reveals the yellow element; the verifier finishes each chain.">
                <ChainDiagram />
              </Figure>
              <P>
                Signing costs Σdᵢ hashes, verification Σ(15−dᵢ); together exactly 67 × 15 = 1,005. Because σ reveals intermediate
                chain values, <B>a key that signs two different messages leaks enough to forge a third</B>. Leaf reuse is therefore
                refused at the database level (see <a href="#proofs" className="cursor-pointer text-fg underline underline-offset-2">leaf ledger</a>).
              </P>
            </Sub>
          </Section>

          <Section id="merkle" title="Merkle identities">
            <P>
              The 67 chain ends of leaf i compress to one node, and 256 such leaves form a binary tree of height 8. The root, together
              with <Code>pk.seed</Code>, is the identity&apos;s 64-byte public key.
            </P>
            <Formula>
              ℓᵢ = SHA-256(pk.seed ‖ ADRS(1, i) ‖ pkᵢ,₀ ‖ … ‖ pkᵢ,₆₆)
              <br />
              n<sub>h,j</sub> = SHA-256(pk.seed ‖ ADRS(2, h, j) ‖ n<sub>h−1,2j</sub> ‖ n<sub>h−1,2j+1</sub>)
            </Formula>
            <Figure caption="fig. 3 · auth path for leaf 5 in a height-3 tree. Green: recomputed by the verifier. Yellow: carried in the signature.">
              <TreeDiagram />
            </Figure>
            <P>
              A full signature is <Code>(leaf, σ, a₀…a₇)</Code>: 4 + 67·32 + 8·32 = <B>2,404 bytes</B>. Verification recomputes the leaf
              from σ and climbs 8 levels; it is valid iff the result equals the registered root.
            </P>
          </Section>

          <Section id="derivation" title="Key derivation">
            <P>
              No new seed phrase. The wallet signs a fixed message; RFC 8032 ed25519 signatures are deterministic, so the same wallet
              always produces the same 64 bytes. An optional passphrase is stretched with scrypt and mixed in, contributing entropy the
              curve never sees.
            </P>
            <Figure caption="fig. 4 · derivation pipeline. Red boxes are secret and never leave the browser.">
              <DerivationDiagram />
            </Figure>
            <CodeBlock title="M_derive (exact bytes signed)">{derivationMessage(EXAMPLE_WALLET)}</CodeBlock>
            <P>
              Tree generation is 256 × 1,072 ≈ 274k SHA-256 calls and completes in about half a second in a modern browser. Secrets
              live only in memory for the tab&apos;s lifetime.
            </P>
          </Section>

          <Section id="registration" title="Registration">
            <P>
              Registration binds the wallet and the root in both directions. One statement is signed twice: by the wallet (ed25519)
              and by leaf 0 (WOTS). The server verifies both before storing the public key; leaf 0 is burned as the genesis signature.
            </P>
            <CodeBlock title="registration statement">
              {registrationStatement({ wallet: EXAMPLE_WALLET, pqAddress: EXAMPLE_PQ, root: EXAMPLE_ROOT, pubSeed: EXAMPLE_SEED, height: 8 })}
            </CodeBlock>
          </Section>

          <Section id="anchoring" title="On-chain anchor">
            <P>
              A registration in our database is only as trustworthy as our database. The anchor writes the root to Solana in an SPL
              Memo signed by the wallet, producing a public timestamp from the era when ed25519 signatures were still unforgeable. After
              a break, any claim about who owns a root can be checked against the earliest anchor.
            </P>
            <CodeBlock title="memo">{anchorMemo(EXAMPLE_PQ, EXAMPLE_ROOT)}</CodeBlock>
          </Section>

          <Section id="launch" title="Launch attestation">
            <P>
              Leaf i signs a domain-separated digest over the coin&apos;s public fields, sorted by key. The same leaf deterministically owns
              the mint keypair, so the mint address itself is a commitment to the identity.
            </P>
            <Formula>d = SHA-256(&quot;pqc.market/launch/v1\n&quot; ‖ creator ‖ image ‖ leaf ‖ mint ‖ name ‖ symbol)</Formula>
            <Figure caption="fig. 5 · launch sequence. The server never holds the mint key or any WOTS secret.">
              <LaunchSequence />
            </Figure>
            <P>
              The create (+ optional dev buy) is a single v0 transaction compiled against pump.fun&apos;s address lookup table; without
              the ALT the ~40 accounts exceed Solana&apos;s 1,232-byte packet limit. Before broadcasting, the server checks the fee
              payer, the mint and that the pump program is invoked, so it can never be used to relay an arbitrary transaction.
            </P>
            <Sub id="launch-metadata" title="Metadata extension">
              <P>The pinned JSON carries the full attestation, so verification needs neither our API nor our database:</P>
              <CodeBlock title="metadata.json">{`{
  "name": "…", "symbol": "…", "image": "ipfs://…",
  "website": "https://pqc.market/coin/<mint>",
  "pqc": {
    "version": 1,
    "scheme": "WOTS(w=16,SHA-256)+Merkle(h=8)",
    "pqAddress": "pq1…", "root": "…", "pubSeed": "…", "height": 8,
    "messageHash": "…",
    "signature": { "leaf": 4, "wots": "<4288 hex>", "auth": ["…" ×8] }
  }
}`}</CodeBlock>
            </Sub>
            <Sub id="fees" title="Creator fees">
              <P>
                pump.fun fixes a coin&apos;s fee recipient at mint time via the <Code>creator</Code> field of <Code>create_v2</Code>. Every
                pqc.market coin sets it to the platform treasury; the launching wallet is the signer and fee payer, and is recorded
                as the creator in the attestation.
              </P>
            </Sub>
          </Section>

          <Section id="schemes" title="Signature schemes">
            <P>
              Creators choose how a launch is signed. WOTS + Merkle is the identity&apos;s root of trust and burns one leaf per launch.
              The three NIST schemes are many-time keys derived from the same identity seed; each is <B>certified once</B> by a
              WOTS leaf signing a binding digest, after which it signs any number of launches.
            </P>
            <Table
              head={["Scheme", "Standard", "Assumption", "Signature", "Public key"]}
              rows={[
                ["WOTS + Merkle", "RFC 8391 style", "SHA-256 second preimage", "2,404 B", "64 B"],
                ["ML-DSA-65 (Dilithium)", "FIPS 204", "Module-LWE / SIS lattices", "3,309 B", "1,952 B"],
                ["SLH-DSA-SHA2-128s (SPHINCS+)", "FIPS 205", "SHA-256 (stateless)", "7,856 B", "32 B"],
                ["Falcon-512 (FN-DSA)", "FIPS 206 draft", "NTRU lattices", "≤ 666 B", "897 B"],
                ["ML-DSA-87 (Dilithium5)", "FIPS 204, level 5", "Module-LWE / SIS lattices", "4,627 B", "2,592 B"],
                ["SLH-DSA-SHAKE-128f (SPHINCS+)", "FIPS 205", "SHA-3 / SHAKE256 (stateless)", "17,088 B", "32 B"],
                ["Falcon-1024 (FN-DSA)", "FIPS 206 draft, level 5", "NTRU lattices", "≤ 1,280 B", "1,793 B"],
                ["ed25519 + ML-DSA-65 (hybrid)", "IETF composite draft", "either curve or lattice must hold", "3,373 B", "1,984 B"],
              ]}
            />
            <Formula>
              sk<sub>s</sub> = keygen<sub>s</sub>(HKDF(sk.seed, &quot;pqc.market/scheme/v1&quot;, s))
              <br />
              cert<sub>s</sub> = WOTS.sign(H(&quot;bind&quot; ‖ pq-address ‖ s ‖ H(pk<sub>s</sub>)), leaf)
              <br />
              d = H(&quot;launch&quot; ‖ creator ‖ image ‖ mint ‖ name ‖ <B>scheme</B> ‖ symbol)
            </Formula>
            <P>
              The hybrid is a composite signature: a single seed expands (SHAKE256) into an ed25519 key and an ML-DSA-65 key, and a
              signature is both signatures concatenated. It verifies only if <B>both</B> verify, so it is secure as long as either
              assumption survives. SLH-DSA-SHAKE swaps the SHA-2 family for SHA-3, so the two SPHINCS+ options rest on different hash
              designs.
            </P>
            <P>
              A scheme attestation carries its signature, the scheme public key and the WOTS certificate, so verification needs only
              the identity root: check the certificate against the root, then the signature against the certified key. The digest
              commits to the scheme id, so a signature can never be replayed under a different scheme. Implementations are
              <Code>@noble/post-quantum</Code>, audited and dependency-free.
            </P>
          </Section>

          <Section id="proofs" title="Proof of possession">
            <P>
              A challenge-response login that never consults ed25519. The server issues a 32-byte nonce valid for five minutes; the
              client signs <Code>SHA-256(&quot;pqc.market/proof/v1\n&quot; ‖ leaf ‖ nonce ‖ wallet)</Code> with its next unused leaf.
            </P>
            <Table
              head={["Check", "Failure"]}
              rows={[
                ["challenge exists, matches wallet, unused, unexpired", "404 / 409 / 410"],
                ["XMSS.verify(digest, σ, registered root)", "verified: false"],
                ["INSERT (identity, leaf) into leaf ledger", "409 leaf already used"],
              ]}
            />
            <P>
              The leaf ledger&apos;s primary key <Code>(identity_id, leaf_index)</Code> makes one-time use a database invariant; the
              challenge is consumed even on failure, so a nonce cannot be retried.
            </P>
          </Section>

          <Section id="wallets" title="Wallets">
            <P>
              A pqc.market wallet is an ed25519 keypair derived from the identity seed (<Code>HKDF(sk.seed, &quot;pqc.market/wallet/v1&quot;, index)</Code>),
              re-derived in the browser after unlock and never stored. Registration is a statement signed by the derived key itself, so the
              server only ever holds public addresses.
            </P>
            <P>
              Every transfer is <B>dual-signed</B>: the derived key signs the Solana transaction (what the chain enforces), and a post-quantum
              key signs a transfer digest whose hash rides along in an SPL memo. Rotating a wallet sweeps everything to a freshly derived
              address and retires the old one.
            </P>
            <Formula>d = SHA-256(&quot;pqc.market/transfer/v1
&quot; ‖ amount ‖ from ‖ mint ‖ nonce ‖ to ‖ leaf | scheme)</Formula>
            <P>
              <B>Be clear about the boundary.</B> Solana still enforces only the ed25519 signature on-chain. The post-quantum half is a
              quantum-proof <Em>record of authorization</Em>: after a curve break it lets an owner prove which transfers they signed and which
              were forged, but it does not stop a forged transfer from executing. Holding value under hash-based keys needs an on-chain
              verifier program, a Winternitz vault whose spends require a WOTS signature checked by the program. That is the next step on the
              roadmap and the reason these wallets are labelled identity-derived rather than quantum-secured.
            </P>
          </Section>

          <Section id="security" title="Security analysis">
            <List
              items={[
                ["Forgery", "Reduces to SHA-256 second-preimage resistance under the tweakable-hash model; ~2¹²⁸ quantum work."],
                ["Key reuse", "Prevented server-side by the leaf ledger. A malicious server could accept reuse; clients should never sign twice with one leaf, and the UI always fetches the next free index."],
                ["Wallet compromise", "Wallet-only identities are re-derivable by anyone holding the wallet key, including a post-break attacker. Hardened identities additionally require the passphrase."],
                ["Server compromise", "Cannot forge attestations (no secrets held). Can censor or lie about registrations, which is why the on-chain anchor and IPFS copy exist."],
                ["Capacity", "256 signatures per identity. Rotation to a fresh tree signed by the old tree's next leaf is on the roadmap."],
              ]}
            />
          </Section>

          <Section id="parameters" title="Parameters">
            <Table
              head={["Item", "Value"]}
              rows={[
                ["Hash", "SHA-256"],
                ["WOTS", "w = 16, 67 chains, 2,144 B"],
                ["Tree", "height 8, 256 leaves"],
                ["Signature", "2,404 B"],
                ["Public key", "root ‖ pk.seed, 64 B"],
                ["Address", "pq1 ‖ base58(SHA-256(dom ‖ pk.seed ‖ root)[0..20])"],
                ["Passphrase KDF", "scrypt N = 2¹⁵, r = 8, p = 1"],
                ["Seed KDF", "HKDF-SHA256"],
                ["Mint KDF", "HKDF-SHA256(sk.seed, 'pqc.market/mint/v1', u32be(leaf))"],
              ]}
            />
          </Section>

          <Section id="verify-yourself" title="Verify it yourself">
            <P>Every coin page has a Verify button that runs this in your browser. The equivalent in code:</P>
            <CodeBlock title="verify.ts">{`import { launchDigest } from "@/lib/pq/messages";
import { verify } from "@/lib/pq/xmss";

const meta = await fetch(metadataUri).then((r) => r.json());
const d = launchDigest({
  mint, creator, name: meta.name, symbol: meta.symbol,
  image: meta.image, leaf: meta.pqc.signature.leaf,
});
const { valid, computedRoot } = verify(d, meta.pqc.signature, {
  root: meta.pqc.root, pubSeed: meta.pqc.pubSeed, height: meta.pqc.height,
});`}</CodeBlock>
            <div className="mt-8 flex flex-wrap gap-2">
              <ButtonLink href="/identity" variant="primary">Create your identity</ButtonLink>
              <ButtonLink href="/prove">Open the verifier</ButtonLink>
            </div>
          </Section>
        </article>
      </div>
    </div>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="mt-16 scroll-mt-24">
      <h2 className="flex items-baseline gap-3 font-serif text-[24px] font-bold">
        <a href={`#${id}`} className="cursor-pointer font-mono text-[13px] font-normal text-dim hover:text-up">#</a>
        {title}
      </h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Sub({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <div id={id} className="mt-10 scroll-mt-24">
      <h3 className="text-[16px] font-semibold">{title}</h3>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function P({ children }: { children: ReactNode }) {
  return <p className="mt-4 text-[14.5px] leading-[1.75] text-muted first:mt-0">{children}</p>;
}

function B({ children }: { children: ReactNode }) {
  return <strong className="font-semibold text-fg">{children}</strong>;
}

function Em({ children }: { children: ReactNode }) {
  return <em className="text-fg">{children}</em>;
}

function Code({ children }: { children: ReactNode }) {
  return <code className="border border-line bg-surface px-1.5 py-[1px] font-mono text-[12.5px] text-fg">{children}</code>;
}

function Formula({ children }: { children: ReactNode }) {
  return (
    <div className="my-5 overflow-x-auto border-l-2 border-up bg-surface px-5 py-3.5 font-serif text-[16px] italic leading-loose text-fg [&_sub]:text-[0.7em] [&_sup]:text-[0.7em]">
      {children}
    </div>
  );
}

function CodeBlock({ title, children }: { title: string; children: string }) {
  return (
    <div className="my-5 border border-line-strong bg-[#0b0a0a]">
      <div className="border-b border-line-strong px-3 py-1.5 font-mono text-[11px] text-dim">{title}</div>
      <pre className="overflow-x-auto p-4 font-mono text-[12px] leading-relaxed text-muted">{children}</pre>
    </div>
  );
}

function Table({ head, rows }: { head: string[]; rows: string[][] }) {
  return (
    <div className="my-5 overflow-x-auto border border-line">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-b border-line bg-surface text-left font-mono text-[11px] uppercase tracking-wide text-dim">
            {head.map((h) => (
              <th key={h} className="px-4 py-2.5 font-medium">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-line last:border-0">
              {r.map((c, j) => (
                <td key={j} className={j === 0 ? "px-4 py-2.5 text-fg" : "px-4 py-2.5 font-mono text-[12px] text-muted"}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function List({ items }: { items: [string, string][] }) {
  return (
    <dl className="my-5 divide-y divide-line border border-line">
      {items.map(([k, v]) => (
        <div key={k} className="grid gap-1 px-4 py-3 sm:grid-cols-[160px_1fr] sm:gap-4">
          <dt className="font-mono text-[12px] text-fg">{k}</dt>
          <dd className="text-[13.5px] leading-relaxed text-muted">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
