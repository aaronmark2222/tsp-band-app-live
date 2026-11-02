create or replace function public.delete_song_and_shift_ids(p_song_id text)
returns integer
language plpgsql
security invoker
set search_path = public
as $function$
declare
  v_prefix text;
  v_number integer;
  v_next_id text;
  v_next_number integer;
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

  -- Setlist entries for the removed song are intentionally removed. Other
  -- dependent rows follow the song through their ON UPDATE CASCADE foreign keys.
  delete from public.setlist_items where song_id = p_song_id;
  delete from public.songs where id = p_song_id;
  if not found then
    raise exception 'Song % could not be deleted', p_song_id using errcode = 'P0002';
  end if;

  -- Shift this exact alphabetic ID family down in ascending numeric order so
  -- each destination ID is free before it is reused.
  for v_next_id, v_next_number in
    select id, substring(id from '[0-9]+$')::integer
    from public.songs
    where regexp_replace(id, '[0-9]+$', '') = v_prefix
      and substring(id from '[0-9]+$')::integer > v_number
    order by substring(id from '[0-9]+$')::integer
    for update
  loop
    update public.songs
    set id = v_prefix || (v_next_number - 1)::text
    where id = v_next_id;
    v_shifted := v_shifted + 1;
  end loop;

  return v_shifted;
end;
$function$;

revoke all on function public.delete_song_and_shift_ids(text) from public, anon;
grant execute on function public.delete_song_and_shift_ids(text) to authenticated;
