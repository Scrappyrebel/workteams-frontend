-- WorkTeams training course categories (088).
--
-- The Training Academy's course catalog (migration 021) constrains
-- training_courses.category to exactly two values — 'cleaning' and
-- 'business' — and the Training Center index page renders exactly
-- those two categories. The two locks agree with each other, and
-- together they mean a course in any other category can never exist
-- and could never be seen: the catalog is frozen at two buckets no
-- matter what training a company actually needs (safety, food
-- handling, equipment, compliance refreshers — any future course line
-- has nowhere to live).
--
-- This migration widens the storage lock, and only the storage lock:
--
--   * The 021 CHECK (category in ('cleaning','business')) is replaced
--     with a format check: the category must be a slug-shaped value
--     (starts with a lowercase letter, then lowercase letters, digits,
--     underscores or hyphens — the same shape both existing values
--     already have). 'cleaning' and 'business' remain valid forever;
--     every existing row passes unchanged, and no row's value,
--     meaning, sort order or visibility changes.
--   * Nothing else is touched: no new table, no new column, no policy
--     change, no grant change. training_courses stays the
--     product-level catalog it has always been (readable by signed-in
--     users under the 021 policies; written only through seed /
--     service-role paths). No company gains or loses access to
--     anything, and who may create courses or categories is NOT
--     decided here — there is no in-app course authoring today, and
--     adding one is a separate product decision.
--
-- The index page that ships with this migration renders the two known
-- categories first, with their exact existing headings, and then any
-- other stored category under its own heading derived from the stored
-- slug — so a course in a new category displays instead of vanishing.
--
-- Fail-soft, in both directions: BEFORE this migration runs, only the
-- two existing categories can exist, the page renders them exactly as
-- it always has, and nothing new appears. AFTER it runs, the page is
-- unchanged until a course with another category is actually added to
-- the catalog. The app works identically before and after; this file
-- only removes the ceiling.
--
-- Run in the Supabase SQL editor (project: WorkTeams). Paste the WHOLE
-- file into ONE query and run it ONCE — it is a single BEGIN..COMMIT.
-- Safe to re-run (the drop is IF EXISTS and the replacement check
-- accepts every value the old one did).

BEGIN;

alter table public.training_courses
  drop constraint if exists training_courses_category_check;

alter table public.training_courses
  add constraint training_courses_category_check
  check (category ~ '^[a-z][a-z0-9_-]*$');

comment on column public.training_courses.category is
  'Course category slug (021, widened by 088): ''cleaning'' and ''business'' keep their established Training Center headings; any other slug-shaped category renders under its own heading on the training index instead of being silently invisible. Format-checked so a category is always a usable slug.';

COMMIT;
