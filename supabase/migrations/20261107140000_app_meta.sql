-- Small key/value store for app-wide settings read from the Ableton set
-- (e.g. practice_track_colors). Members read; only admins write.
create table if not exists public.app_meta (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.app_meta enable row level security;
drop policy if exists "Linked members read app meta" on public.app_meta;
create policy "Linked members read app meta" on public.app_meta for select to authenticated
  using ((select public.current_member_id()) is not null);
drop policy if exists "Admin adds app meta" on public.app_meta;
create policy "Admin adds app meta" on public.app_meta for insert to authenticated
  with check ((select public.is_admin()));
drop policy if exists "Admin updates app meta" on public.app_meta;
create policy "Admin updates app meta" on public.app_meta for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
