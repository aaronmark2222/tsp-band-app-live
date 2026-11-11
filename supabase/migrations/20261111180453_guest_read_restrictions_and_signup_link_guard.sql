-- Guests (members.role = 'guest') may read only what the Practice page needs:
-- songs, song_lyrics, song_lyrics_edits, their own members row and the
-- practice track colours. Everything else is for band members (role = 'member').
create or replace function public.is_band_member()
returns boolean
language sql
stable security definer
set search_path to ''
as $$
  select exists (select 1 from public.members where user_id = auth.uid() and role = 'member')
$$;
revoke all on function public.is_band_member() from public, anon;
grant execute on function public.is_band_member() to authenticated, service_role;

alter policy "members read" on public.deadlines using ((select public.is_band_member()));
alter policy "members read" on public.gigs using ((select public.is_band_member()));
alter policy "members read" on public.languages using ((select public.is_band_member()));
alter policy "members read" on public.medley_parts using ((select public.is_band_member()));
alter policy "members read" on public.percussion_instruments using ((select public.is_band_member()));
alter policy "members read" on public.setlist_items using ((select public.is_band_member()));
alter policy "members read" on public.setlists using ((select public.is_band_member()));
alter policy "members read" on public.song_languages using ((select public.is_band_member()));
alter policy "members read" on public.song_percussion using ((select public.is_band_member()));
alter policy "members read" on public.song_tasks using ((select public.is_band_member()));
alter policy "members read" on public.task_status_log using ((select public.is_band_member()));
alter policy "members read" on public.task_types using ((select public.is_band_member()));
alter policy "Linked members read sync runs" on public.ableton_sync_runs using ((select public.is_band_member()));
alter policy "Linked members read audio state" on public.practice_audio_state using ((select public.is_band_member()));
alter policy "Linked members read export log" on public.practice_export_log using ((select public.is_band_member()));
alter policy "Linked members read practice tracks" on public.practice_tracks using ((select public.is_band_member()));
-- A guest sees only their own member row.
alter policy "members read" on public.members
  using ((select public.is_band_member()) or user_id = (select auth.uid()));
-- A guest sees only the practice track colours.
alter policy "Linked members read app meta" on public.app_meta
  using ((select public.is_band_member())
         or ((select public.current_member_id()) is not null and key = 'practice_track_colors'));

-- Accounts are created and linked only by the member-access-admin Edge
-- Function (admin, service role). A new auth user must never be linked to a
-- member just because its email matches member_emails.
create or replace function public.link_member_on_signup()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  return new;
end $$;
revoke all on function public.link_member_on_signup() from public, anon, authenticated;

alter function public.duplicate_setlist(uuid, text) set search_path to 'public';
alter function public.touch_updated_at() set search_path to 'public';
