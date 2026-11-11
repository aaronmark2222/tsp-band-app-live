alter table public.song_lyrics_edits
  add column applied_lines jsonb;

alter table public.song_lyrics_edits
  add constraint song_lyrics_edits_applied_lines_array_check
  check (applied_lines is null or jsonb_typeof(applied_lines) = 'array');

comment on column public.song_lyrics_edits.applied_lines is
  'Last lyric line state successfully applied to Live memory for this pending track edit; the saved song_lyrics baseline remains unchanged until manual save and sync.';
