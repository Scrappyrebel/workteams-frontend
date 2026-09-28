-- Walkthrough areas: store length x width measurements
alter table walkthrough_areas add column if not exists length_ft numeric;
alter table walkthrough_areas add column if not exists width_ft numeric;
