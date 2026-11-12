alter table public.song_lyrics_edits
  add column if not exists relay_conflicts jsonb;

alter table public.song_lyrics_edits
  drop constraint if exists song_lyrics_edits_relay_conflicts_array_check;
alter table public.song_lyrics_edits
  add constraint song_lyrics_edits_relay_conflicts_array_check
  check (relay_conflicts is null or jsonb_typeof(relay_conflicts) = 'array');

comment on column public.song_lyrics_edits.relay_conflicts is
  'Clips where the queued Practice text and a hand edit in Live disagree (line, t, base_text, practice_text, live_text), as reported by TSPWork 1.30. Reviewed on the Ableton Sync page under Lyric update mismatches; null when there are none.';
