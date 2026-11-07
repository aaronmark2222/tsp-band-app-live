-- Admin-only: delete a song, drop its setlist entries and renumber the later
-- songs of the same ID family (E8 -> E7 ...). Task rows are saved, removed and
-- restored around the ID shifts so the song_tasks identity guard and the
-- status-change trigger are not tripped.
CREATE OR REPLACE FUNCTION public.delete_song_and_shift_ids(p_song_id text)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_prefix text;
  v_number integer;
  v_next_id text;
  v_next_number integer;
  v_new_id text;
  v_task_rows jsonb;
  v_shifted integer := 0;
begin
  if not public.is_admin() then
    raise exception 'Only admins can delete songs' using errcode = '42501';
  end if;

  if p_song_id is null or p_song_id !~ '^[A-Z][A-Za-z]*[0-9]+$' then
    raise exception 'Invalid Song ID' using errcode = '22023';
  end if;

  lock table public.songs in share row exclusive mode;

  perform 1 from public.songs where id = p_song_id for update;
  if not found then
    raise exception 'Song % was not found', p_song_id using errcode = 'P0002';
  end if;

  v_prefix := regexp_replace(p_song_id, '[0-9]+$', '');
  v_number := substring(p_song_id from '[0-9]+$')::integer;

  -- Remove the deleted song's setlist entries, then delete the song.
  delete from public.setlist_items where song_id = p_song_id;
  delete from public.songs where id = p_song_id;
  if not found then
    raise exception 'Song % could not be deleted', p_song_id using errcode = 'P0002';
  end if;

  -- Save and remove every task row that will move. Keeping these rows out of
  -- song_tasks during the ID shifts prevents the identity guard from seeing
  -- ON UPDATE CASCADE changes caused by a later song moving into their IDs.
  select coalesce(
    jsonb_agg(jsonb_build_object(
      'song_id', v_prefix || ((substring(st.song_id from '[0-9]+$')::integer) - 1)::text,
      'task_key', st.task_key,
      'status', st.status::text,
      'updated_at', st.updated_at,
      'updated_by', st.updated_by
    )),
    '[]'::jsonb
  )
  into v_task_rows
  from public.song_tasks st
  where regexp_replace(st.song_id, '[0-9]+$', '') = v_prefix
    and substring(st.song_id from '[0-9]+$')::integer > v_number;

  delete from public.song_tasks st
  where regexp_replace(st.song_id, '[0-9]+$', '') = v_prefix
    and substring(st.song_id from '[0-9]+$')::integer > v_number;

  -- The deleted ID creates a gap, so ascending updates can reuse it in order.
  for v_next_id, v_next_number in
    select id, substring(id from '[0-9]+$')::integer
    from public.songs
    where regexp_replace(id, '[0-9]+$', '') = v_prefix
      and substring(id from '[0-9]+$')::integer > v_number
    order by substring(id from '[0-9]+$')::integer
    for update
  loop
    v_new_id := v_prefix || (v_next_number - 1)::text;
    update public.songs set id = v_new_id where id = v_next_id;
    v_shifted := v_shifted + 1;
  end loop;

  -- Restore each saved task row against its final song ID without rewriting
  -- history or firing the status-change update trigger.
  insert into public.song_tasks (song_id, task_key, status, updated_at, updated_by)
  select task.song_id, task.task_key, task.status, task.updated_at, task.updated_by
  from jsonb_to_recordset(v_task_rows) as task(
    song_id text,
    task_key text,
    status public.task_status,
    updated_at timestamptz,
    updated_by uuid
  );

  return v_shifted;
end;
$function$;
