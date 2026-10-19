-- TSP Band App: members, languages, task types, percussion instruments

insert into public.members (slug, name, instrument, is_admin, sort_order) values
  ('aaron',   'Aaron',   'Bass / playback engineer', true,  1),
  ('dale',    'Dale',    'Female vocals',            false, 2),
  ('anston',  'Anston',  'Male vocals / violin',     false, 3),
  ('rowen',   'Rowen',   'Guitar',                   false, 4),
  ('albert',  'Albert',  'Keyboard',                 false, 5),
  ('gautham', 'Gautham', 'Percussion',               false, 6),
  ('nishanth','Nishanth','Drums',                    false, 7);

insert into public.languages (code, name, short_label, sort_order) values
  ('E',  'English',   'Eng', 1),
  ('H',  'Hindi',     'Hin', 2),
  ('K',  'Konkani',   'Kon', 3),
  ('Kn', 'Kannada',   'Kan', 4),
  ('T',  'Tamil',     'Tam', 5),
  ('Ml', 'Malayalam', 'Mal', 6);

insert into public.percussion_instruments (name, sort_order) values
  ('Chimes',1), ('Darbuka',2), ('Timbale',3), ('Bongo',4), ('Congo',5), ('Tak',6),
  ('Cowbell',7), ('Tambourine',8), ('Stack Cymbal',9), ('Floor Tom',10), ('Dholak',11), ('Shaker',12);

-- Task types (one per tracked sheet column). Statuses: Incomplete, Completed, No,
-- Corrections, Review, Draft, Recorded (Ableset: Completed / Incomplete only).
insert into public.task_types (key, label, category, owner_member_id, allowed_statuses, done_statuses, sort_order)
select v.key, v.label, v.category, m.id,
       case when v.key = 'ableset'
            then '{Incomplete,Completed}'::public.task_status[]
            else '{Incomplete,Completed,No,Corrections,Review,Draft,Recorded}'::public.task_status[] end,
       case when v.key in ('backing_vocals_dale', 'backing_vocals_anston')
            then '{Completed,Corrections}'::public.task_status[]
            else '{Completed}'::public.task_status[] end,
       v.sort_order
from (values
  ('ableset',              'Ableset',                'ableset', 'aaron',   1),
  ('backing_music',        'Backing Music',          'backing', 'aaron',   2),
  ('backing_vocals_dale',  'Dale Backing Vocals',    'backing', 'dale',    3),
  ('backing_vocals_anston','Anston Backing Vocals',  'backing', 'anston',  4),
  ('backing_percussion',   'Backing Percussion',     'backing', 'aaron',   5),
  ('backing_sfx',          'Backing SFX',            'backing', 'aaron',   6),
  ('bass_part',            'Bass Part',              'part',    'aaron',   7),
  ('keyboard_part',        'Keyboard Part',          'part',    'albert',  8),
  ('guitar_part',          'Guitar Part',            'part',    'rowen',   9),
  ('violin_part',          'Violin Part',            'part',    'anston', 10),
  ('percussion_part',      'Percussion Part',        'part',    'gautham',11),
  ('drums_part',           'Drums Part',             'part',    'nishanth',12),
  ('vox_dale',             'Dale VOX Part',          'part',    'dale',   13),
  ('vox_anston',           'Anston VOX Part',        'part',    'anston', 14)
) as v(key, label, category, owner_slug, sort_order)
join public.members m on m.slug = v.owner_slug;
