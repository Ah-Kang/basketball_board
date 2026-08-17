create table if not exists public.events (
  id text primary key,
  title text not null,
  type text not null default 'pickup',
  date date not null,
  start_time text not null default '00:00',
  end_time text not null default '00:00',
  area text not null default '미정',
  venue text not null default '장소 미정',
  fee integer not null default 0,
  spots integer not null default 0,
  status text not null default 'open',
  level text not null default '무관',
  source_cafe text not null default '카페',
  source_board_key text,
  source_url text not null,
  summary text,
  body_text text,
  contact jsonb,
  collected_by_user_id text not null default 'default',
  access_mode text not null default 'authenticated',
  collected_at timestamptz not null default now(),
  raw jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists events_date_start_time_idx on public.events (date, start_time);
create index if not exists events_source_board_key_idx on public.events (source_board_key);
create index if not exists events_status_idx on public.events (status);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_events_updated_at on public.events;
create trigger set_events_updated_at
before update on public.events
for each row
execute function public.set_updated_at();

alter table public.events enable row level security;

drop policy if exists "Events are publicly readable" on public.events;
create policy "Events are publicly readable"
on public.events
for select
to anon, authenticated
using (true);
