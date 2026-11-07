alter table public.song_lyrics add column if not exists tone jsonb not null default '[]'::jsonb;
comment on column public.song_lyrics.tone is 'Guitar tone changes from the GUITAR TONE Midi track: [{t seconds, bar, n note, v velocity, d seconds}], sent as MIDI from the Practice page.';
