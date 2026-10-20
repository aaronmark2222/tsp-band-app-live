-- Store a song's full tempo map while preserving legacy start/end tempo columns.
alter table public.songs
  add column if not exists tempo_segments jsonb not null default '[]'::jsonb;

comment on column public.songs.tempo_segments is
  'Ordered tempo points; each point stores bpm and transition_to_next (gradual or instant).';
