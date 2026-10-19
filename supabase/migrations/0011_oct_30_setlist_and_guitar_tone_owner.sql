-- Assign Guitar Tone Midi to Rowen and replace the Oct 30th setlist order.
-- Song and task records are preserved; only the setlist membership/order changes.
do $$
declare
  target_setlist_id uuid;
  desired_song_ids text[] := array[
    'I1', 'H1', 'HM8', 'E7', 'E6', 'EM9', 'H5', 'EHM4', 'E4', 'EM5', 'EM8',
    'EHM2', 'HM3', 'H4', 'H7', 'HM2', 'HM9', 'E5', 'EM6', 'EM7', 'EHKM1'
  ];
begin
  if (select count(*) from public.members where name = 'Rowen') <> 1 then
    raise exception 'Expected exactly one member named Rowen';
  end if;

  update public.task_types
  set owner_member_id = (select id from public.members where name = 'Rowen')
  where key = 'guitar_tone_midi';
  if not found then
    raise exception 'Guitar Tone Midi task type was not found';
  end if;

  if (select count(*) from public.gigs where name = 'Oct 30th') <> 1 then
    raise exception 'Expected exactly one Oct 30th gig';
  end if;
  select setlist_id into target_setlist_id
  from public.gigs where name = 'Oct 30th';
  if target_setlist_id is null then
    raise exception 'Oct 30th gig is not linked to a setlist';
  end if;

  if (select count(*) from public.songs where id = any (desired_song_ids)) <> cardinality(desired_song_ids) then
    raise exception 'One or more requested Oct 30th songs could not be matched';
  end if;

  update public.setlists set name = 'Oct 30th' where id = target_setlist_id;

  -- Shift old positions out of the target range before reordering.
  update public.setlist_items
  set position = position + 1000
  where setlist_id = target_setlist_id;

  -- The new setlist contains exactly the songs in the supplied order.
  delete from public.setlist_items
  where setlist_id = target_setlist_id
    and (item_type <> 'song' or song_id is null or not (song_id = any (desired_song_ids)));

  update public.setlist_items as item
  set position = desired.position
  from unnest(desired_song_ids) with ordinality as desired(song_id, position)
  where item.setlist_id = target_setlist_id
    and item.item_type = 'song'
    and item.song_id = desired.song_id;

  insert into public.setlist_items (setlist_id, position, item_type, song_id)
  select target_setlist_id, desired.position, 'song', desired.song_id
  from unnest(desired_song_ids) with ordinality as desired(song_id, position)
  where not exists (
    select 1 from public.setlist_items as item
    where item.setlist_id = target_setlist_id
      and item.item_type = 'song'
      and item.song_id = desired.song_id
  );
end;
$$;
