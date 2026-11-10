alter table public.song_lyrics_edits
  drop constraint if exists song_lyrics_edits_track_slug_check;

alter table public.song_lyrics_edits
  add constraint song_lyrics_edits_track_slug_format_check
  check (track_slug ~ '^[a-z0-9][a-z0-9-]{0,39}$');

comment on constraint song_lyrics_edits_track_slug_format_check
on public.song_lyrics_edits is
  'Track slugs use the same lowercase hyphenated format as AbleSet lyric track slugs; non-admin writes remain restricted by instrument-specific RLS policies.';