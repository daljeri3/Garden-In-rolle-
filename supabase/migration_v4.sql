-- Garden In Rolle HR — migration v4
-- Run this in Supabase SQL Editor. Safe to run on your existing database —
-- only adds a column and storage bucket, nothing existing is touched.

alter table leaves add column if not exists medical_letter_path text;

insert into storage.buckets (id, name, public)
values ('medical-letters', 'medical-letters', false)
on conflict (id) do nothing;

drop policy if exists "medical_letters_insert" on storage.objects;
drop policy if exists "medical_letters_select" on storage.objects;

create policy "medical_letters_insert" on storage.objects for insert
  with check (
    bucket_id = 'medical-letters'
    and (storage.foldername(name))[1] = my_employee_id()::text
  );
create policy "medical_letters_select" on storage.objects for select
  using (
    bucket_id = 'medical-letters'
    and ((storage.foldername(name))[1] = my_employee_id()::text or am_manager())
  );

-- Note: the weekly-off day (Friday, already your default) is now editable
-- from Settings in the app itself — no SQL needed for that part.
