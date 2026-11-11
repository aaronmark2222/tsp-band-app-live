-- The history tables are not writable by members under RLS (by design), so the
-- renumbering inside delete_song_and_shift_ids must run with the function
-- owner's rights. The function still refuses anyone who is not an admin.
alter function public.delete_song_and_shift_ids(text) security definer;
revoke all on function public.delete_song_and_shift_ids(text) from public, anon;
grant execute on function public.delete_song_and_shift_ids(text) to authenticated, service_role;
