-- Seed: Move-In / Move-Out Cleaning (move-in-move-out)
-- Run AFTER 021_training_academy.sql in the WorkTeams Supabase project.

delete from public.training_questions where course_id = (select id from public.training_courses where slug = 'move-in-move-out');
delete from public.training_lessons where course_id = (select id from public.training_courses where slug = 'move-in-move-out');
delete from public.training_practicals where course_id = (select id from public.training_courses where slug = 'move-in-move-out');
delete from public.training_steps where course_id = (select id from public.training_courses where slug = 'move-in-move-out');
delete from public.training_courses where slug = 'move-in-move-out';

insert into public.training_courses (slug, title, description, category, department, sort_order, estimated_hours, recert_months)
values ('move-in-move-out', 'Move-In / Move-Out Cleaning', 'Deep vacancy cleans between tenants: top-to-bottom systems, appliances, and deposit-ready detail work.', 'cleaning', 'Specialty Cleaning', 4, 3, 12);

with c as (select id as cid from public.training_courses where slug = 'move-in-move-out')
insert into public.training_steps (course_id, step_number, step_key, title, description)
select cid, 1, 'reading', 'Reading: vacancy cleaning fundamentals', 'Core knowledge: the deposit-ready standard, systems, appliances, safety.' from c
union all select cid, 2, 'visual', 'Visual guide: room order and appliance detail', 'Diagrams that reinforce the reading.' from c
union all select cid, 3, 'worked_example', 'Worked example: 2-bed apartment move-out', 'A complete job worked start to finish.' from c
union all select cid, 4, 'guided_practice', 'Guided practice', 'Practice with coaching and checkpoints.' from c
union all select cid, 5, 'simulator', 'Simulator: mold behind the fridge', 'Safe hands-on simulation.' from c
union all select cid, 6, 'written_exam', 'Written exam', 'Randomized questions. 80% to pass.' from c
union all select cid, 7, 'scenario_exam', 'Scenario exam', 'What would you do? 80% to pass.' from c
union all select cid, 8, 'practical_final', 'Practical final', 'Demonstrate the work against a checklist.' from c
union all select cid, 9, 'evidence', 'Evidence submission', 'Upload photo proof of your work.' from c
union all select cid, 10, 'approval', 'Manager approval', 'A manager reviews and approves.' from c
union all select cid, 11, 'recertification', 'Recertification', 'Stay current. Renew before expiry.' from c;

-- ================= STEP 1: READING (3 lessons) =================

with c as (select id as cid from public.training_courses where slug = 'move-in-move-out'),
st as (select step_number, id as sid from public.training_steps where course_id = (select cid from c))
insert into public.training_lessons (course_id, step_id, sort_order, kind, title, body, media_svg)
select (select cid from c), (select sid from st where step_number = 1), 1, 'reading', 'What a vacancy clean is, and the deposit-ready standard',
'A vacancy clean happens between tenants. The home is empty. No furniture, no belongings in the way. Your job is to make it look like no one ever lived there — ready for the next tenant or buyer to walk in.

THE DEPOSIT-READY STANDARD

Most move-out cleans are tied to a security deposit. ''Deposit-ready'' means the home is cleaned to a standard where a landlord cannot fairly deduct cleaning costs from the tenant''s deposit. That is a high bar. It means inside every cabinet, behind every appliance you can safely move, on top of every door frame, and inside the oven.

This is deeper than a maintenance clean. A maintenance clean keeps a lived-in home nice. A vacancy clean resets an empty home to like-new.

WHO JUDGES YOUR WORK

Usually a landlord or property manager, sometimes with a checklist. They will open cabinets, run a finger along baseboards, and look inside the oven and refrigerator. Assume every surface will be inspected. Clean like someone is checking with a flashlight — because they might be.

PHOTOS PROTECT EVERYONE

Take before and after photos of every room, inside appliances, and any damage you find. Photos prove the condition you left the home in. They also protect the company if a client claims something was missed. Make photo documentation a habit on every vacancy job.

WHAT IS USUALLY INCLUDED

A full vacancy clean typically covers: all rooms top to bottom; inside and outside of kitchen cabinets and drawers; appliances inside and out (oven, refrigerator, microwave, dishwasher); bathrooms deep-cleaned including grout and descaling; windows inside (sills and tracks); baseboards, door frames, and light fixtures; floors vacuumed and mopped last. Your company''s checklist is the final word — follow it exactly.

WHAT IS NOT YOUR JOB

You do not repair damage, paint walls, fix plumbing, or haul away a tenant''s abandoned belongings unless your scope specifically says so. If you find damage, mold, pests, or leftover belongings, document with photos and report to your supervisor or contact. Do not touch other people''s property.

THE MINDSET

An empty home shows everything. There is nowhere for dirt to hide and no furniture to cover misses. Work slowly, follow the system, and check your work like an inspector. Deposit-ready is not a slogan — it is the standard you are paid to hit.

MOVE-IN CLEANS USE THE SAME STANDARD

Sometimes the job is reversed: a new tenant wants the home cleaned before moving in. The standard is identical — like no one was ever there. Vacancy dust, construction residue, and stale air all get the same top-to-bottom treatment. Whether someone is leaving or arriving, deposit-ready detail is what you deliver.', null
union all select (select cid from c), (select sid from st where step_number = 1), 2, 'reading', 'The top-to-bottom empty-home system',
'An empty home lets you work in the perfect order. Learn it and never deviate.

ROOM ORDER

Start with the kitchen — it is the hardest room and sets the pace. Then bathrooms. Then bedrooms and living areas. Laundry and utility areas fit wherever they fall. Floors throughout the home are done at the very end, after all rooms are detailed, so you only mop once.

WITHIN EACH ROOM: TOP TO BOTTOM

1. Ceiling: vents, light fixtures, cobwebs, ceiling fan.
2. Walls: spot-clean marks and scuffs.
3. Windows: glass inside, sills, and tracks (vacuum tracks first).
4. Fixtures and surfaces: counters, shelves, switch plates, door frames, tops of doors.
5. Cabinets and drawers: inside and out — remove old shelf liner, wipe every shelf.
6. Baseboards: vacuum then wipe.
7. Floor: last. Vacuum edges and corners, then mop.

WHY THIS ORDER

Everything you do drops a little dirt downward. If you mop first and dust shelves after, you redo the floor. Top-to-bottom means each step lands on an area you have not finished yet. One pass, no rework.

DRY BEFORE WET

Vacuum and dust before any wet cleaning. In an empty home, dust is heavy — construction dust, months of buildup. Vacuum tracks, corners, and baseboard edges before wiping them.

THE KITCHEN DEEP SEQUENCE

Kitchens make or break a vacancy clean. Work it in this order: apply oven cleaner or degreaser first so it works while you do other tasks. Then clean inside cabinets and drawers. Then the refrigerator (empty, shelves out, washed, seals wiped). Then countertops and backsplash. Then the stovetop and microwave. Then the sink and faucet. Wipe appliance exteriors. Come back to the oven last. Floor is part of the final whole-home mop.

BATHROOM DEEP SEQUENCE

Apply descaler to the shower, tub, and toilet bowl first so it works while you clean elsewhere. Then mirrors and fixtures. Then counters and sink. Then scrub and rinse the shower and tub — grout lines need attention. Then the toilet: inside, outside, base, and behind. Then vanity interiors. Floor joins the final mop.

Do not rush the chemistry. Products need time to work. Apply early, do other tasks, come back and rinse. That is how professionals beat soap scum without endless scrubbing.

DO NOT FORGET THE SMALL SPACES

Closets, pantries, and laundry areas are easy to rush past, but inspectors open them. Wipe closet shelves and rods, clean pantry shelves inside and out, and detail the laundry area including behind the washer and dryer if reachable. Small spaces take minutes and fail inspections when skipped.', null
union all select (select cid from c), (select sid from st where step_number = 1), 3, 'reading', 'Appliances, bathrooms, floors, and the final walkthrough',
'APPLIANCES: WHERE DEPOSITS ARE WON AND LOST

Oven: clean the interior walls, door glass (inside and out), racks, and stovetop. Follow your company''s product directions — oven cleaner is strong stuff. Wear gloves, ventilate, and never mix products. If the oven has a self-clean cycle, check your scope before running it.

Refrigerator: it must be empty and off or unplugged per your instructions. Remove shelves and drawers, wash them, wipe the interior walls, clean the door seals (mold loves seals), and wipe the exterior including the top.

Microwave: inside, outside, and the turntable plate. Dishwasher: wipe the door, edges, and seals; run an empty cycle only if your scope says so.

BATHROOMS: THE DETAIL ZONES

Descale showerheads, faucets, and glass. Scrub grout lines — in a vacancy clean, grout must look renewed, not just wiped. Clean the toilet completely: tank, handle, seat, bowl, exterior, base, and the floor behind it. Wipe vanity interiors. Polish mirrors streak-free. Replace nothing without permission, but report anything broken.

FLOORS LAST — THE WHOLE HOME AT ONCE

Once every room is detailed, vacuum the entire home: edges, corners, closets, under where appliances were. Then damp-mop hard floors from the farthest point toward the exit, so you never walk on a wet floor. Let floors dry before the walkthrough.

SAFETY IN EMPTY HOMES

Ventilate: open windows when using strong products. Never use unknown chemicals left behind by tenants — tell your supervisor. Use a stable step stool (never a chair) for high areas, on flat ground. If the power or water is off, tell your supervisor before starting — you cannot do a vacancy clean without them.

THE FINAL WALKTHROUGH

This is the most important 15 minutes of the job. Go room by room with your checklist and good lighting. Open every cabinet. Look inside the oven and fridge. Crouch to check baseboards and floors at an angle. Use your phone flashlight in dark corners. Fix everything you find before you leave. Then take your after photos.

A vacancy clean is finished when it passes your own inspection — because the landlord''s inspection is coming next.

CONFIRM UTILITIES BEFORE YOU START

Before you unpack a single product, confirm the power and water are on. Test a faucet and flip a light switch. If either is off, stop and call your supervisor — you cannot do a vacancy clean without water for mopping and rinsing or light for detail work. Discovering this an hour in wastes everyone''s time. Thirty seconds of checking at arrival saves the whole job.', null;

-- ================= STEP 2: VISUAL (2 lessons with SVG) =================

with c as (select id as cid from public.training_courses where slug = 'move-in-move-out'),
st as (select step_number, id as sid from public.training_steps where course_id = (select cid from c))
insert into public.training_lessons (course_id, step_id, sort_order, kind, title, body, media_svg)
select (select cid from c), (select sid from st where step_number = 2), 1, 'visual', 'Vacancy clean: room and task order',
'Memorize this order. Kitchen first (hardest), then bathrooms, then bedrooms and living areas. Within every room: top to bottom. Floors across the whole home come last, mopped toward the exit.

Apply strong products (oven cleaner, descaler) FIRST so chemistry works while you clean elsewhere. Come back to rinse later. This is the professional''s time trick: let the product do the scrubbing.',
'<svg width="460" height="340" xmlns="http://www.w3.org/2000/svg"><rect x="10" y="10" width="440" height="320" rx="12" fill="#f8fafc" stroke="#cbd5e1"/><text x="230" y="45" text-anchor="middle" font-size="16" font-weight="bold" fill="#0f172a">VACANCY CLEAN ORDER</text><g font-size="13" fill="#0f172a"><rect x="30" y="65" width="400" height="38" rx="8" fill="#fee2e2" stroke="#dc2626"/><text x="45" y="89">1. KITCHEN — apply oven cleaner + degreaser first</text><rect x="30" y="111" width="400" height="38" rx="8" fill="#fef3c7" stroke="#d97706"/><text x="45" y="135">2. BATHROOMS — apply descaler first, scrub later</text><rect x="30" y="157" width="400" height="38" rx="8" fill="#dbeafe" stroke="#3b82f6"/><text x="45" y="181">3. BEDROOMS + LIVING — top to bottom, cabinets inside/out</text><rect x="30" y="203" width="400" height="38" rx="8" fill="#e2e8f0" stroke="#64748b"/><text x="45" y="227">4. LAUNDRY / UTILITY — as they fall</text><rect x="30" y="249" width="400" height="38" rx="8" fill="#dcfce7" stroke="#16a34a"/><text x="45" y="273">5. FLOORS LAST — vacuum all, mop toward the exit</text></g><text x="230" y="310" text-anchor="middle" font-size="12" font-weight="bold" fill="#0f172a">Final walkthrough with checklist + flashlight</text></svg>'
union all select (select cid from c), (select sid from st where step_number = 2), 2, 'visual', 'Appliance detail map: what ''clean'' means',
'For each appliance, ''clean'' has a specific meaning in a vacancy job. Use this as your mental checklist.

OVEN: interior walls, door glass inside and out, racks, stovetop, knobs. REFRIGERATOR: interior walls, shelves and drawers removed and washed, door seals, exterior and top. MICROWAVE: interior, turntable, exterior. DISHWASHER: door, edges, seals.

Door seals and tracks are where inspectors look. If you only remember one detail: clean the seals.',
'<svg width="460" height="300" xmlns="http://www.w3.org/2000/svg"><rect x="10" y="10" width="440" height="280" rx="12" fill="#f8fafc" stroke="#cbd5e1"/><text x="230" y="45" text-anchor="middle" font-size="16" font-weight="bold" fill="#0f172a">APPLIANCE DETAIL MAP</text><g font-size="12" fill="#0f172a"><rect x="30" y="65" width="190" height="90" rx="8" fill="#ffffff" stroke="#94a3b8"/><text x="45" y="88" font-weight="bold">OVEN</text><text x="45" y="108">- Interior walls</text><text x="45" y="126">- Door glass, in + out</text><text x="45" y="144">- Racks + stovetop</text><rect x="240" y="65" width="190" height="90" rx="8" fill="#ffffff" stroke="#94a3b8"/><text x="255" y="88" font-weight="bold">REFRIGERATOR</text><text x="255" y="108">- Interior + shelves</text><text x="255" y="126">- Door seals</text><text x="255" y="144">- Exterior + top</text><rect x="30" y="170" width="190" height="90" rx="8" fill="#ffffff" stroke="#94a3b8"/><text x="45" y="193" font-weight="bold">MICROWAVE</text><text x="45" y="213">- Interior walls</text><text x="45" y="231">- Turntable plate</text><text x="45" y="249">- Exterior</text><rect x="240" y="170" width="190" height="90" rx="8" fill="#ffffff" stroke="#94a3b8"/><text x="255" y="193" font-weight="bold">DISHWASHER</text><text x="255" y="213">- Door + edges</text><text x="255" y="231">- Seals</text><text x="255" y="249">- Exterior front</text></g></svg>';

-- ================= STEP 3: WORKED EXAMPLE =================

with c as (select id as cid from public.training_courses where slug = 'move-in-move-out'),
st as (select step_number, id as sid from public.training_steps where course_id = (select cid from c))
insert into public.training_lessons (course_id, step_id, sort_order, kind, title, body, media_svg)
select (select cid from c), (select sid from st where step_number = 3), 1, 'worked_example', 'Worked example: 2-bed apartment move-out in 5 hours',
'THE JOB: A 950 sq ft, 2-bedroom, 1-bath apartment. Tenant moved out yesterday. Property manager''s checklist requires deposit-ready. You have 5 hours. Power and water are on.

HOUR 1: DOCUMENT AND ATTACK THE KITCHEN
Take before photos of every room. Open windows for ventilation. In the kitchen, apply oven cleaner per directions and close the door. Apply degreaser to the stovetop hood. While chemistry works: empty all cabinets and drawers, remove old shelf liner, wipe every shelf inside and out. Pull out the refrigerator (it slides easily): sweep and mop behind it. Empty the fridge, remove shelves and drawers, wash them in the sink, wipe interior walls and door seals.

HOUR 2: FINISH KITCHEN, START BATHROOM
Scrub and rinse the oven interior, clean door glass inside and out, replace racks. Wipe stovetop, microwave inside and out including turntable, counters, backsplash, sink and faucet. Wipe appliance exteriors and tops. Move to the bathroom: apply descaler to shower, tub, toilet bowl, and sink. Let it work. Meanwhile: mirror, light fixtures, counter.

HOUR 3: BATHROOM DETAIL
Scrub and rinse the shower and tub — grout lines get a brush, not just a wipe. Toilet: tank, handle, seat, bowl, exterior, base, and the floor behind it. Vanity interior wiped. Polish the mirror. The bathroom now looks renewed.

HOUR 4: BEDROOMS, LIVING ROOM, WINDOWS
Both bedrooms and the living room: ceiling vents and fans, spot-clean walls, window glass inside plus sills and tracks (vacuum tracks first), closet shelves and rods, baseboards vacuumed then wiped, door frames and tops of doors, switch plates. Empty, so it moves fast — but every surface gets touched.

HOUR 5: FLOORS AND WALKTHROUGH
Vacuum the entire apartment: edges, corners, closets, behind where the fridge was. Damp-mop hard floors from the far bedroom toward the front door. Let floors dry 10 minutes. Final walkthrough with the property manager''s checklist and your phone flashlight: open every cabinet, look inside the oven and fridge, crouch for baseboards. You find a missed window track — vacuum and wipe it. Take after photos of every room.

DONE IN 5 HOURS. Notice the time tricks: strong products applied first so chemistry did the heavy lifting. Kitchen and bathroom — the inspection hotspots — got the most time. Floors mopped once, at the end, toward the exit. Photos before and after. Nothing left for the inspector to find.', null;

-- ================= STEP 4: GUIDED PRACTICE (2 lessons) =================

with c as (select id as cid from public.training_courses where slug = 'move-in-move-out'),
st as (select step_number, id as sid from public.training_steps where course_id = (select cid from c))
insert into public.training_lessons (course_id, step_id, sort_order, kind, title, body, media_svg)
select (select cid from c), (select sid from st where step_number = 4), 1, 'guided_practice', 'Practice 1: order the vacancy clean',
'Put each list in the correct order. Answers at the bottom.

EXERCISE A: Room order. Steps: bedrooms and living areas, kitchen, floors throughout, bathrooms.
Correct order: ___, ___, ___, ___.

EXERCISE B: Kitchen deep sequence. Steps: wipe counters and sink, apply oven cleaner first, mop the floor, clean cabinets inside and out, scrub and rinse the oven.
Correct order: ___, ___, ___, ___, ___.

EXERCISE C: Bathroom deep sequence. Steps: mop the floor, apply descaler first, scrub and rinse shower/tub, clean mirror and counters, clean the toilet fully.
Correct order: ___, ___, ___, ___, ___.

ANSWERS
A: kitchen, bathrooms, bedrooms and living areas, floors throughout last.
B: apply oven cleaner first, cabinets inside and out, counters and sink, scrub and rinse the oven, floor last.
C: apply descaler first, mirror and counters, shower/tub scrub and rinse, toilet fully, floor last.

The rule behind every answer: hardest rooms first, strong products applied early, top to bottom, floors last.', null
union all select (select cid from c), (select sid from st where step_number = 4), 2, 'guided_practice', 'Practice 2: deposit-ready or not?',
'For each, say whether it meets the deposit-ready standard, and why. Answers at the bottom.

1. The oven door glass is clean on the outside. The inside of the door was not wiped.
2. All cabinets were wiped inside. One drawer still has crumbs in the corners.
3. The bathroom looks clean. The grout lines still show soap scum.
4. Floors were mopped. The window tracks still hold dirt.
5. The refrigerator interior is spotless. The top of the refrigerator is dusty.

ANSWERS
1. NOT deposit-ready. Inspectors open the oven door and check inside glass.
2. NOT deposit-ready. Every drawer must be crumb-free — corners included.
3. NOT deposit-ready. Grout must look renewed in a vacancy clean, not just wiped.
4. NOT deposit-ready. Tracks are a classic inspection point. Vacuum and wipe them.
5. NOT deposit-ready. Tops of appliances are always checked. Nothing is ''out of sight.''

Deposit-ready means every surface, inside and out, top to bottom. When in doubt, clean it.', null;

-- ================= STEP 5: SIMULATOR =================

with c as (select id as cid from public.training_courses where slug = 'move-in-move-out'),
st as (select step_number, id as sid from public.training_steps where course_id = (select cid from c))
insert into public.training_lessons (course_id, step_id, sort_order, kind, title, body, media_svg)
select (select cid from c), (select sid from st where step_number = 5), 1, 'simulator', 'Simulator: mold behind the fridge',
'Read the situation. Choose A, B, or C. Then read what happens.

SITUATION
You are two hours into a move-out clean. You pull the refrigerator away from the wall and find a patch of black mold, about the size of a dinner plate, on the wall behind it. The wall is damp. You have 3 hours left and a lot of cleaning to do.

OPTION A: Spray it with bleach, scrub it off, and keep cleaning. Do not mention it — the wall looks fine after.
OPTION B: Stop. Photograph the mold, do not disturb it further, tell your supervisor (or property contact) immediately, and continue cleaning the rest of the home.
OPTION C: Paint over it with paint from the maintenance closet so the inspector does not see it.

WHAT HAPPENS

Option A: Bleach does not fix mold inside a damp wall — it bleaches the color while the mold keeps growing. You also spread mold spores through the air by scrubbing. The mold returns, the new tenant gets sick, and the property manager traces it to your undocumented ''repair.'' You are liable.

Option C: Painting over mold is fraud and a health hazard. The mold keeps growing under the paint. When discovered, the company faces serious consequences — and so do you.

Option B: CORRECT. Mold remediation is not a cleaner''s job — it may need specialists and the property owner''s decision. Your job is to document, report, and not make it worse. Photos protect everyone. The supervisor decides the next step. You finish the rest of the clean professionally.

THE LESSON: You clean dirt — you do not remediate mold, repair leaks, or hide damage. Document with photos, report immediately, and keep cleaning what is yours to clean. Finding a problem and reporting it is doing your job well, not failing.', null;

-- ================= STEP 6: WRITTEN EXAM (24 questions: 8 groups x 3) =================

with c as (select id as cid from public.training_courses where slug = 'move-in-move-out')
insert into public.training_questions (course_id, kind, variant_group, question, choices, correct_index, explanation)
select (select cid from c), 'written', 'cleaning-order-vacant', 'In an empty home, the best room order is:', '["Bathrooms first, then kitchen, then bedrooms and living, floors last","Kitchen first, then bathrooms, then bedrooms and living, floors last","Living room first, then bathrooms","Floors first, then everything else"]'::jsonb, 1, 'Hardest rooms first, floors always last.'
union all select (select cid from c), 'written', 'cleaning-order-vacant', 'Within each empty room, you work:', '["Floor to ceiling","Top to bottom: vents, walls, windows, baseboards, floors last","Windows first, then ceiling","It does not matter in an empty home"]'::jsonb, 1, 'Top-to-bottom means dirt falls to unfinished areas.'
union all select (select cid from c), 'written', 'cleaning-order-vacant', 'Floors are cleaned last because:', '["They take the longest","All other work drops dirt onto them","They are the least important","Clients do not look at floors"]'::jsonb, 1, 'Every prior task drops dirt — floors get one final pass.'
union all select (select cid from c), 'written', 'appliances', 'A move-out clean of the refrigerator includes:', '["Wiping the outside only","Inside shelves, drawers, door seals, and exterior — emptied and wiped","Unplugging it permanently","Only the freezer"]'::jsonb, 1, 'Deposit-ready means the whole appliance, especially seals.'
union all select (select cid from c), 'written', 'appliances', 'For a dirty oven in a move-out clean, you should:', '["Wipe the door glass only","Clean interior, racks, door, and stovetop per the required standard","Pour water inside and close the door","Skip ovens — tenants clean those"]'::jsonb, 1, 'Ovens are a top inspection point — interior, glass, racks, stovetop.'
union all select (select cid from c), 'written', 'appliances', 'Before cleaning inside a refrigerator, you must:', '["Turn the temperature to coldest","Make sure it is empty and off or unplugged as instructed","Fill it with cleaner and close the door","Remove the doors"]'::jsonb, 1, 'Empty and powered per instructions before you start.'
union all select (select cid from c), 'written', 'cabinets-drawers', 'Kitchen cabinets in a vacancy clean need:', '["Exteriors only","Inside and out, including shelves and drawer interiors","Painting","Only the handles"]'::jsonb, 1, 'Inspectors open every cabinet — insides must be spotless.'
union all select (select cid from c), 'written', 'cabinets-drawers', 'You find crumbs and old shelf liner in a cabinet. You should:', '["Close the door and move on","Remove the liner and wipe the shelf clean","Spray air freshener inside","Leave it for the new tenant"]'::jsonb, 1, 'Remove liner, wipe clean — no shortcuts inside cabinets.'
union all select (select cid from c), 'written', 'cabinets-drawers', 'Bathroom vanity interiors should be:', '["Skipped — nobody opens them","Emptied per instructions, wiped inside and out","Filled with cleaner","Locked"]'::jsonb, 1, 'Vanity interiors get opened on inspection — wipe them.'
union all select (select cid from c), 'written', 'bathrooms-deep', 'A move-out bathroom clean includes descaling because:', '["It looks impressive","Hard water and soap buildup will cost deposit money if left","Descaler smells nice","It is faster than wiping"]'::jsonb, 1, 'Buildup left behind becomes a deposit deduction.'
union all select (select cid from c), 'written', 'bathrooms-deep', 'Grout lines in a vacant bathroom should be:', '["Ignored","Scrubbed clean of soap scum and mildew","Painted over","Covered with a rug"]'::jsonb, 1, 'Grout must look renewed — scrub, do not just wipe.'
union all select (select cid from c), 'written', 'bathrooms-deep', 'The toilet in a move-out must be:', '["Flushed once","Cleaned inside, outside, base, and behind — like new","Replaced","Only the lid wiped"]'::jsonb, 1, 'Like-new means every part, including behind and the base.'
union all select (select cid from c), 'written', 'deposit-standard', '''Deposit-ready'' means the home is cleaned to a standard where:', '["It looks okay from the doorway","A landlord cannot fairly deduct cleaning costs from the deposit","It smells nice","The floors are damp"]'::jsonb, 1, 'Deposit-ready is the financial standard — no fair deductions.'
union all select (select cid from c), 'written', 'deposit-standard', 'If you are unsure whether something meets the deposit-ready standard, you should:', '["Leave it — close enough","Check your company checklist and ask your supervisor","Guess","Ask the new tenant"]'::jsonb, 1, 'The checklist plus your supervisor settles every doubt.'
union all select (select cid from c), 'written', 'deposit-standard', 'Photos of your finished work matter because:', '["They are for social media","They prove the condition you left the home in","They are not needed","Clients never look at them"]'::jsonb, 1, 'Photos are your proof against false damage or miss claims.'
union all select (select cid from c), 'written', 'windows-tracks', 'Window tracks and sills in a vacancy clean should be:', '["Skipped — too much detail","Vacuumed and wiped — dirt collects heavily there","Painted","Only the glass matters"]'::jsonb, 1, 'Tracks are a classic inspection point — vacuum then wipe.'
union all select (select cid from c), 'written', 'windows-tracks', 'Blinds in a move-out are:', '["Taken down and thrown away","Dusted and wiped slat by slat if required","Left dusty — tenants replace them","Sprayed with water only"]'::jsonb, 1, 'Blinds get detailed per scope — slat by slat when required.'
union all select (select cid from c), 'written', 'windows-tracks', 'Interior window glass should be cleaned:', '["With paper towels and water","With proper glass cleaner and a lint-free cloth, edge to edge","Only if visibly dirty","With abrasive pads"]'::jsonb, 1, 'Edge-to-edge glass cleaner with lint-free cloth, no abrasives.'
union all select (select cid from c), 'written', 'products-safety-vacant', 'In an empty home with poor ventilation, you should:', '["Use the strongest chemicals to finish fast","Ventilate, use products as directed, and take fresh-air breaks","Hold your breath","Mix products for extra strength"]'::jsonb, 1, 'Ventilation plus label directions keeps you safe.'
union all select (select cid from c), 'written', 'products-safety-vacant', 'A step stool for high areas must be:', '["Any chair available","Stable, rated for your weight, on a flat surface","Skipped — jump instead","Leaned against windows"]'::jsonb, 1, 'Proper step stool only — never chairs, never jumping.'
union all select (select cid from c), 'written', 'products-safety-vacant', 'You find old chemicals left under a vacant home''s sink. You should:', '["Use them to save product","Not use unknown chemicals — tell your supervisor","Mix them together","Pour them down the drain"]'::jsonb, 1, 'Unknown chemicals are never used. Report them.'
union all select (select cid from c), 'written', 'final-walkthrough', 'The final walkthrough of a vacancy clean is done:', '["Quickly from the front door","Slowly, room by room, with your checklist and good lighting","By the client only","It is not needed"]'::jsonb, 1, 'Slow, room-by-room, checklist in hand — this is the inspection.'
union all select (select cid from c), 'written', 'final-walkthrough', 'The best way to spot missed spots during the final check is:', '["Look straight ahead","Crouch to different angles and use your phone flashlight","Close your eyes","Ask a neighbor"]'::jsonb, 1, 'Angles and flashlight reveal what overhead light hides.'
union all select (select cid from c), 'written', 'final-walkthrough', 'If the final walkthrough finds a missed area, you should:', '["Leave it — you already walked through","Fix it before you leave","Note it for next time","Blame the lighting"]'::jsonb, 1, 'The walkthrough exists so you fix misses before leaving.';

-- ================= STEP 7: SCENARIO EXAM (10 questions: 5 groups x 2) =================

with c as (select id as cid from public.training_courses where slug = 'move-in-move-out')
insert into public.training_questions (course_id, kind, variant_group, question, choices, correct_index, explanation)
select (select cid from c), 'scenario', 'damage-found', 'Behind the refrigerator you find black mold on the wall. The wall is damp. You should:', '["Scrub it with bleach and say nothing","Stop, photograph it, tell your supervisor — mold may need specialists","Paint over it","Cover it with the fridge and move on"]'::jsonb, 1, 'Mold is not a cleaning task — document, report, do not disturb.'
union all select (select cid from c), 'scenario', 'damage-found', 'You find a broken tile and a leaking pipe under a sink. You should:', '["Fix the pipe yourself","Document with photos and report to your supervisor or contact immediately","Mop the water and ignore the leak","Finish cleaning and mention it next week"]'::jsonb, 1, 'Damage and leaks get documented and reported at once — never repaired by cleaners.'
union all select (select cid from c), 'scenario', 'behind-schedule', 'You are 2 hours behind on a move-out with a hard deadline. You should:', '["Skip rooms to finish on time","Call your supervisor for help or a plan — never silently skip work","Do a rushed job on everything","Leave without finishing"]'::jsonb, 1, 'Get help or a plan — silent skipping fails inspection.'
union all select (select cid from c), 'scenario', 'behind-schedule', 'The home is far dirtier than the quote assumed. You should:', '["Work unpaid overtime","Tell your supervisor so the scope or price can be adjusted","Do half the home well","Complain to the property manager"]'::jsonb, 1, 'Scope changes go through your supervisor for re-quote.'
union all select (select cid from c), 'scenario', 'missing-supplies', 'You run out of degreaser halfway through a greasy kitchen. You should:', '["Use dish soap and hot water creatively, or call your supervisor for supplies","Use an unknown chemical left under the sink","Skip the kitchen","Dilute bleach heavily and use it on everything"]'::jsonb, 0, 'Improvise safely with known products or get supplies — never unknown chemicals.'
union all select (select cid from c), 'scenario', 'missing-supplies', 'Your vacuum breaks in a dusty empty house. You should:', '["Sweep with a broom as best you can and report the vacuum","Leave the dust — not your fault","Use the tenant''s vacuum without asking","Quit for the day"]'::jsonb, 0, 'Do the best safe job with what you have and report the equipment.'
union all select (select cid from c), 'scenario', 're-clean-request', 'The property manager says the bathrooms failed inspection and wants a re-clean. You should:', '["Argue that they were clean","Return promptly, fix the issues graciously, and learn what was missed","Refuse — the job is done","Charge double"]'::jsonb, 1, 'Gracious re-cleans protect the client relationship and teach you the standard.'
union all select (select cid from c), 'scenario', 're-clean-request', 'A tenant claims you missed the inside of the oven. Your photos show it was cleaned. You should:', '["Send the photos politely and offer to re-wipe it","Ignore the complaint","Argue loudly","Delete the photos"]'::jsonb, 0, 'Photos plus a polite offer resolve most disputes fast.'
union all select (select cid from c), 'scenario', 'locked-room', 'One bedroom is locked and you have no key. You should:', '["Pick the lock","Clean everything else, note the locked room, and tell your contact","Break the door down","Climb through the window"]'::jsonb, 1, 'Never force entry — clean the rest, document, and report.'
union all select (select cid from c), 'scenario', 'locked-room', 'The garage is full of the tenant''s leftover belongings. Your scope says ''empty home.'' You should:', '["Throw everything away","Not touch others'' belongings — report to your contact for instructions","Donate it all","Clean around it silently"]'::jsonb, 1, 'Other people''s property is never yours to move or discard.';

-- ================= STEP 8: PRACTICAL =================

with c as (select id as cid from public.training_courses where slug = 'move-in-move-out')
insert into public.training_practicals (course_id, title, instructions, checklist)
select (select cid from c), 'Deposit-ready apartment clean',
'Perform a complete move-out clean of an apartment or home to the deposit-ready standard. Follow your company''s checklist exactly, document with before/after photos, and finish with a full walkthrough. Your manager will observe or review photos.',
'["Took before photos of every room and any damage found","Worked the room order: kitchen, bathrooms, bedrooms/living, floors last","Applied oven cleaner and descaler early so chemistry worked while cleaning elsewhere","Cleaned all cabinets and drawers inside and out — no crumbs, no old liner","Oven fully detailed: interior, door glass in and out, racks, stovetop","Refrigerator fully detailed: interior, shelves, door seals, exterior and top","Bathrooms deep-cleaned: descaled fixtures, scrubbed grout, toilet like new","Windows: glass, sills, and tracks vacuumed and wiped; blinds detailed per scope","Vacuumed entire home including edges, corners, and closets; mopped toward the exit","Reported any damage, mold, or leftover belongings with photos — did not hide or fix them","Performed a slow final walkthrough with checklist and flashlight; fixed every miss","Took after photos — home is deposit-ready with zero fair deductions possible"]'::jsonb;
