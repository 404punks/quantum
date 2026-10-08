-- Admin-only ledger of coins imported (launched elsewhere, attested by the platform identity).
-- Kept out of pqc_launches so nothing public distinguishes imports. Idempotent.
create table if not exists pqc_imports (
  mint text primary key references pqc_launches(mint) on delete cascade,
  imported_at timestamptz not null default now()
);
alter table pqc_imports enable row level security;
-- No policies: service role only.
