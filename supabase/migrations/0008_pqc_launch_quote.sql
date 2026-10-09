-- Coins paired with a token other than SOL (USDC, tokenized stocks, ...). Idempotent.
alter table pqc_launches add column if not exists quote_mint text;
alter table pqc_launches add column if not exists quote_symbol text;
alter table pqc_launches add column if not exists quote_image text;
