-- Quantum launches: the dev buy is delivered straight into the creator's pqc-vault. Idempotent.
alter table pqc_launches add column if not exists dev_vault text;
