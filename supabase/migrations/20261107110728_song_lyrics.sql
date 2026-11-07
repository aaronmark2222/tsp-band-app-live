-- AbleSet lyrics for the Practice page, saved by the admin's Ableton Sync read.
create table public.song_lyrics (
  song_id text primary key references public.songs(id) on update cascade on delete cascade,
  tracks jsonb not null default '[]'::jsonb,
  sections jsonb not null default '[]'::jsonb,
  duration_seconds integer,
  als_modified_at timestamptz,
  updated_at timestamptz not null default now()
);
comment on table public.song_lyrics is 'AbleSet +LYRICS clips per song from the last Ableton Sync read; times are seconds from the song start (matches the practice audio).';
alter table public.song_lyrics enable row level security;
create policy "Linked members read lyrics" on public.song_lyrics for select to authenticated using ((select public.current_member_id()) is not null);
create policy "Admin adds lyrics" on public.song_lyrics for insert to authenticated with check ((select public.is_admin()));
create policy "Admin updates lyrics" on public.song_lyrics for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "Admin removes lyrics" on public.song_lyrics for delete to authenticated using ((select public.is_admin()));
revoke all on public.song_lyrics from anon;
grant select, insert, update, delete on public.song_lyrics to authenticated;
-- Audio length, read in the browser at upload, for the Sync page's length check.
alter table public.practice_tracks add column duration_seconds numeric;
