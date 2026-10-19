-- Include songs that have no task rows so readiness covers the full repertoire.
create or replace view public.song_readiness
with (security_invoker = true) as
with task_progress as (
  select
    s.id as song_id,
    s.backing_track_manual,
    coalesce(bool_and(st.status = any (array['Completed'::public.task_status, 'No'::public.task_status]))
      filter (where tt.category = 'backing'), false) as backing_complete,
    coalesce(bool_and(st.status = any (array['Completed'::public.task_status, 'No'::public.task_status]))
      filter (where tt.category = 'part'), false) as parts_complete,
    coalesce(bool_and(st.status = any (array['Completed'::public.task_status, 'No'::public.task_status]))
      filter (where tt.category = 'ableset'), false) as ableset_completed,
    coalesce(bool_and(st.status = any (tt.done_statuses) or st.status = 'No'::public.task_status)
      filter (where tt.category <> 'part'), false) as all_required_complete
  from public.songs as s
  left join public.song_tasks as st on st.song_id = s.id
  left join public.task_types as tt on tt.key = st.task_key
  group by s.id, s.backing_track_manual
)
select
  song_id,
  backing_complete,
  parts_complete,
  ableset_completed,
  coalesce(backing_track_manual::text,
    case when backing_complete then 'Finished' else 'Not Finished' end) as backing_track,
  (
    (backing_track_manual = 'Mixed'
      or (backing_track_manual is null and backing_complete))
    and all_required_complete
  ) as ready
from task_progress;
