-- Garden In Rolle HR — migration v5
-- Fixes payroll counting days before you started using this app as
-- unexcused absences. Run in Supabase SQL Editor — safe on existing data.

alter table settings add column if not exists tracking_start_date date default current_date;

-- Since you're running this after already using the app for a bit, set it
-- explicitly to today so nothing before now gets counted:
update settings set tracking_start_date = current_date where id = 1;
