-- Stream pqc_launches changes to the explore grid. Idempotent.
-- Realtime respects RLS: anon only receives rows where status = 'live',
-- so a launch appears the moment submit flips it from pending to live.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'pqc_launches'
  ) then
    alter publication supabase_realtime add table public.pqc_launches;
  end if;
end $$;

select tablename from pg_publication_tables where pubname = 'supabase_realtime' and tablename like 'pqc_%';
