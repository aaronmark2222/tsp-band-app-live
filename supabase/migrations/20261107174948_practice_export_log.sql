create table if not exists public.practice_export_log (
  id bigint generated always as identity primary key,
  song_id text not null,
  state text not null,
  files integer not null default 0,
  export_seconds numeric not null,
  song_seconds integer,
  file_seconds jsonb not null default '[]'::jsonb,
  started_at timestamptz not null,
  finished_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (song_id, started_at)
);
comment on table public.practice_export_log is 'One row per song rendered by the TSPWork practice-audio export: how long it took (export_seconds, per-file seconds), for time-left estimates.';
alter table public.practice_export_log enable row level security;
create policy "Linked members read export log" on public.practice_export_log for select to authenticated
  using ((select public.current_member_id()) is not null);
create policy "Admin adds export log" on public.practice_export_log for insert to authenticated
  with check ((select public.is_admin()));
