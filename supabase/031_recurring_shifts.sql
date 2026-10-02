-- 031_recurring_shifts.sql
-- Recurring shifts: a repeat (weekly / every 2 weeks / monthly / 1st & 3rd
-- weekday) materializes as ordinary shift rows, so schedule, payroll, the
-- time clock and inspections keep working with zero query changes.
-- Rows created by one repeat share a series_id so the future series can be
-- deleted at once; recurrence_label is the short chip shown on the card
-- ("Weekly", "Every 2 weeks", "Monthly", "1st & 3rd Friday").
-- Existing table: no new GRANTs needed (RLS policies are table-wide).

alter table public.shifts add column if not exists series_id uuid;
alter table public.shifts add column if not exists recurrence_label text;
create index if not exists shifts_series_id_idx on public.shifts (series_id);
