-- Track whether each song has MIDI clips on Ableton's GUITAR TONE Midi track.
-- Initial statuses were checked against the named song locator ranges in the
-- supplied TSP LIVE MASTER PROJECT.als (track ID 2239).

insert into public.task_types (
  key,
  label,
  category,
  owner_member_id,
  allowed_statuses,
  done_statuses,
  sort_order
)
select
  'guitar_tone_midi',
  'Guitar Tone Midi',
  'ableset',
  member.id,
  array['Incomplete', 'Completed']::public.task_status[],
  array['Completed']::public.task_status[],
  2
from public.members as member
where member.slug = 'aaron'
on conflict (key) do update set
  label = excluded.label,
  category = excluded.category,
  owner_member_id = excluded.owner_member_id,
  allowed_statuses = excluded.allowed_statuses,
  done_statuses = excluded.done_statuses,
  sort_order = excluded.sort_order;

insert into public.song_tasks (song_id, task_key, status)
select
  song.id,
  'guitar_tone_midi',
  case
    when song.id in (
      'I1', 'E4', 'E5', 'E6', 'E7',
      'EM5', 'EM6', 'EM7', 'EM8',
      'H1', 'H2', 'H4', 'H5', 'H6',
      'HM1', 'HM2', 'HM3', 'HM4', 'HM8',
      'EHM2', 'EHKM1'
    ) then 'Completed'::public.task_status
    else 'Incomplete'::public.task_status
  end
from public.songs as song
on conflict (song_id, task_key) do update set
  status = excluded.status,
  updated_at = now();
