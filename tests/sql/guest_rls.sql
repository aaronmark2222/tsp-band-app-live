-- Rolls back always. Expected: the guest reads songs and song_lyrics, exactly 1
-- members row and 1 app_meta row, and 0 rows everywhere else; every guest write
-- changes 0 rows or is denied. (Counts for later roles in the loop are affected
-- by the admin's test writes inside the same transaction; run one role at a
-- time by editing the slug list if exact member counts are needed.)
create temp table _t(who text, res jsonb) on commit drop;
grant all on _t to authenticated;
do $$
declare r record; v jsonb; n int; w text;
begin
  for r in select slug, user_id from public.members where (role = 'guest' or is_admin) and user_id is not null order by is_admin loop
    perform set_config('request.jwt.claims', json_build_object('sub', r.user_id, 'role','authenticated')::text, true);
    set local role authenticated;
    v := jsonb_build_object(
      'songs',(select count(*) from public.songs),'song_lyrics',(select count(*) from public.song_lyrics),
      'members',(select count(*) from public.members),'member_emails',(select count(*) from public.member_emails),
      'song_tasks',(select count(*) from public.song_tasks),'task_types',(select count(*) from public.task_types),
      'task_status_log',(select count(*) from public.task_status_log),'gigs',(select count(*) from public.gigs),
      'setlists',(select count(*) from public.setlists),'setlist_items',(select count(*) from public.setlist_items),
      'sync_runs',(select count(*) from public.ableton_sync_runs),'snoozes',(select count(*) from public.ableton_sync_snoozes),
      'audio_state',(select count(*) from public.practice_audio_state),'export_log',(select count(*) from public.practice_export_log),
      'app_meta',(select count(*) from public.app_meta),'languages',(select count(*) from public.languages),
      'others_sessions',(select count(*) from public.app_sessions where member_id <> public.current_member_id()));
    w := '';
    begin update public.song_tasks set status = status; get diagnostics n = row_count; w := w || 'tasks_upd=' || n; exception when others then w := w || 'tasks_upd=ERR'; end;
    begin update public.songs set name = name; get diagnostics n = row_count; w := w || ' songs_upd=' || n; exception when others then w := w || ' songs_upd=ERR'; end;
    begin insert into public.song_lyrics_edits(song_id, track_slug, lines, edited_by_member_id)
          select id, 'guitar', '[]', public.current_member_id() from public.songs limit 1; w := w || ' edit_ins=OK';
    exception when others then w := w || ' edit_ins=DENIED'; end;
    begin update public.app_meta set value = value; get diagnostics n = row_count; w := w || ' meta_upd=' || n; exception when others then w := w || ' meta_upd=ERR'; end;
    begin delete from public.gigs; get diagnostics n = row_count; w := w || ' gigs_del=' || n; exception when others then w := w || ' gigs_del=ERR'; end;
    reset role;
    insert into _t values (r.slug, v || jsonb_build_object('writes', w));
  end loop;
  raise exception 'ROLLBACK_TEST %', (select jsonb_object_agg(who, res) from _t);
end $$;
