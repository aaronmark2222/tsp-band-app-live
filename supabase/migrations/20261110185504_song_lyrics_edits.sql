create table public.song_lyrics_edits (
  song_id text not null references public.songs(id) on update cascade on delete cascade,
  track_slug text not null check (track_slug in ('guitar', 'keyboard', 'drums')),
  lines jsonb not null default '[]'::jsonb check (jsonb_typeof(lines) = 'array'),
  edited_by_member_id uuid not null references public.members(id),
  updated_at timestamptz not null default now(),
  primary key (song_id, track_slug)
);

comment on table public.song_lyrics_edits is
  'Shared musician edits for Guitar, Keyboard, and Drums Practice lyrics. Overrides only the matching track in song_lyrics; the Ableton-synced source remains intact.';

alter table public.song_lyrics_edits enable row level security;

create policy "Linked members read lyrics edits"
on public.song_lyrics_edits for select to authenticated
using ((select public.current_member_id()) is not null);

create policy "Instrument members add own lyrics edits"
on public.song_lyrics_edits for insert to authenticated
with check (
  (select public.is_admin())
  or (
    edited_by_member_id = (select public.current_member_id())
    and exists (
      select 1 from public.members m
      where m.id = (select public.current_member_id()) and m.role = 'member'
        and (
          (track_slug = 'guitar' and lower(m.instrument) like '%guitar%')
          or (track_slug = 'keyboard' and lower(m.instrument) like '%key%')
          or (track_slug = 'drums' and lower(m.instrument) like '%drum%')
        )
    )
  )
);

create policy "Instrument members update own lyrics edits"
on public.song_lyrics_edits for update to authenticated
using (
  (select public.is_admin())
  or exists (
    select 1 from public.members m
    where m.id = (select public.current_member_id()) and m.role = 'member'
      and (
        (track_slug = 'guitar' and lower(m.instrument) like '%guitar%')
        or (track_slug = 'keyboard' and lower(m.instrument) like '%key%')
        or (track_slug = 'drums' and lower(m.instrument) like '%drum%')
      )
  )
)
with check (
  (select public.is_admin())
  or (
    edited_by_member_id = (select public.current_member_id())
    and exists (
      select 1 from public.members m
      where m.id = (select public.current_member_id()) and m.role = 'member'
        and (
          (track_slug = 'guitar' and lower(m.instrument) like '%guitar%')
          or (track_slug = 'keyboard' and lower(m.instrument) like '%key%')
          or (track_slug = 'drums' and lower(m.instrument) like '%drum%')
        )
    )
  )
);

create policy "Instrument members remove own lyrics edits"
on public.song_lyrics_edits for delete to authenticated
using (
  (select public.is_admin())
  or exists (
    select 1 from public.members m
    where m.id = (select public.current_member_id()) and m.role = 'member'
      and (
        (track_slug = 'guitar' and lower(m.instrument) like '%guitar%')
        or (track_slug = 'keyboard' and lower(m.instrument) like '%key%')
        or (track_slug = 'drums' and lower(m.instrument) like '%drum%')
      )
  )
);

revoke all on public.song_lyrics_edits from anon;
grant select, insert, update, delete on public.song_lyrics_edits to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public'
         and tablename = 'song_lyrics_edits'
     ) then
    alter publication supabase_realtime add table public.song_lyrics_edits;
  end if;
end
$$;