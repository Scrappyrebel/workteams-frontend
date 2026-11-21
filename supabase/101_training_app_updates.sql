-- Migration 101: training content matched to the app (Wendy, 2026-11-21)
-- Adds the four lessons covering features shipped in the Nov 19-21 walkthrough
-- fixes: assigning training (HR), restock urgency + barcode scanning and
-- Documents & Forms (Operations), add-a-location step (Sales, body append).
-- Targeted inserts/appends only -- no course rows are deleted or recreated,
-- so existing enrollments and progress are untouched. Safe to re-run.

-- 1) HR Management, Step 1, Lesson 4: Assigning Training
with c as (select id as cid from public.training_courses where slug = 'hr-management'),
st as (select step_number, id as sid from public.training_steps where course_id = (select cid from c))
insert into public.training_lessons (course_id, step_id, sort_order, kind, title, body, media_svg)
select (select cid from c), (select sid from st where step_number = 1), 4, 'reading', 'Assigning Training — and Seeing the Results',
'Training only works if the right person takes the right course BEFORE the work starts. A new hire should finish the intro course before their first solo shift. A cleaner moving to medical buildings takes the medical course first, not after a month on site. As a manager, you do not wait for people to find courses on their own — you assign them.

HOW TO ASSIGN A COURSE. Go to Training Records. Managers see an ''Assign a course'' panel there. Pick the person, pick the course, and assign it. The course lands on that person''s training record exactly as if they had started it themselves, and the record shows ''Assigned by'' with your name — so the person knows it came from you, and anyone reviewing the record can see who assigned it. If the person already has that course on their record, the app tells you instead of doubling it up.

ONE AT A TIME. Assign one course at a time per person in most cases. Three courses dumped on a new hire in one day means three courses half-learned. Sequence them the way the work sequences: intro first, then the specialty the person will actually work.

READING THE RESULTS. The Training Records page is also where you read progress: who has not started, who is in progress, exam scores, and who is waiting on the approval step. When someone finishes a course, their evidence comes to a manager for approval — look at it before you approve. The approval is your signature that this person is ready for that work.

THE RULE. Assign before the work, check the record weekly, and never let ''I assigned it'' be the end of it. An assigned course nobody finished is the same as no training at all.', null
where not exists (select 1 from public.training_lessons l where l.course_id = (select cid from c) and l.title = 'Assigning Training — and Seeing the Results');

-- 2) Operations, Step 1, Lesson 4: Restock urgency + barcodes
with c as (select id as cid from public.training_courses where slug = 'operations-management'),
st as (select step_number, id as sid from public.training_steps where course_id = (select cid from c))
insert into public.training_lessons (course_id, step_id, sort_order, kind, title, body, media_svg)
select (select cid from c), (select sid from st where step_number = 1), 4, 'reading', 'Lesson 4: Restock requests — how urgent, and scanning barcodes', 'Lesson 3 set the par levels. This lesson covers the two tools on the Supplies page (it is labeled Inventory in the menu) that make restocking fast and honest.

MARK HOW URGENT IT IS. The restock request form asks ''How urgent'' — answer it truthfully:
- Urgent — we are OUT, need it ASAP.
- Running low — needed in the next couple of days.
- Low — at least a week left.
Open requests are listed urgent-first, so the worst needs get handled first. Marking everything urgent breaks the system — if everything is an emergency, nothing is. ''Urgent'' should be rare, and when it happens, ask why the par level failed so it does not happen again next week.

SCAN THE BARCODE. The Supplies page has a ''Scan a barcode'' panel. On phones that support it, the camera reads the barcode on the product and finds that supply for you — no typing, no guessing which of four similar products it is. On phones without camera scanning, type the barcode number in instead. If nothing matches, a manager can add it as a new supply with that code right there, so the next person''s scan finds it.

The point of both tools is the same as the par system itself: the request goes in the moment someone sees the shelf, with the right product and the right urgency — not from memory at the end of the week.', null
where not exists (select 1 from public.training_lessons l where l.course_id = (select cid from c) and l.title = 'Lesson 4: Restock requests — how urgent, and scanning barcodes');

-- 3) Operations, Step 1, Lesson 5: Documents & Forms
with c as (select id as cid from public.training_courses where slug = 'operations-management'),
st as (select step_number, id as sid from public.training_steps where course_id = (select cid from c))
insert into public.training_lessons (course_id, step_id, sort_order, kind, title, body, media_svg)
select (select cid from c), (select sid from st where step_number = 1), 5, 'reading', 'Lesson 5: Documents & Forms — the everyday paperwork', 'Every company runs on a handful of everyday forms. In this app they live in one place: the Documents & Forms section. Every company starts with the same nine starter forms:
- Incident Report — something went wrong: an injury, damage, a spill, a security problem.
- Supply Request — a building or a crew needs supplies.
- Walkthrough Form — the record of a walkthrough visit.
- Inspection Form — the record of a quality inspection.
- Time Off Request — a cleaner asks for time off, in writing, ahead of time.
- End-of-Shift Report — what got done, what did not, and anything the next shift needs to know.
- Key Sign-Out Log — who has which building key, and when it comes back.
- Customer Feedback — what a customer said, good or bad, in their words.
- New Customer Information — the facts a new account starts with.

You can also upload your own documents and forms into the same section, so the form a cleaner needs is in the app on their phone — not in a drawer at the office, and not in a group chat from three months ago.

THE RULE. If it happened, there is a form for it — and it gets filled in the same day. Paperwork written from memory a week later is fiction, and fiction does not protect the company. Managers: when a form comes in, read it, act on what it asks for, and keep it. These records are the company''s memory.', null
where not exists (select 1 from public.training_lessons l where l.course_id = (select cid from c) and l.title = 'Lesson 5: Documents & Forms — the everyday paperwork');

-- 4) Sales, Lesson 4 body: append the add-a-location step
update public.training_lessons
set body = body || '

STEP 1B: WHEN THE PROSPECT IS NOT LISTED YET. Brand-new prospects will not be in the location list — that is normal, and it is not a reason to stop or to pick the wrong location just to move on. Under the location dropdown on both the walkthrough form and the bid form there is an ''Add their location here'' link (''New prospect not listed?'' on the walkthrough form, ''New client not listed?'' on the bid form). Tap it, type the location name — and the address too, if you have it — and the location is added and selected for you on the spot. Then finish the walkthrough or bid exactly as this lesson describes.'
where course_id = (select id from public.training_courses where slug = 'sales-training')
  and title like 'Lesson 4: Building the bid%'
  and body not like '%STEP 1B%';

-- READ-BACK (run after): expect hr-management 4 step-1 lessons, operations-management 5,
-- and the sales Lesson 4 body containing 'STEP 1B' exactly once.
-- select c.slug, count(*) from public.training_lessons l join public.training_courses c on c.id = l.course_id
--   join public.training_steps s on s.id = l.step_id where s.step_number = 1 and c.slug in ('hr-management','operations-management') group by c.slug;
-- select (body like '%STEP 1B%') as has_step1b from public.training_lessons
--   where course_id = (select id from public.training_courses where slug = 'sales-training') and title like 'Lesson 4: Building the bid%';
