-- Ableton Sync "Snooze": hide a proposed task update until the clips on that
-- song's Ableton track change. fingerprint = hash of those clips when snoozed.
-- Admin only (the admin runs the sync).

create table public.ableton_sync_snoozes (
  song_id text not null,
  task_key text not null,
  fingerprint text not null,
  snoozed_at timestamptz not null default now(),
  snoozed_by uuid references public.members(id) on delete set null default public.current_member_id(),
  primary key (song_id, task_key)
);

create index ableton_sync_snoozes_snoozed_by_idx on public.ableton_sync_snoozes (snoozed_by);

alter table public.ableton_sync_snoozes enable row level security;

create policy "Admin reads snoozes"
  on public.ableton_sync_snoozes for select to authenticated
  using ((select public.is_admin()));

create policy "Admin adds snoozes"
  on public.ableton_sync_snoozes for insert to authenticated
  with check ((select public.is_admin()));

create policy "Admin updates snoozes"
  on public.ableton_sync_snoozes for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "Admin removes snoozes"
  on public.ableton_sync_snoozes for delete to authenticated
  using ((select public.is_admin()));

revoke all on public.ableton_sync_snoozes from anon;
grant select, insert, update, delete on public.ableton_sync_snoozes to authenticated;
