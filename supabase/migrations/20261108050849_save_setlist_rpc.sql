-- Saves a setlist's name and full running order in one transaction (admin only).
-- p_items: [{id?: uuid, item_type, song_id, label, note, break_seconds}] in running order.
create or replace function public.save_setlist(p_setlist_id uuid, p_name text, p_items jsonb)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_item jsonb;
  v_pos integer := 0;
  v_keep uuid[];
begin
  if not public.is_admin() then
    raise exception 'Only an admin can change setlists' using errcode = '42501';
  end if;
  if coalesce(btrim(p_name), '') = '' then
    raise exception 'Enter a setlist name';
  end if;
  update setlists set name = btrim(p_name) where id = p_setlist_id;
  if not found then raise exception 'Setlist not found'; end if;

  select coalesce(array_agg((e->>'id')::uuid), '{}') into v_keep
  from jsonb_array_elements(p_items) e where nullif(e->>'id', '') is not null;
  delete from setlist_items where setlist_id = p_setlist_id and not (id = any(v_keep));

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_pos := v_pos + 1;
    if nullif(v_item->>'id', '') is not null then
      update setlist_items set position = v_pos
      where id = (v_item->>'id')::uuid and setlist_id = p_setlist_id;
    else
      insert into setlist_items (setlist_id, position, item_type, song_id, label, note, break_seconds)
      values (p_setlist_id, v_pos, coalesce(v_item->>'item_type', 'song')::setlist_item_type,
              v_item->>'song_id', v_item->>'label', v_item->>'note', (v_item->>'break_seconds')::integer);
    end if;
  end loop;
end;
$$;
revoke all on function public.save_setlist(uuid, text, jsonb) from public, anon;
grant execute on function public.save_setlist(uuid, text, jsonb) to authenticated;
