-- Replace the single AbleSet task with Sections, Lyrics, and Chords.
-- Guitar Tone Midi and Prompts live in their own Utility category.

alter table public.task_types drop constraint task_types_category_check;
alter table public.task_types
  add constraint task_types_category_check
  check (category in ('ableset', 'utility', 'backing', 'part'));

insert into public.task_types (
  key, label, category, owner_member_id, allowed_statuses, done_statuses, sort_order
)
select task.key, task.label, task.category, previous.owner_member_id,
       task.allowed_statuses, task.done_statuses, task.sort_order
from public.task_types as previous
cross join (values
  ('sections', 'Sections', 'ableset', array['Incomplete','Completed']::public.task_status[], array['Completed']::public.task_status[], 1),
  ('lyrics', 'Lyrics', 'ableset', array['Incomplete','Completed','No']::public.task_status[], array['Completed']::public.task_status[], 2),
  ('chords', 'Chords', 'ableset', array['Incomplete','Completed']::public.task_status[], array['Completed']::public.task_status[], 3),
  ('prompts', 'Prompts', 'utility', array['Incomplete','Completed']::public.task_status[], array['Completed']::public.task_status[], 2)
) as task(key, label, category, allowed_statuses, done_statuses, sort_order)
where previous.key = 'ableset'
on conflict (key) do update set
  label = excluded.label,
  category = excluded.category,
  owner_member_id = excluded.owner_member_id,
  allowed_statuses = excluded.allowed_statuses,
  done_statuses = excluded.done_statuses,
  sort_order = excluded.sort_order;

-- Carry the old AbleSet status to the new work items. Lyrics do not apply to
-- instrumental songs, so those rows use No regardless of the old status.
update public.song_tasks as destination
set status = case
  when destination.task_key = 'lyrics' and song.type = 'Inst'
    then 'No'::public.task_status
  when previous.status = 'Completed'
    then 'Completed'::public.task_status
  else 'Incomplete'::public.task_status
end,
updated_at = now()
from public.songs as song
join public.song_tasks as previous
  on previous.song_id = song.id and previous.task_key = 'ableset'
where destination.song_id = song.id
  and destination.task_key in ('sections', 'lyrics', 'chords', 'prompts');

update public.task_types
set category = 'utility', sort_order = 1
where key = 'guitar_tone_midi';

-- All AbleSet tasks now have to be done (or marked No) for readiness.
create or replace view public.song_readiness with (security_invoker = true) as
select
  s.id as song_id,
  coalesce(bool_and(st.status in ('Completed', 'No')) filter (where tt.category = 'backing'), false) as backing_complete,
  coalesce(bool_and(st.status in ('Completed', 'No')) filter (where tt.category = 'part'), false) as parts_complete,
  coalesce(bool_and(st.status in ('Completed', 'No')) filter (where tt.category = 'ableset'), false) as ableset_completed,
  coalesce(s.backing_track_manual::text,
    case when coalesce(bool_and(st.status in ('Completed', 'No')) filter (where tt.category = 'backing'), false)
      then 'Finished' else 'Not Finished' end) as backing_track,
  (s.backing_track_manual = 'Mixed'
    and coalesce(bool_and(st.status in ('Completed', 'No')) filter (where tt.category = 'ableset'), false)
    and coalesce(bool_and(st.status in ('Completed', 'No')) filter (where tt.category = 'part'), false)) as ready
from public.songs as s
join public.song_tasks as st on st.song_id = s.id
join public.task_types as tt on tt.key = st.task_key
group by s.id, s.backing_track_manual;

-- Remove the superseded task after its statuses have been copied.
delete from public.song_tasks where task_key = 'ableset';
delete from public.task_types where key = 'ableset';
