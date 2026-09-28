-- Bids: cleaning frequency (visits per week/month)
alter table bids add column if not exists frequency text;
