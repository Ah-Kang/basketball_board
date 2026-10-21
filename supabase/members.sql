-- Member identity is stable across email changes; private by default.
begin;
create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  nickname text not null default '' check (char_length(nickname) <= 24),
  region text not null default '' check (char_length(region) <= 60),
  position text not null default '' check (position in ('', 'guard', 'forward', 'center', 'any')),
  skill text not null default '' check (skill in ('', 'beginner', 'intermediate', 'advanced')),
  bio text not null default '' check (char_length(bio) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.member_activities (
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  event_id text not null,
  status text not null check (status in ('interested', 'applied', 'attended', 'cancelled')),
  event_snapshot jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, event_id)
);
create index if not exists member_activities_recent_idx on public.member_activities(user_id, updated_at desc);
alter table public.profiles enable row level security;
alter table public.member_activities enable row level security;
revoke all on public.profiles, public.member_activities from anon, authenticated;
commit;
