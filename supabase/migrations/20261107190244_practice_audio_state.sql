create table if not exists public.practice_audio_state (
  song_id text not null,
  element text not null,
  fingerprint text not null,
  exported_at timestamptz not null default now(),
  als_modified_at timestamptz,
  primary key (song_id, element)
);
comment on table public.practice_audio_state is 'For each uploaded practice-audio file: the fingerprint of its Ableton tracks (alsreader audio_fp) when it was exported. A later Ableton Sync read with a different fingerprint means the upload is out of date (yellow in the export checklist).';
alter table public.practice_audio_state enable row level security;
create policy "Linked members read audio state" on public.practice_audio_state for select to authenticated
  using ((select public.current_member_id()) is not null);
create policy "Admin adds audio state" on public.practice_audio_state for insert to authenticated
  with check ((select public.is_admin()));
create policy "Admin updates audio state" on public.practice_audio_state for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "Admin removes audio state" on public.practice_audio_state for delete to authenticated
  using ((select public.is_admin()));
