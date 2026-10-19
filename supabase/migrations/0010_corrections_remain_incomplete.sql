-- Corrections is an in-progress state, never a completed state.
update public.task_types
set done_statuses = array_remove(done_statuses, 'Corrections'::public.task_status)
where 'Corrections'::public.task_status = any (done_statuses);
