-- TSP Band App: row level security
-- Rules:
--   * Only people linked to a member row can read anything (so keep public sign-ups OFF in Supabase).
--   * Every member can read all progress.
--   * A member can change the status of tasks they own. Admins (Aaron) can change anything.
--   * Gautham (owner of percussion_part) and admins edit the per-song instrument list.
--   * Setlists, gigs, deadlines, songs and settings are admin-only for now.

grant usage on schema public to authenticated;
revoke all on all tables in schema public from anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;

alter table public.members                enable row level security;
alter table public.member_emails          enable row level security;
alter table public.languages              enable row level security;
alter table public.songs                  enable row level security;
alter table public.song_languages         enable row level security;
alter table public.medley_parts           enable row level security;
alter table public.task_types             enable row level security;
alter table public.song_tasks             enable row level security;
alter table public.task_status_log        enable row level security;
alter table public.percussion_instruments enable row level security;
alter table public.song_percussion        enable row level security;
alter table public.setlists               enable row level security;
alter table public.setlist_items          enable row level security;
alter table public.gigs                   enable row level security;
alter table public.deadlines              enable row level security;

-- Read access: any linked member, on every table except member_emails.
do $$
declare t text;
begin
  foreach t in array array['members','languages','songs','song_languages','medley_parts',
    'task_types','song_tasks','task_status_log','percussion_instruments','song_percussion',
    'setlists','setlist_items','gigs','deadlines']
  loop
    execute format('create policy "members read" on public.%I for select to authenticated
                    using (public.current_member_id() is not null)', t);
  end loop;
end $$;

-- Admin-only writes.
do $$
declare t text;
begin
  foreach t in array array['members','languages','songs','song_languages','medley_parts',
    'task_types','percussion_instruments','setlists','setlist_items','gigs','deadlines']
  loop
    execute format('create policy "admin write" on public.%I for all to authenticated
                    using (public.is_admin()) with check (public.is_admin())', t);
  end loop;
end $$;

create policy "admin only" on public.member_emails for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Task status: owner of the task type or admin. Rows are created by triggers, never by users.
create policy "owner or admin updates status" on public.song_tasks for update to authenticated
  using (public.is_admin() or public.owns_task(task_key))
  with check (public.is_admin() or public.owns_task(task_key));
create policy "admin manages task rows" on public.song_tasks for insert to authenticated
  with check (public.is_admin());
create policy "admin deletes task rows" on public.song_tasks for delete to authenticated
  using (public.is_admin());

-- Status log is written by the trigger only.
-- (no insert/update/delete policies for authenticated => denied)

-- Gautham (percussion_part owner) or admin edits the instrument list.
create policy "percussionist or admin adds" on public.song_percussion for insert to authenticated
  with check (public.is_admin() or public.owns_task('percussion_part'));
create policy "percussionist or admin removes" on public.song_percussion for delete to authenticated
  using (public.is_admin() or public.owns_task('percussion_part'));
