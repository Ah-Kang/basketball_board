-- Apply to an existing basketball project before deployment.
-- The application authenticates invited users; database access remains server-only.
begin;
alter table public.events enable row level security;
drop policy if exists "Events are publicly readable" on public.events;
revoke all on table public.events from anon, authenticated;
commit;
