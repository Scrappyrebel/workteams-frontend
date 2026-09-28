-- Bids: job type (commercial, residential, construction cleanup, move in/out)
alter table bids add column if not exists job_type text;
