update public.task_types
set allowed_statuses = array['Incomplete'::public.task_status, 'Finished'::public.task_status, 'Completed'::public.task_status],
    done_statuses = array['Completed'::public.task_status]
where key = 'guitar_tone_midi';
