-- pqc.market: post-quantum launchpad schema. Idempotent.

-- A post-quantum identity: an XMSS-style Merkle tree of 2^height WOTS one-time
-- keys, bound to a Solana wallet. Only public material is stored here.
create table if not exists pqc_identities (
  id uuid primary key default gen_random_uuid(),
  wallet text not null unique,
  pq_address text not null unique,          -- hash of (pub_seed || root): the "bunker" address
  root text not null,                       -- hex, Merkle root over WOTS leaf hashes
  pub_seed text not null,                   -- hex, public tweak for every hash call
  height int not null default 8,
  passphrase_hardened boolean not null default false,
  ed_signature text not null,               -- wallet's ed25519 signature over the registration statement
  genesis jsonb not null,                   -- WOTS signature (leaf 0) over the same statement
  anchor_tx text,                           -- Solana memo tx that timestamps the root on-chain
  anchored_at timestamptz,
  created_at timestamptz not null default now()
);

-- Ledger of burned one-time leaves. A WOTS key signs exactly once; the primary
-- key makes reuse impossible at the database level.
create table if not exists pqc_leaves (
  identity_id uuid not null references pqc_identities(id) on delete cascade,
  leaf_index int not null,
  purpose text not null,                    -- genesis | launch | proof
  message_hash text not null,
  ref text,                                 -- mint / proof id
  used_at timestamptz not null default now(),
  primary key (identity_id, leaf_index)
);

create table if not exists pqc_launches (
  mint text primary key,
  name text not null,
  symbol text not null,
  description text,
  image_url text,
  metadata_uri text,
  twitter text,
  telegram text,
  website text,
  creator text not null,
  identity_id uuid references pqc_identities(id),
  pq_address text not null,
  leaf_index int not null,
  message_hash text not null,
  attestation jsonb not null,               -- { wots, authPath } hex
  dev_buy_sol numeric not null default 0,
  status text not null default 'pending',   -- pending | live | failed
  tx_signature text,
  created_at timestamptz not null default now(),
  launched_at timestamptz
);
create index if not exists pqc_launches_status_created on pqc_launches (status, created_at desc);
create index if not exists pqc_launches_creator on pqc_launches (creator);

create table if not exists pqc_challenges (
  id uuid primary key default gen_random_uuid(),
  wallet text not null,
  nonce text not null,
  expires_at timestamptz not null,
  used boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists pqc_proofs (
  id uuid primary key default gen_random_uuid(),
  identity_id uuid not null references pqc_identities(id) on delete cascade,
  wallet text not null,
  pq_address text not null,
  leaf_index int not null,
  challenge_id uuid references pqc_challenges(id),
  message_hash text not null,
  verified boolean not null,
  created_at timestamptz not null default now()
);
create index if not exists pqc_proofs_created on pqc_proofs (created_at desc);

-- RLS: public reads of public material, all writes through the service role.
alter table pqc_identities enable row level security;
alter table pqc_leaves     enable row level security;
alter table pqc_launches   enable row level security;
alter table pqc_challenges enable row level security;
alter table pqc_proofs     enable row level security;

drop policy if exists pqc_identities_read on pqc_identities;
create policy pqc_identities_read on pqc_identities for select to anon, authenticated using (true);

drop policy if exists pqc_leaves_read on pqc_leaves;
create policy pqc_leaves_read on pqc_leaves for select to anon, authenticated using (true);

drop policy if exists pqc_launches_read on pqc_launches;
create policy pqc_launches_read on pqc_launches for select to anon, authenticated using (status = 'live');

drop policy if exists pqc_proofs_read on pqc_proofs;
create policy pqc_proofs_read on pqc_proofs for select to anon, authenticated using (true);
-- pqc_challenges: no anon policy; server only.
