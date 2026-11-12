alter table public.song_lyrics_edits
  add column if not exists applied_at timestamptz;

update public.song_lyrics_edits set applied_at = updated_at
where applied_lines is not null and applied_at is null;

comment on column public.song_lyrics_edits.applied_at is
  'When the Mac relay last put this edit into Live memory (set together with applied_lines). Lets other devices notice the change with a small query.';
