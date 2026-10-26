-- Performance readiness follows the band's confirmed workflow:
-- all configured backing tasks must be Completed/No, the manual backing lifecycle
-- must be Mixed, and every configured Ableset task must be Completed/No.
-- Parts and Utility tasks are not performance-readiness gates.
create or replace view public.song_readiness
with (security_invoker = true) as
with expected_tasks as (
  select
    count(*) filter (where category = 'backing')::integer as backing_expected,
    count(*) filter (where category = 'ableset')::integer as ableset_expected
  from public.task_types
),
task_progress as (
  select
    s.id as song_id,
    s.backing_track_manual,
    count(st.task_key) filter (where tt.category = 'backing')::integer as backing_count,
    coalesce(bool_and(st.status = any (array['Completed'::public.task_status, 'No'::public.task_status]))
      filter (where tt.category = 'backing'), false) as backing_rows_complete,
    coalesce(bool_and(st.status = any (array['Completed'::public.task_status, 'No'::public.task_status]))
      filter (where tt.category = 'part'), false) as parts_complete,
    count(st.task_key) filter (where tt.category = 'ableset')::integer as ableset_count,
    coalesce(bool_and(st.status = any (array['Completed'::public.task_status, 'No'::public.task_status]))
      filter (where tt.category = 'ableset'), false) as ableset_rows_complete,
    e.backing_expected,
    e.ableset_expected
  from public.songs as s
  cross join expected_tasks as e
  left join public.song_tasks as st on st.song_id = s.id
  left join public.task_types as tt on tt.key = st.task_key
  group by s.id, s.backing_track_manual, e.backing_expected, e.ableset_expected
),
readiness_inputs as (
  select
    song_id,
    backing_track_manual,
    (backing_count = backing_expected and backing_rows_complete) as backing_complete,
    parts_complete,
    (ableset_count = ableset_expected and ableset_rows_complete) as ableset_completed
  from task_progress
)
select
  song_id,
  backing_complete,
  parts_complete,
  ableset_completed,
  coalesce(backing_track_manual::text,
    case when backing_complete then 'Finished' else 'Not Finished' end) as backing_track,
  (coalesce(backing_track_manual = 'Mixed', false)
    and backing_complete
    and ableset_completed) as ready
from readiness_inputs;