-- Post-quantum identity-derived wallets and dual-signed transfers. Idempotent.
-- Keys are never stored: only public addresses and attestations.
create table if not exists pqc_wallets (
  id uuid primary key default gen_random_uuid(),
  identity_id uuid not null references pqc_identities(id) on delete cascade,
  index int not null,
  address text not null unique,
  label text,
  status text not null default 'active',   -- active | retired
  proof text not null,                     -- ed25519 signature by the derived key over the wallet statement
  created_at timestamptz not null default now(),
  retired_at timestamptz,
  unique (identity_id, index)
);
create index if not exists pqc_wallets_identity on pqc_wallets (identity_id, index);

create table if not exists pqc_transfers (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null references pqc_wallets(id) on delete cascade,
  from_address text not null,
  to_address text not null,
  mint text not null,                      -- 'SOL' or token mint; 'ALL' for a rotate/sweep
  amount_raw text not null,                -- base units as decimal string; 'ALL' for a sweep
  scheme text not null default 'wots',
  attestation jsonb not null,
  message_hash text not null,
  nonce text not null,
  memo text not null,
  tx_signature text,
  status text not null default 'pending',  -- pending | confirmed | failed
  created_at timestamptz not null default now(),
  confirmed_at timestamptz
);
create index if not exists pqc_transfers_wallet on pqc_transfers (wallet_id, created_at desc);
create index if not exists pqc_transfers_sig on pqc_transfers (tx_signature);

alter table pqc_wallets   enable row level security;
alter table pqc_transfers enable row level security;
-- No anon policies: reads go through server routes keyed by the owning wallet.
