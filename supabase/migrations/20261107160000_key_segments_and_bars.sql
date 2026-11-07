alter table public.songs add column if not exists key_segments jsonb not null default '[]'::jsonb;
comment on column public.songs.key_segments is 'Key changes from the Ableton set: [{key, bar (1 = song start), beat (from song start), t (seconds)}]. Fed by Ableton Sync; keys holds the distinct keys in order.';
alter table public.song_lyrics add column if not exists bars jsonb not null default '[]'::jsonb;
comment on column public.song_lyrics.bars is 'Every bar of the song from the Ableton set: [[seconds_from_song_start, numerator, denominator], ...], for the live bar counter.';
