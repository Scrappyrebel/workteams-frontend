-- ============ 030: drawn signature capture ============
-- Stores the client's finger/mouse-drawn signature (PNG data URL) alongside
-- the typed printed name on signed contracts.

alter table public.contracts add column if not exists signature_image text;
