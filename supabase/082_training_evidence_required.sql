-- 082: Training step 9 (Evidence submission) must contain actual evidence.
-- Phase 3 item P3-04 (Training step labels + Evidence step integrity).
--
-- Until now public.training_evidence.file_url was nullable with no check,
-- and the step-9 submit path inserted file_url = null when no photo was
-- chosen, then marked the step complete and moved the enrollment to
-- manager approval. A manager could be asked to approve proof that does
-- not exist, and the resulting completion record carries compliance
-- weight (safety-training attestation) with nothing behind it.
--
-- This adds the server-side half of the fix (the step page now also
-- refuses to submit without a photo): every NEW evidence row must carry
-- a non-empty file_url — the storage path of the uploaded photo.
--
-- NOT VALID is deliberate: the constraint is enforced for every new
-- insert (and for any later update of a row) WITHOUT re-validating or
-- invalidating evidence rows that already exist. Existing completed
-- training records are untouched. Once any legacy evidence-less rows
-- have been reviewed, the constraint can be validated with:
--   alter table public.training_evidence
--     validate constraint training_evidence_file_required;
--
-- No grants change: authenticated already has select, insert on this
-- table (021) and a CHECK constraint applies on top of those grants.
-- Protected areas untouched: no time clock, shift video or
-- Communication Book table, function or column is referenced here.

BEGIN;

alter table public.training_evidence
  add constraint training_evidence_file_required
  check (file_url is not null and btrim(file_url) <> '') not valid;

COMMIT;
