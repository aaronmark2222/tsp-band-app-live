-- Practice audio (Practice page). The MP3s live in Cloudflare R2 bucket
-- tsp-practice under songs/<song_id>/<element>.mp3; this table lists them.
-- Members read; only the admin adds/replaces/removes (via the app's upload).

create table public.practice_tracks (
  id bigint generated always as identity primary key,
  song_id text not null references public.songs(id) on update cascade on delete cascade,
  element text not null,                -- e.g. 'Part - Guitar', 'Stem - Bass', 'Backing', 'CPC', 'Mixdown'
  object_key text not null unique,
  bytes bigint,
  uploaded_at timestamptz not null default now(),
  uploaded_by uuid references public.members(id) on delete set null default public.current_member_id(),
  unique (song_id, element)
);

create index practice_tracks_uploaded_by_idx on public.practice_tracks (uploaded_by);

alter table public.practice_tracks enable row level security;

create policy "Linked members read practice tracks"
  on public.practice_tracks for select to authenticated
  using ((select public.current_member_id()) is not null);

create policy "Admin adds practice tracks"
  on public.practice_tracks for insert to authenticated
  with check ((select public.is_admin()));

create policy "Admin updates practice tracks"
  on public.practice_tracks for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "Admin removes practice tracks"
  on public.practice_tracks for delete to authenticated
  using ((select public.is_admin()));

revoke all on public.practice_tracks from anon;
grant select, insert, update, delete on public.practice_tracks to authenticated;
