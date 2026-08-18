-- Garden In Rolle HR — migration for existing databases
-- Run this INSTEAD of schema.sql if you already deployed the earlier
-- version and have real employees/punches in there. This only adds the
-- new pieces (payroll adjustments + warnings) — nothing existing is touched.

create table if not exists payroll_adjustments (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid references employees(id) on delete cascade,
  month text not null,
  amount numeric not null default 0,
  note text,
  updated_at timestamptz default now(),
  unique (employee_id, month)
);

create table if not exists warnings (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid references employees(id) on delete cascade,
  type text not null default 'manual',
  month text,
  date date not null default current_date,
  note text,
  created_at timestamptz default now()
);
create unique index if not exists warnings_auto_unique
  on warnings (employee_id, type, month)
  where type in ('late', 'absence');

alter table payroll_adjustments enable row level security;
alter table warnings enable row level security;

drop policy if exists "adjustments_all" on payroll_adjustments;
drop policy if exists "warnings_all" on warnings;

create policy "adjustments_all" on payroll_adjustments for all
  using (am_manager()) with check (am_manager());
create policy "warnings_all" on warnings for all
  using (am_manager()) with check (am_manager());
