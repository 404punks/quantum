-- Multi-scheme attestations (ML-DSA / SLH-DSA / Falcon) certified by the WOTS root. Idempotent.
alter table pqc_launches add column if not exists scheme text not null default 'wots';
alter table pqc_launches alter column leaf_index drop not null;

-- One certified public key per identity per scheme. The binding is a WOTS
-- signature (one burned leaf) over the scheme's binding digest.
create table if not exists pqc_scheme_keys (
  identity_id uuid not null references pqc_identities(id) on delete cascade,
  scheme text not null,
  public_key text not null,
  binding jsonb not null,
  created_at timestamptz not null default now(),
  primary key (identity_id, scheme)
);
alter table pqc_scheme_keys enable row level security;
drop policy if exists pqc_scheme_keys_read on pqc_scheme_keys;
create policy pqc_scheme_keys_read on pqc_scheme_keys for select to anon, authenticated using (true);
