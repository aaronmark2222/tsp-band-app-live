alter table public.members add column if not exists role text not null default 'member';
alter table public.members drop constraint if exists members_role_check;
alter table public.members add constraint members_role_check check (role in ('member', 'guest'));
comment on column public.members.role is 'member = band member; guest = Practice page only (no tasks, hidden from member lists)';
insert into public.members (slug, name, instrument, is_admin, role, sort_order)
select 'kenneth', 'Kenneth Shalom', 'Guest', false, 'guest', 100
where not exists (select 1 from public.members where slug = 'kenneth');
