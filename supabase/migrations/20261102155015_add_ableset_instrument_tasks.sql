-- Add the instrument-specific AbleSet cue tracks.
-- Existing songs receive new Incomplete task rows through create_task_type_rows.

insert into public.task_types
  (key, label, category, owner_member_id, allowed_statuses, done_statuses, sort_order)
values
  (
    'guitar',
    'Guitar',
    'ableset',
    (select id from public.members where instrument = 'Guitar'),
    array['Incomplete','Completed','No']::public.task_status[],
    array['Completed']::public.task_status[],
    4
  ),
  (
    'keyboard',
    'Keyboard',
    'ableset',
    (select id from public.members where instrument = 'Keyboard'),
    array['Incomplete','Completed','No']::public.task_status[],
    array['Completed']::public.task_status[],
    5
  ),
  (
    'drums',
    'Drums',
    'ableset',
    (select id from public.members where instrument = 'Drums'),
    array['Incomplete','Completed','No']::public.task_status[],
    array['Completed']::public.task_status[],
    6
  )
on conflict (key) do nothing;
