-- Tahani Flowers HR — v2, with real login and per-employee access control
-- Run this in Supabase SQL Editor. If you already ran the old schema.sql,
-- run this on a FRESH project (Supabase → New project) rather than on top
-- of the old one, since policies are being replaced.

create extension if not exists "pgcrypto";

create table if not exists employees (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  role text not null default 'Florist',
  email text unique,              -- must match their Supabase Auth login email
  is_manager boolean not null default false,
  phone text,
  civil_id text,
  civil_id_expiry date,
  visa_expiry date,
  contract_start date,
  contract_type text default 'Full-time',
  salary numeric default 0,
  notes text,
  created_at timestamptz default now()
);

create table if not exists punches (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid references employees(id) on delete cascade,
  type text not null, -- 'in' | 'out'
  ts timestamptz not null default now(),
  lat double precision,
  lng double precision,
  location_type text, -- 'shop' | 'field'
  distance numeric
);

create table if not exists leaves (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid references employees(id) on delete cascade,
  type text not null default 'Annual',
  from_date date not null,
  to_date date not null,
  reason text,
  status text not null default 'pending',
  requested_at timestamptz default now()
);

create table if not exists settings (
  id int primary key default 1,
  shop_lat double precision,
  shop_lng double precision,
  radius_meters int default 150,
  shift_start text default '09:00',
  shift_end text default '21:00',
  grace_minutes int default 15,
  weekly_off int default 5
);
insert into settings (id) values (1) on conflict (id) do nothing;

-- Manual payroll adjustments (bonuses, extra deductions) on top of the
-- automatic absence/lateness math, one row per employee per calendar month.
create table if not exists payroll_adjustments (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid references employees(id) on delete cascade,
  month text not null, -- 'YYYY-MM'
  amount numeric not null default 0, -- positive = bonus, negative = extra deduction
  note text,
  updated_at timestamptz default now(),
  unique (employee_id, month)
);

-- Written warnings — required by Kuwait Labor Law Article 37 before any
-- wage deduction can be applied. The app auto-creates one the first time
-- an employee is late or absent in a calendar month (no deduction yet);
-- deductions only apply from the second violation onward. Managers can
-- also add a warning manually for any other reason.
create table if not exists warnings (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid references employees(id) on delete cascade,
  type text not null default 'manual', -- 'late' | 'absence' | 'manual'
  month text, -- 'YYYY-MM', set for auto-generated late/absence warnings only
  date date not null default current_date,
  note text,
  created_at timestamptz default now()
);
-- Prevents duplicate auto-warnings for the same employee/type/month, while
-- still allowing unlimited manual warnings (month is null for those).
create unique index if not exists warnings_auto_unique
  on warnings (employee_id, type, month)
  where type in ('late', 'absence');

-- ---- Helper functions (run as the table owner, bypass RLS internally) ----
create or replace function my_employee_id()
returns uuid
language sql security definer set search_path = public stable as $$
  select id from employees where email = auth.jwt()->>'email' limit 1;
$$;

create or replace function am_manager()
returns boolean
language sql security definer set search_path = public stable as $$
  select coalesce((select is_manager from employees where email = auth.jwt()->>'email' limit 1), false);
$$;

-- ---- Row Level Security ----
alter table employees enable row level security;
alter table punches enable row level security;
alter table leaves enable row level security;
alter table settings enable row level security;

drop policy if exists "open_employees" on employees;
drop policy if exists "open_punches" on punches;
drop policy if exists "open_leaves" on leaves;
drop policy if exists "open_settings" on settings;

-- Employees: see your own row, or every row if you're a manager.
-- Only managers can add/edit/remove staff records.
create policy "employees_select" on employees for select
  using (email = auth.jwt()->>'email' or am_manager());
create policy "employees_write" on employees for insert
  with check (am_manager());
create policy "employees_update" on employees for update
  using (am_manager()) with check (am_manager());
create policy "employees_delete" on employees for delete
  using (am_manager());

-- Punches: everyone can punch themselves in/out and see only their own
-- history; managers can see everyone's.
create policy "punches_select" on punches for select
  using (employee_id = my_employee_id() or am_manager());
create policy "punches_insert" on punches for insert
  with check (employee_id = my_employee_id());

-- Leaves: staff request and view their own; only managers approve/reject
-- and see everyone's requests.
create policy "leaves_select" on leaves for select
  using (employee_id = my_employee_id() or am_manager());
create policy "leaves_insert" on leaves for insert
  with check (employee_id = my_employee_id());
create policy "leaves_update" on leaves for update
  using (am_manager()) with check (am_manager());

-- Settings: any logged-in employee can read (needed to compute distance
-- from the shop on their phone); only managers can change them.
create policy "settings_select" on settings for select
  using (auth.role() = 'authenticated');
create policy "settings_update" on settings for update
  using (am_manager()) with check (am_manager());

-- Payroll adjustments and warnings: manager-only in both directions —
-- these are sensitive records, so staff don't read or write them directly.
alter table payroll_adjustments enable row level security;
alter table warnings enable row level security;

create policy "adjustments_all" on payroll_adjustments for all
  using (am_manager()) with check (am_manager());
create policy "warnings_all" on warnings for all
  using (am_manager()) with check (am_manager());

-- ---- Create yourself as the first manager ----
-- 1. In Supabase Dashboard → Authentication → Users → Add user
--    Enter your email + a password. Leave "Auto Confirm User" ON so you
--    can log in immediately without checking an inbox.
-- 2. Then run this, replacing the email with the exact one you just used:
--
-- insert into employees (name, role, email, is_manager, salary)
-- values ('Your Name', 'Manager', 'you@example.com', true, 0);
