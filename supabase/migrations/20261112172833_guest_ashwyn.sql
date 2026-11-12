-- A second guest (Practice page only). The sign-in email is added by the
-- admin through Member access, which stores it in member_emails; it is never
-- put in this public repository.
insert into public.members (slug, name, instrument, is_admin, role, sort_order)
select 'ashwyn', 'Ashwyn', 'Guest', false, 'guest', 101
where not exists (select 1 from public.members where slug = 'ashwyn');
