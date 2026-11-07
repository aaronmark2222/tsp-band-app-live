alter table public.song_lyrics add column if not exists tempo jsonb not null default '[]'::jsonb;
comment on column public.song_lyrics.tempo is 'Tempo map as [[seconds_from_song_start, bpm], ...] from the Ableton set, for the live tempo readout on the Practice page.';
