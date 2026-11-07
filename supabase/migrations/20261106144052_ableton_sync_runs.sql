-- History of TSP Work <-> Ableton sync runs (tools/ableton-sync/tsp_ableton_sync.py).
-- Members can read the history; only the admin (who runs the sync) can add runs.

create table public.ableton_sync_runs (
  id bigint generated always as identity primary key,
  ran_at timestamptz not null default now(),
  ran_by uuid references public.members(id) on delete set null default public.current_member_id(),
  als_path text,
  als_modified_at timestamptz,
  als_size bigint,
  song_count integer,
  task_updates integer not null default 0,
  metadata_updates integer not null default 0,
  warnings jsonb not null default '[]'::jsonb,
  changes jsonb not null default '{}'::jsonb
);

create index ableton_sync_runs_ran_at_idx on public.ableton_sync_runs (ran_at desc);
create index ableton_sync_runs_ran_by_idx on public.ableton_sync_runs (ran_by);

alter table public.ableton_sync_runs enable row level security;

create policy "Linked members read sync runs"
  on public.ableton_sync_runs for select to authenticated
  using ((select public.current_member_id()) is not null);

create policy "Admin records sync runs"
  on public.ableton_sync_runs for insert to authenticated
  with check ((select public.is_admin()));

revoke all on public.ableton_sync_runs from anon;
grant select, insert on public.ableton_sync_runs to authenticated;
