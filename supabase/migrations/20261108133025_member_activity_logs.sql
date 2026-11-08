-- Activity logs for later statistics: app sessions (time online), page visits,
-- and practice plays (which songs, how long, how often).
create table public.app_sessions (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  started_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  device text,            -- 'phone' | 'computer'
  standalone boolean,     -- opened from the Home Screen app
  app_version text
);
create index app_sessions_member_started on public.app_sessions (member_id, started_at desc);

create table public.page_visits (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.app_sessions(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  view text not null,     -- songs | setlists | gigs | dashboard | practice | sync
  started_at timestamptz not null default now(),
  ended_at timestamptz not null default now()
);
create index page_visits_member_started on public.page_visits (member_id, started_at desc);
create index page_visits_session on public.page_visits (session_id);

create table public.practice_plays (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references public.app_sessions(id) on delete set null,
  member_id uuid not null references public.members(id) on delete cascade,
  song_id text not null,  -- kept as text so renumbered/deleted songs keep their history
  mode text not null,     -- 'mix' | 'multi'
  started_at timestamptz not null default now(),
  ended_at timestamptz not null default now(),
  seconds_played numeric(8,1) not null default 0,
  start_position numeric(8,1),
  end_position numeric(8,1),
  song_seconds numeric(8,1),
  reached_end boolean not null default false,
  fullscreen boolean not null default false,
  solo jsonb              -- multitrack: which tracks were on/soloed when it started
);
create index practice_plays_member_started on public.practice_plays (member_id, started_at desc);
create index practice_plays_song on public.practice_plays (song_id);

alter table public.app_sessions enable row level security;
alter table public.page_visits enable row level security;
alter table public.practice_plays enable row level security;

-- Members write and read their own rows; the admin reads everything.
create policy "own or admin read" on public.app_sessions for select to authenticated
  using (member_id = (select public.current_member_id()) or (select public.is_admin()));
create policy "own insert" on public.app_sessions for insert to authenticated
  with check (member_id = (select public.current_member_id()));
create policy "own update" on public.app_sessions for update to authenticated
  using (member_id = (select public.current_member_id())) with check (member_id = (select public.current_member_id()));

create policy "own or admin read" on public.page_visits for select to authenticated
  using (member_id = (select public.current_member_id()) or (select public.is_admin()));
create policy "own insert" on public.page_visits for insert to authenticated
  with check (member_id = (select public.current_member_id()));
create policy "own update" on public.page_visits for update to authenticated
  using (member_id = (select public.current_member_id())) with check (member_id = (select public.current_member_id()));

create policy "own or admin read" on public.practice_plays for select to authenticated
  using (member_id = (select public.current_member_id()) or (select public.is_admin()));
create policy "own insert" on public.practice_plays for insert to authenticated
  with check (member_id = (select public.current_member_id()));
create policy "own update" on public.practice_plays for update to authenticated
  using (member_id = (select public.current_member_id())) with check (member_id = (select public.current_member_id()));

-- Ready-made summaries for the admin.
create view public.member_activity_daily with (security_invoker = true) as
select s.member_id, m.name, (s.started_at at time zone 'Asia/Kolkata')::date as day,
       count(*) as sessions,
       round(sum(extract(epoch from (s.last_seen_at - s.started_at))) / 60.0, 1) as minutes_online
from public.app_sessions s join public.members m on m.id = s.member_id
group by 1, 2, 3;

create view public.member_practice_by_song with (security_invoker = true) as
select p.member_id, m.name, p.song_id,
       count(*) filter (where p.seconds_played >= 30) as plays,
       round(sum(p.seconds_played) / 60.0, 1) as minutes_played,
       count(*) filter (where p.reached_end) as played_to_end,
       max(p.started_at) as last_played
from public.practice_plays p join public.members m on m.id = p.member_id
group by 1, 2, 3;
