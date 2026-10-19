-- Require every newly linked band account to replace its temporary password.
alter table public.members
  add column if not exists must_change_password boolean not null default false;

create or replace function public.flag_member_first_login()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  update public.members
  set must_change_password = true
  where id = new.member_id;
  return new;
end;
$$;

drop trigger if exists member_email_requires_password_change on public.member_emails;
create trigger member_email_requires_password_change
after insert on public.member_emails
for each row execute function public.flag_member_first_login();

create or replace function public.complete_password_setup()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'A signed-in account is required';
  end if;

  update public.members
  set must_change_password = false
  where user_id = auth.uid();

  if not found then
    raise exception 'No linked band member was found for this account';
  end if;
end;
$$;

revoke all on function public.complete_password_setup() from public, anon;
grant execute on function public.complete_password_setup() to authenticated;

comment on column public.members.must_change_password is
  'True until a newly linked member replaces their temporary sign-in password.';
