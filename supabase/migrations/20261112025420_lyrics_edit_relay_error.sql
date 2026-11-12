alter table public.song_lyrics_edits
  add column if not exists relay_error text;

comment on column public.song_lyrics_edits.relay_error is
  'Why the Mac relay could not apply this pending edit to Live (bridge error code), or null. Cleared when the edit is applied or saved again. Shown to the editing member in Practice.';
