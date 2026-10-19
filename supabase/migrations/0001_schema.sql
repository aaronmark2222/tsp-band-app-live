-- TSP Band App: core schema
-- Supabase (Postgres 15+). Run migrations in order: 0001 schema, 0002 security, 0003 reference data, 0004 import.

-- ---------------------------------------------------------------- types
create type public.task_status as enum
  ('Incomplete', 'Completed', 'No', 'Corrections', 'Review', 'Draft', 'Recorded');
create type public.backing_track_manual as enum ('Sent to Mix', 'Mixed');
create type public.song_type as enum ('Vox', 'Inst');
create type public.tempo_change as enum ('none', 'ramp', 'jump');
create type public.setlist_item_type as enum ('song', 'break', 'note');

-- ---------------------------------------------------------------- people
create table public.members (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,               -- 'aaron', 'dale', ...
  name        text not null,
  instrument  text not null,                      -- role in the band
  is_admin    boolean not null default false,
  user_id     uuid unique references auth.users (id) on delete set null,
  sort_order  int not null default 0
);

-- Emails live apart from members so ordinary members cannot read each other's.
create table public.member_emails (
  member_id uuid primary key references public.members (id) on delete cascade,
  email     text not null unique
);

-- ---------------------------------------------------------------- languages
-- Song-ID prefixes are built from these codes (E, H, K, T, Ml, Kn, ...).
-- Codes start with one capital and may continue in lowercase, so an ID such
-- as "KnM3" always parses as Kn + M(edley) + 3. "I" (instrumental) and
-- "M" (medley) are reserved and can never be language codes.
create table public.languages (
  code        text primary key
              check (code ~ '^[A-Z][a-z]*$' and code not in ('I', 'M')),
  name        text not null unique,
  short_label text not null,                      -- the sheet's old labels: Eng, Hin, ...
  sort_order  int not null default 0
);

-- ---------------------------------------------------------------- songs
create table public.songs (
  id                    text primary key
                        check (id ~ '^[A-Z][A-Za-z]*[0-9]+$'),   -- I1, E4, EM6, EHKM1 ...
  name                  text not null,
  type                  public.song_type not null,
  is_medley             boolean not null default false,
  keys                  text[] not null default '{}'
                        check (keys <@ array['A','Am','A#','A#m','B','Bm','C','Cm','C#','C#m','D','Dm',
                                             'D#','D#m','E','Em','F','Fm','F#','F#m','G','Gm','G#','G#m']),
  tempo_start           int check (tempo_start > 0),
  tempo_end             int check (tempo_end > 0),
  tempo_change          public.tempo_change not null default 'none',
  duration_seconds      int check (duration_seconds >= 0),
  backing_track_manual  public.backing_track_manual,          -- null = derived (see song_readiness)
  sort_order            int not null default 0,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  check ((tempo_change = 'none') = (tempo_end is null))
);

create table public.song_languages (
  song_id       text not null references public.songs (id) on update cascade on delete cascade,
  language_code text not null references public.languages (code) on update cascade,
  position      int not null default 0,
  primary key (song_id, language_code)
);

-- Constituent songs of a medley (ground-level data).
create table public.medley_parts (
  id               uuid primary key default gen_random_uuid(),
  medley_song_id   text not null references public.songs (id) on update cascade on delete cascade,
  position         int not null,
  name             text not null,
  language_code    text references public.languages (code) on update cascade,
  original_artist  text,
  keys             text[] not null default '{}'
                   check (keys <@ array['A','Am','A#','A#m','B','Bm','C','Cm','C#','C#m','D','Dm',
                                        'D#','D#m','E','Em','F','Fm','F#','F#m','G','Gm','G#','G#m']),
  tempo_start      int check (tempo_start > 0),
  tempo_end        int check (tempo_end > 0),
  tempo_change     public.tempo_change not null default 'none',
  duration_seconds int check (duration_seconds >= 0),
  check ((tempo_change = 'none') = (tempo_end is null)),
  unique (medley_song_id, position) deferrable initially deferred
);

-- ---------------------------------------------------------------- work (tasks)
-- One row per sheet column that tracks progress. New instruments or stems
-- are just new rows here; nothing else in the schema changes.
create table public.task_types (
  key               text primary key,             -- 'bass_part', 'backing_music', ...
  label             text not null,
  category          text not null check (category in ('ableset', 'backing', 'part')),
  owner_member_id   uuid references public.members (id),
  allowed_statuses  public.task_status[] not null,
  done_statuses     public.task_status[] not null default '{Completed}',
  sort_order        int not null default 0
);

create table public.song_tasks (
  song_id     text not null references public.songs (id) on update cascade on delete cascade,
  task_key    text not null references public.task_types (key) on update cascade,
  status      public.task_status not null default 'Incomplete',
  updated_at  timestamptz not null default now(),
  updated_by  uuid references public.members (id),
  primary key (song_id, task_key)
);

-- Every status change is logged: this feeds the gamification phase later.
create table public.task_status_log (
  id          bigint generated always as identity primary key,
  song_id     text not null,
  task_key    text not null,
  old_status  public.task_status,
  new_status  public.task_status not null,
  changed_by  uuid references public.members (id),
  changed_at  timestamptz not null default now()
);
create index on public.task_status_log (changed_by, changed_at);

-- Gautham's per-song instrument list (several allowed per song).
create table public.percussion_instruments (
  name        text primary key,
  sort_order  int not null default 0
);
create table public.song_percussion (
  song_id     text not null references public.songs (id) on update cascade on delete cascade,
  instrument  text not null references public.percussion_instruments (name) on update cascade,
  primary key (song_id, instrument)
);

-- ---------------------------------------------------------------- setlists & gigs
-- A setlist is a simple ordered list (like a note): songs, breaks, free-text lines.
-- Reuse = duplicate_setlist(); every gig points at its own setlist.
create table public.setlists (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  description  text,
  created_by   uuid references public.members (id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table public.setlist_items (
  id             uuid primary key default gen_random_uuid(),
  setlist_id     uuid not null references public.setlists (id) on delete cascade,
  position       int not null,
  item_type      public.setlist_item_type not null default 'song',
  song_id        text references public.songs (id) on update cascade on delete restrict,
  label          text,                              -- break title or note text
  note           text,                              -- per-song note
  break_seconds  int check (break_seconds >= 0),
  check ((item_type = 'song') = (song_id is not null)),
  unique (setlist_id, position) deferrable initially deferred
);

create table public.gigs (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  event_date  date not null,                        -- the major deadline
  start_time  time,
  location    text,
  setlist_id  uuid references public.setlists (id) on delete set null,
  notes       text,
  created_at  timestamptz not null default now()
);

-- Extra deadlines hang off a setlist. song_id / task_key / member_id are optional
-- filters: all null = whole setlist, task_key only = "all Bass parts", etc.
create table public.deadlines (
  id          uuid primary key default gen_random_uuid(),
  setlist_id  uuid not null references public.setlists (id) on delete cascade,
  title       text not null,
  due_date    date not null,
  song_id     text references public.songs (id) on update cascade on delete cascade,
  task_key    text references public.task_types (key) on update cascade on delete cascade,
  member_id   uuid references public.members (id) on delete cascade,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------- helpers
create function public.current_member_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select id from public.members where user_id = auth.uid()
$$;

create function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select is_admin from public.members where user_id = auth.uid()), false)
$$;

create function public.owns_task(p_key text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.task_types
                 where key = p_key and owner_member_id = public.current_member_id())
$$;

-- ---------------------------------------------------------------- triggers
create function public.touch_updated_at() returns trigger
language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

create trigger songs_touch before update on public.songs
  for each row execute function public.touch_updated_at();
create trigger setlists_touch before update on public.setlists
  for each row execute function public.touch_updated_at();

-- New song => one task row per task type. New task type => one row per song.
create function public.create_song_tasks() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.song_tasks (song_id, task_key)
  select new.id, key from public.task_types
  on conflict do nothing;
  return new;
end $$;
create trigger songs_create_tasks after insert on public.songs
  for each row execute function public.create_song_tasks();

create function public.create_task_type_rows() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.song_tasks (song_id, task_key)
  select id, new.key from public.songs
  on conflict do nothing;
  return new;
end $$;
create trigger task_types_create_rows after insert on public.task_types
  for each row execute function public.create_task_type_rows();

-- Guard + audit for status edits.
create function public.song_tasks_before_update() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.song_id <> old.song_id or new.task_key <> old.task_key then
    raise exception 'song_id and task_key cannot be changed';
  end if;
  if not exists (select 1 from public.task_types tt
                 where tt.key = new.task_key and new.status = any (tt.allowed_statuses)) then
    raise exception 'Status % is not allowed for task %', new.status, new.task_key;
  end if;
  if new.status is distinct from old.status then
    new.updated_at = now();
    new.updated_by = public.current_member_id();
    insert into public.task_status_log (song_id, task_key, old_status, new_status, changed_by)
    values (new.song_id, new.task_key, old.status, new.status, new.updated_by);
  end if;
  return new;
end $$;
create trigger song_tasks_guard before update on public.song_tasks
  for each row execute function public.song_tasks_before_update();

-- When someone signs up, link them to the member row with the same email.
create function public.link_member_on_signup() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.members m set user_id = new.id
  from public.member_emails e
  where e.member_id = m.id and lower(e.email) = lower(new.email) and m.user_id is null;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.link_member_on_signup();

-- Copy a setlist (items, order, notes) under a new name, e.g. for another gig.
create function public.duplicate_setlist(p_setlist uuid, p_name text) returns uuid
language plpgsql as $$
declare new_id uuid;
begin
  insert into public.setlists (name, description, created_by)
  select p_name, description, public.current_member_id()
  from public.setlists where id = p_setlist
  returning id into new_id;
  if new_id is null then raise exception 'Setlist not found'; end if;
  insert into public.setlist_items (setlist_id, position, item_type, song_id, label, note, break_seconds)
  select new_id, position, item_type, song_id, label, note, break_seconds
  from public.setlist_items where setlist_id = p_setlist;
  return new_id;
end $$;

-- ---------------------------------------------------------------- views
-- Backing Track and Ready are computed, so they can never drift out of sync.
--   Backing Track: manual 'Sent to Mix' / 'Mixed' wins; otherwise 'Finished' once every
--                  backing task is Completed or No, else 'Not Finished'.
--   Ready:         Backing Track = Mixed AND Ableset Completed AND every part Completed or No.
create view public.song_readiness with (security_invoker = true) as
select
  s.id as song_id,
  coalesce(bool_and(st.status in ('Completed', 'No')) filter (where tt.category = 'backing'), false) as backing_complete,
  coalesce(bool_and(st.status in ('Completed', 'No')) filter (where tt.category = 'part'), false)    as parts_complete,
  coalesce(bool_or(st.status = 'Completed') filter (where tt.category = 'ableset'), false)           as ableset_completed,
  coalesce(s.backing_track_manual::text,
           case when coalesce(bool_and(st.status in ('Completed', 'No')) filter (where tt.category = 'backing'), false)
                then 'Finished' else 'Not Finished' end) as backing_track,
  (s.backing_track_manual = 'Mixed'
   and coalesce(bool_or(st.status = 'Completed') filter (where tt.category = 'ableset'), false)
   and coalesce(bool_and(st.status in ('Completed', 'No')) filter (where tt.category = 'part'), false)) as ready
from public.songs s
join public.song_tasks st on st.song_id = s.id
join public.task_types tt on tt.key = st.task_key
group by s.id, s.backing_track_manual;

create view public.setlist_summary with (security_invoker = true) as
select
  sl.id as setlist_id,
  sl.name,
  count(*) filter (where i.item_type = 'song')                              as song_count,
  coalesce(sum(s.duration_seconds) filter (where i.item_type = 'song'), 0)  as songs_seconds,
  coalesce(sum(i.break_seconds) filter (where i.item_type = 'break'), 0)    as breaks_seconds,
  coalesce(sum(s.duration_seconds) filter (where i.item_type = 'song'), 0)
    + coalesce(sum(i.break_seconds) filter (where i.item_type = 'break'), 0) as total_seconds
from public.setlists sl
left join public.setlist_items i on i.setlist_id = sl.id
left join public.songs s on s.id = i.song_id
group by sl.id, sl.name;

-- Work per setlist, per member: the base of the personalised overview.
--   total     = tasks not marked 'No'
--   done      = status in the task type's done_statuses
--   recorded  = status 'Recorded' (owner finished, waiting for Aaron to process)
--   remaining = total - done - recorded
create view public.setlist_member_progress with (security_invoker = true) as
select
  i.setlist_id,
  tt.owner_member_id as member_id,
  count(*) filter (where st.status <> 'No')                                           as total,
  count(*) filter (where st.status = any (tt.done_statuses))                          as done,
  count(*) filter (where st.status = 'Recorded' and not st.status = any (tt.done_statuses)) as recorded,
  count(*) filter (where st.status <> 'No' and not st.status = any (tt.done_statuses)
                         and st.status <> 'Recorded')                                 as remaining
from public.setlist_items i
join public.song_tasks st on st.song_id = i.song_id
join public.task_types tt on tt.key = st.task_key
where i.item_type = 'song'
group by i.setlist_id, tt.owner_member_id;

-- All dates that matter for a setlist: the gig date (major) plus its own deadlines.
create view public.setlist_deadline_list with (security_invoker = true) as
select g.setlist_id, 'gig'::text as kind, g.name as title, g.event_date as due_date,
       null::text as song_id, null::text as task_key, null::uuid as member_id
from public.gigs g where g.setlist_id is not null
union all
select d.setlist_id, 'deadline', d.title, d.due_date, d.song_id, d.task_key, d.member_id
from public.deadlines d;
