-- Rolls back always. Expected final message:
-- member=refused:42501 | audio_on_deleted=refused | audio_on_shifting=refused … |
-- no_audio_delete shifted=1 songs=ZZ1,ZZ2 log=deleted:ZZ2:<ts>:lyrics,ZZ2:chords … audio_ZZ1=1
do $$
declare a uuid; m uuid; res text := ''; n int; t text;
begin
  select user_id into a from public.members where is_admin limit 1;
  select user_id into m from public.members where not is_admin and role = 'member' and user_id is not null limit 1;
  insert into public.songs (id, name, type, sort_order)
  select x.id, x.name, s.type, x.so
  from (values ('ZZ1','Test one',9001),('ZZ2','Test two',9002),('ZZ3','Test three',9003)) x(id,name,so),
       (select type from public.songs limit 1) s;
  insert into public.task_status_log (song_id, task_key, old_status, new_status)
  values ('ZZ2','lyrics','Incomplete','Completed'),('ZZ3','chords','Incomplete','Completed');
  perform set_config('request.jwt.claims', json_build_object('sub', m, 'role','authenticated')::text, true);
  begin perform public.delete_song_and_shift_ids('ZZ2'); res := res || 'member=ALLOWED(BAD)';
  exception when others then res := res || 'member=refused:' || sqlstate; end;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role','authenticated')::text, true);
  insert into public.practice_audio_state (song_id, element, fingerprint, exported_at) values ('ZZ2','Mixdown','x', now());
  begin perform public.delete_song_and_shift_ids('ZZ2'); res := res || ' | audio_on_deleted=ALLOWED(BAD)';
  exception when others then res := res || ' | audio_on_deleted=refused'; end;
  delete from public.practice_audio_state where song_id='ZZ2';
  insert into public.practice_audio_state (song_id, element, fingerprint, exported_at) values ('ZZ3','Mixdown','x', now());
  begin perform public.delete_song_and_shift_ids('ZZ2'); res := res || ' | audio_on_shifting=ALLOWED(BAD)';
  exception when others then res := res || ' | audio_on_shifting=refused: ' || left(sqlerrm, 60); end;
  update public.practice_audio_state set song_id='ZZ1' where song_id='ZZ3';
  select public.delete_song_and_shift_ids('ZZ2') into n; res := res || ' | no_audio_delete shifted=' || n;
  select string_agg(id, ',' order by id) into t from public.songs where id like 'ZZ%'; res := res || ' songs=' || t;
  select string_agg(song_id || ':' || task_key, ',' order by song_id) into t
  from public.task_status_log where song_id like 'ZZ%' or song_id like 'deleted:ZZ%';
  res := res || ' log=' || regexp_replace(t, ':2026[0-9T]+', ':<ts>');
  select count(*) into n from public.practice_audio_state where song_id='ZZ1'; res := res || ' audio_ZZ1=' || n;
  raise exception 'ROLLBACK_TEST %', res;
end $$;
