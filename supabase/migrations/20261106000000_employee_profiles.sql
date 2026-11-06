-- Employee onboarding profiles (HR / KYC). Sensitive PII (Aadhaar) — admin-only readable.
-- A worker must complete this (login gate) before using the dashboard; they can
-- view/edit only their own row, admins (is_admin()) can read/correct everyone.
create table if not exists public.employee_profiles (
  id                 uuid primary key references auth.users(id) on delete cascade,
  worker_id          text,
  full_name          text,
  phone              text,
  email              text,
  aadhaar_number     text,
  aadhaar_front_path text,
  aadhaar_back_path  text,
  residence_address  text,
  completed_at       timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

alter table public.employee_profiles enable row level security;

create policy employee_profiles_self_sel on public.employee_profiles
  for select using (auth.uid() = id);
create policy employee_profiles_self_ins on public.employee_profiles
  for insert with check (auth.uid() = id);
create policy employee_profiles_self_upd on public.employee_profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);
create policy employee_profiles_admin_sel on public.employee_profiles
  for select using (public.is_admin());
create policy employee_profiles_admin_upd on public.employee_profiles
  for update using (public.is_admin()) with check (public.is_admin());

create or replace function public.touch_employee_profiles() returns trigger
  language plpgsql as $$ begin new.updated_at = now(); return new; end $$;
create trigger trg_touch_employee_profiles before update on public.employee_profiles
  for each row execute function public.touch_employee_profiles();

-- Private bucket for Aadhaar card photos (admin-only via RLS below).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('employee-docs', 'employee-docs', false, 10485760,
        array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do nothing;

create policy employee_docs_self_all on storage.objects
  for all
  using  (bucket_id = 'employee-docs' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'employee-docs' and (storage.foldername(name))[1] = auth.uid()::text);
create policy employee_docs_admin_read on storage.objects
  for select
  using (bucket_id = 'employee-docs' and public.is_admin());
