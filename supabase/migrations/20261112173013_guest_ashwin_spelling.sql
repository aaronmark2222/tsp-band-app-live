-- The guest added earlier today spells his name Ashwin.
update public.members
set name = 'Ashwin', slug = 'ashwin'
where slug in ('ashwyn', 'ashwin');
