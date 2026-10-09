-- pqc-vault spend intents. Idempotent.
-- A vault's WOTS key may sign exactly one message. The browser records what it
-- signed here BEFORE anything is broadcast, so every later attempt (a retry, a
-- reload, another device) replays the same spend instead of signing a new one.
--
-- `tag` = HMAC(identity-derived key, vault): only the identity owner can compute
-- it, so it doubles as the lookup secret and blocks anyone else from claiming a
-- vault's slot. `mac` authenticates the parameters under the same key.
create table if not exists pqc_vault_spends (
  id uuid primary key default gen_random_uuid(),
  tag text not null unique,
  wallet text not null,
  vault text not null,
  vault_index int not null,
  next_vault text not null,
  next_vault_hash text not null,
  recipient text not null,
  mint text,                                -- null for SOL
  token_program text,
  amount_raw text not null,                 -- base units, decimal string
  digest text not null,
  mac text not null,
  status text not null default 'signed',    -- signed | withdrawn
  write_txs text[] not null default '{}',
  withdraw_tx text,
  cleanup_txs text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists pqc_vault_spends_vault on pqc_vault_spends (vault);

alter table pqc_vault_spends enable row level security;
-- No anon policies: reads and writes go through server routes, keyed by tag.
