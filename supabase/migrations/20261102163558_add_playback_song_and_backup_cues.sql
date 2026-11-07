-- Add the Song Cue and Backup Que checklist tasks.
-- Song Cue moves from Dale to the administrator when marked Recorded.
-- Existing songs receive task rows through the task_types insert trigger.

insert into public.task_types
  (key, label, category, owner_member_id, allowed_statuses, done_statuses, sort_order)
values
  (
    'song_cue',
    'Song Cue',
    'utility',
    (select id from public.members where name = 'Dale'),
    array['Incomplete','Recorded','Completed']::public.task_status[],
    array['Completed']::public.task_status[],
    15
  ),
  (
    'backup_que',
    'Backup Que',
    'utility',
    (select id from public.members where name = 'Aaron' and is_admin = true),
    array['Incomplete','Completed']::public.task_status[],
    array['Completed']::public.task_status[],
    16
  )
on conflict (key) do nothing;
