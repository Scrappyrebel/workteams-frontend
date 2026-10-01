-- Seed: Introduction to Commercial Cleaning (intro-commercial-cleaning)
-- Run AFTER 021_training_academy.sql in the WorkTeams Supabase project.

delete from public.training_questions where course_id = (select id from public.training_courses where slug = 'intro-commercial-cleaning');
delete from public.training_lessons where course_id = (select id from public.training_courses where slug = 'intro-commercial-cleaning');
delete from public.training_practicals where course_id = (select id from public.training_courses where slug = 'intro-commercial-cleaning');
delete from public.training_steps where course_id = (select id from public.training_courses where slug = 'intro-commercial-cleaning');
delete from public.training_courses where slug = 'intro-commercial-cleaning';

insert into public.training_courses (slug, title, description, category, department, sort_order, estimated_hours, recert_months)
values ('intro-commercial-cleaning', 'Introduction to Commercial Cleaning', 'The foundation every cleaner needs: tools, chemicals, safety, and the professional systems for offices and commercial buildings.', 'cleaning', 'Core Skills', 1, 4, 12);

with c as (select id as cid from public.training_courses where slug = 'intro-commercial-cleaning')
insert into public.training_steps (course_id, step_number, step_key, title, description)
select cid, 1, 'reading', 'Reading: commercial cleaning fundamentals', 'What the job is, the tools, chemicals, and safety rules.' from c
union all select cid, 2, 'visual', 'Visual guide: caddy setup and cleaning order', 'Diagrams that reinforce the reading.' from c
union all select cid, 3, 'worked_example', 'Worked example: a 2,000 sq ft office', 'A complete job worked start to finish.' from c
union all select cid, 4, 'guided_practice', 'Guided practice: caddy and dilution', 'Practice with coaching and checkpoints.' from c
union all select cid, 5, 'simulator', 'Simulator: your first solo office', 'Handle surprises safely before the real thing.' from c
union all select cid, 6, 'written_exam', 'Written exam', 'Randomized questions. 80% to pass.' from c
union all select cid, 7, 'scenario_exam', 'Scenario exam', 'What would you do? 80% to pass.' from c
union all select cid, 8, 'practical_final', 'Practical final: clean to standard', 'Demonstrate the work against a checklist.' from c
union all select cid, 9, 'evidence', 'Evidence submission', 'Upload photo proof of your work.' from c
union all select cid, 10, 'approval', 'Manager approval', 'A manager reviews and approves.' from c
union all select cid, 11, 'recertification', 'Recertification', 'Stay current. Renew before expiry.' from c;

-- ============ STEP 1: READING ============

with c as (select id as cid from public.training_courses where slug = 'intro-commercial-cleaning'),
st as (select step_number, id as sid from public.training_steps where course_id = (select cid from c))
insert into public.training_lessons (course_id, step_id, sort_order, kind, title, body, media_svg)
select (select cid from c), (select sid from st where step_number = 1), 1, 'reading', 'What commercial cleaning really is',
'Commercial cleaning means cleaning buildings where people work: offices, banks, churches, schools, medical waiting rooms, and storefronts. You usually clean after hours or before opening, when the building is empty.

What the client is actually buying is three things. First, health: fewer germs on the surfaces people touch all day — door handles, light switches, restrooms, break rooms. Second, appearance: a building that looks cared for tells their customers they are professional. Third, consistency: the same clean, every single visit. Anyone can clean well once. A professional cleans well every time.

You are also being trusted. You will have keys or codes to someone else''s building. You will see desks, papers, and personal items. The rule is simple: you touch nothing that is not yours to clean. You do not read papers, open drawers, use computers, or take anything — not even a pen. Trust is the whole business. One broken-trust story can lose a contract that took months to win.

Professionalism shows in small things. Arrive on time, every time. Wear the company shirt. Tie hair back. Keep your phone in your pocket except for clocking in and out. If something is broken or you cannot finish an area, tell your manager — do not hide it. Clients forgive a problem they hear about. They do not forgive a problem they discover.

Finally, you represent every cleaner who comes after you. A sloppy job tonight means the client questions the price tomorrow. A great job, done quietly and consistently, is how small companies grow.'
, null
union all select (select cid from c), (select sid from st where step_number = 1), 2, 'reading', 'Tools of the trade',
'You do not need fancy equipment to clean an office well. You need the right basics, kept clean and organized. Here is what lives in a standard cleaning caddy.

Microfiber cloths are your most important tool. They grab dust and dirt instead of pushing it around. Use them damp, not dripping. Fold a cloth into quarters — that gives you eight clean faces. When one face is dirty, flip to a fresh face. When all eight are used, grab a fresh cloth. Never use a dirty cloth and expect a clean result.

Color coding keeps germs where they belong. The standard most companies use: RED for restrooms (toilets and urinals), YELLOW for restroom sinks and mirrors, GREEN for kitchens and break rooms, BLUE for general dusting — desks, windowsills, doors. A restroom cloth never touches a desk. Ever. This one habit prevents more illness than any chemical.

Your caddy should hold: microfiber cloths in each color, an all-purpose spray, a glass cleaner, a disinfectant, a restroom bowl cleaner, trash bags, gloves, and a putty knife or scraper for stuck-on spots. Everything has a place. When you can reach for a tool without looking, you work twice as fast.

For floors you will use: a dust mop or vacuum for hard floors, a damp mop and bucket (or flat mop system) for mopping, and a vacuum with attachments for carpet. Vacuum slowly — one slow pass beats three fast ones. Empty the vacuum or shake the dust mop outside, not in the client''s trash can.

Take care of your tools and they take care of you. Rinse mop heads and hang them to dry. Launder microfiber without fabric softener — softener coats the fibers and ruins them. A professional''s tools look professional.'
, null
union all select (select cid from c), (select sid from st where step_number = 1), 3, 'reading', 'Chemicals and safety',
'Cleaning chemicals are safe when you respect them and dangerous when you do not. There are four types you will use most.

1. All-purpose cleaner: for desks, counters, doors, and general soil. Your everyday workhorse.
2. Glass cleaner: for mirrors and glass. Spray the cloth, not the glass, to avoid drips on sills.
3. Disinfectant: kills germs on high-touch surfaces — door handles, light switches, restroom fixtures. It only works if the surface stays wet for the DWELL TIME on the label, usually 3 to 10 minutes. Spraying and instantly wiping is just expensive water.
4. Restroom bowl cleaner: acid-based, for inside toilets only. Never use it on anything else.

Dilution means mixing concentrate with water at the ratio on the label, like 1 ounce per gallon. More chemical is NOT better — it leaves sticky residue that attracts dirt, and it can damage surfaces. Measure. The label is the law.

PPE means personal protective equipment: gloves at minimum, every time you handle chemicals. Add goggles when spraying overhead or using restroom bowl cleaner. If a chemical splashes in your eyes, flush with water for 15 minutes and tell your manager.

Three rules that are never broken:
- NEVER mix chemicals. Bleach mixed with ammonia or acids makes toxic gas that can kill. If you do not know what is in a bottle, do not mix it with anything.
- Read the label before you use a product the first time. It tells you the dilution, the dwell time, and the PPE.
- Store chemicals in labeled bottles, upright, away from heat. Never put chemicals in drink bottles.

If you feel dizzy, get a headache, or your skin burns: stop, get fresh air, rinse with water, and tell your manager immediately. No job is worth your health.'
, null;

-- ============ STEP 2: VISUALS ============

with c as (select id as cid from public.training_courses where slug = 'intro-commercial-cleaning'),
st as (select step_number, id as sid from public.training_steps where course_id = (select cid from c))
insert into public.training_lessons (course_id, step_id, sort_order, kind, title, body, media_svg)
select (select cid from c), (select sid from st where step_number = 2), 1, 'visual', 'Your caddy, set up right',
'Everything in your caddy has a home. When every item is in the same spot every night, you never waste time hunting for a bottle, and you never leave a tool behind at a building.

Study the diagram. Then set up your own caddy to match before your first shift.',
'<svg width="460" height="330" xmlns="http://www.w3.org/2000/svg"><rect x="8" y="8" width="444" height="314" rx="14" fill="#f8fafc" stroke="#cbd5e1"/><text x="230" y="42" text-anchor="middle" font-size="19" font-weight="bold" fill="#0f172a">Cleaning caddy layout</text><rect x="60" y="70" width="340" height="180" rx="10" fill="#e2e8f0" stroke="#94a3b8"/><text x="90" y="100" font-size="14" fill="#0f172a">All-purpose spray</text><text x="90" y="125" font-size="14" fill="#0f172a">Glass cleaner</text><text x="90" y="150" font-size="14" fill="#0f172a">Disinfectant</text><text x="90" y="175" font-size="14" fill="#0f172a">Bowl cleaner</text><text x="90" y="200" font-size="14" fill="#0f172a">Trash bags</text><text x="260" y="100" font-size="14" fill="#0f172a">Red cloths</text><text x="260" y="125" font-size="14" fill="#0f172a">Yellow cloths</text><text x="260" y="150" font-size="14" fill="#0f172a">Green cloths</text><text x="260" y="175" font-size="14" fill="#0f172a">Blue cloths</text><text x="260" y="200" font-size="14" fill="#0f172a">Gloves + scraper</text><text x="230" y="285" text-anchor="middle" font-size="14" fill="#475569">Heavy bottles low. Cloths where you can grab them fast.</text></svg>'
union all select (select cid from c), (select sid from st where step_number = 2), 2, 'visual', 'The top-to-bottom, back-to-front system',
'Professionals clean every room the same way: start at the door, work toward the back, and work from high surfaces down to the floor. Dust falls down — if you mop first and dust second, you mop twice.

Study the diagram. This order never changes: trash first, then high dusting, then surfaces, then glass, then restrooms, then floors last.',
'<svg width="460" height="360" xmlns="http://www.w3.org/2000/svg"><rect x="8" y="8" width="444" height="344" rx="14" fill="#f8fafc" stroke="#cbd5e1"/><text x="230" y="42" text-anchor="middle" font-size="19" font-weight="bold" fill="#0f172a">Room order: top to bottom, door to back</text><rect x="120" y="70" width="220" height="180" fill="#ffffff" stroke="#94a3b8"/><text x="230" y="60" text-anchor="middle" font-size="13" fill="#475569">DOOR</text><rect x="120" y="70" width="220" height="36" fill="#dbeafe"/><text x="230" y="93" text-anchor="middle" font-size="13" fill="#0f172a">1. Trash (all of it)</text><rect x="120" y="106" width="220" height="36" fill="#fef3c7"/><text x="230" y="129" text-anchor="middle" font-size="13" fill="#0f172a">2. High dusting</text><rect x="120" y="142" width="220" height="36" fill="#dcfce7"/><text x="230" y="165" text-anchor="middle" font-size="13" fill="#0f172a">3. Surfaces + glass</text><rect x="120" y="178" width="220" height="36" fill="#fce7f3"/><text x="230" y="201" text-anchor="middle" font-size="13" fill="#0f172a">4. Restrooms</text><rect x="120" y="214" width="220" height="36" fill="#e0e7ff"/><text x="230" y="237" text-anchor="middle" font-size="13" fill="#0f172a">5. Floors LAST</text><text x="230" y="290" text-anchor="middle" font-size="14" fill="#475569">Work door to back so you never</text><text x="230" y="312" text-anchor="middle" font-size="14" fill="#475569">walk across a floor you just cleaned.</text></svg>';

-- ============ STEP 3: WORKED EXAMPLE ============

with c as (select id as cid from public.training_courses where slug = 'intro-commercial-cleaning'),
st as (select step_number, id as sid from public.training_steps where course_id = (select cid from c))
insert into public.training_lessons (course_id, step_id, sort_order, kind, title, body, media_svg)
select (select cid from c), (select sid from st where step_number = 3), 1, 'worked_example', 'A 2,000 sq ft office, start to finish',
'Follow Maria as she cleans a small insurance office: a lobby, 6 offices, 2 restrooms, a break room, and hallways. 2,000 square feet, one cleaner, about 2.5 hours.

6:00 PM — Arrival. Maria parks, grabs her caddy, vacuum, and mop. She unlocks the front door with her key, disarms the alarm with her code, and turns on the lights. She clocks in on the app with GPS. First walk-through: she scans every room for anything unusual — a spill, a broken item, trash overflowing. Nothing odd tonight. She props no doors open.

6:10 — Trash. She starts at the front and works back, pulling every trash bag, tying them, dropping fresh liners in. Full bags go to the dumpster now, not later. She notices the break room trash is heavy with food waste — she ties it double so it does not leak in her cart.

6:35 — High dusting. Back at the front door: cobwebs in the lobby corners, dust on the door frames and light switches. She works each room door-to-back, high to low, with a blue cloth. Desks get a quick dust — she moves nothing except to wipe under it and puts it back exactly.

7:05 — Surfaces and glass. Break room counters get all-purpose cleaner and a green cloth. She disinfects the high-touch points: door handles, light switches, the microwave handle, faucet handles. She sprays disinfectant and LEAVES it wet while she moves on — dwell time does the killing. Lobby glass gets glass cleaner sprayed on the cloth, wiped in an S-pattern, no drips.

7:35 — Restrooms. Gloves on. Red cloth for toilets and urinals, yellow for sinks and mirrors. Bowl cleaner inside the bowls first so it can work while she wipes the exteriors. She disinfects flush handles and stall latches. Restocks toilet paper and soap — she checks the supply closet count and notes they are low on paper towels. Floors mopped last in here.

8:05 — Floors. She vacuums all carpeted offices slowly, one pass forward and one back. Hard floors: dust mop first, then damp mop with properly diluted neutral cleaner, working backward toward the door. Wet floor sign out in the lobby.

8:25 — Final walk. Lights off room by room as she finishes. She checks: trash done, restrooms stocked, floors clean, nothing left behind. She re-arms the alarm, locks up, clocks out. In the app she notes the low paper towels so the manager can restock. 2.5 hours, one consistent clean.

Notice what made it work: the same order every room, chemicals given time to work, floors last, and a final walk before leaving. That is the whole system.'
, null;

-- ============ STEP 4: GUIDED PRACTICE ============

with c as (select id as cid from public.training_courses where slug = 'intro-commercial-cleaning'),
st as (select step_number, id as sid from public.training_steps where course_id = (select cid from c))
insert into public.training_lessons (course_id, step_id, sort_order, kind, title, body, media_svg)
select (select cid from c), (select sid from st where step_number = 4), 1, 'guided_practice', 'Practice: caddy setup and dilution',
'Do these two exercises before your first shift. Check your answers below.

EXERCISE 1 — Set up your caddy. Lay out every item you were issued. Arrange them: heavy bottles low and together, cloths grouped by color where your hand falls naturally, gloves and scraper in front. Now close your eyes and reach for the disinfectant. Did you grab it first try? Rearrange until you can. Time yourself: a good setup takes under 2 minutes and you can find anything blind.

EXERCISE 2 — Dilution math. Your all-purpose concentrate says 1 ounce per gallon. Your spray bottle holds 32 ounces (one quart).
Question A: How much concentrate goes in the spray bottle?
Question B: Your mop bucket holds 4 gallons. How much concentrate for the bucket?
Question C: The label says the disinfectant needs 5 minutes of dwell time. You spray a door handle and wipe it dry after 30 seconds. Did you disinfect it?

CHECK YOURSELF:
A: A gallon is 128 ounces, so 1 ounce per gallon = 1/4 ounce per 32 ounces. That is about 1.5 teaspoons. Measure it — do not eyeball it.
B: 4 gallons × 1 ounce = 4 ounces of concentrate, then fill with water.
C: No. The surface must stay wet the full 5 minutes. Spray it, leave it, come back.

If you missed any, re-read the chemicals lesson. Dilution and dwell time are the two most failed items on the written exam.'
, null;

-- ============ STEP 5: SIMULATOR ============

with c as (select id as cid from public.training_courses where slug = 'intro-commercial-cleaning'),
st as (select step_number, id as sid from public.training_steps where course_id = (select cid from c))
insert into public.training_lessons (course_id, step_id, sort_order, kind, title, body, media_svg)
select (select cid from c), (select sid from st where step_number = 5), 1, 'simulator', 'Simulator: your first solo office',
'You are alone at a small office for the first time. Three things go wrong. Choose what you would do, then read what happens.

SITUATION 1: Your key turns, but the alarm panel shows a code error and starts beeping. It wants a code you were not given.
A) Try a few codes you think it might be.
B) Step outside, call your manager, and wait for instructions.
C) Go in anyway and start cleaning — the beeping will stop eventually.
> B is correct. Never guess alarm codes — three wrong tries can trigger a silent alarm and a police visit. A is how false alarms (and fines) happen. C is how you meet the police. Call, wait, document.

SITUATION 2: In the break room you find a red stain on the carpet you have never seen before. It might be food. It might be blood.
A) Treat it as blood: gloves on, do not touch it with bare hands, clean with disinfectant, tell your manager.
B) Scrub it hard with all-purpose cleaner and move on.
C) Leave it and hope nobody notices.
> A is correct. Any unknown red stain gets treated as blood: gloves, disinfectant with full dwell time, and report it. B risks spreading a pathogen and sets the stain. C is hiding a problem — the client will find it.

SITUATION 3: You are 45 minutes behind because an office was trashed after a party. Your shift ends in 30 minutes.
A) Rush: skip the restrooms'' floors and the final walk to finish on time.
B) Call your manager, explain what happened, and ask whether to stay late or prioritize.
C) Clock out on time and leave the rest for tomorrow''s crew.
> B is correct. Your manager decides — maybe the client pays for the extra time, maybe some areas can wait. A leaves restrooms dirty (the one thing clients always check). C abandons the job. Communicate; do not improvise.

The pattern: when something is unusual, stop, protect yourself, call your manager, and document. That instinct is what this whole course is building.'
, null;

-- ============ STEP 6: WRITTEN EXAM (8 groups x 3 variants) ============

with c as (select id as cid from public.training_courses where slug = 'intro-commercial-cleaning')
insert into public.training_questions (course_id, kind, variant_group, question, choices, correct_index, explanation)
select (select cid from c), 'written', 'ppe', 'When must you wear gloves?', '["Only when using strong chemicals","Every time you handle cleaning chemicals","Only in restrooms","Only when your hands are cut"]'::jsonb, 1, 'Gloves go on every time you handle chemicals — even mild ones. Skin absorbs chemicals over time.'
union all select (select cid from c), 'written', 'ppe', 'You are about to spray bowl cleaner inside a toilet. What PPE do you need?', '["Nothing for a quick job","Gloves and goggles","A hard hat","A dust mask only"]'::jsonb, 1, 'Bowl cleaner is acid-based and splashes. Gloves plus goggles is the minimum.'
union all select (select cid from c), 'written', 'ppe', 'Chemical splashes in your eye. What is the first thing you do?', '["Rub it and keep working","Flush with water for 15 minutes","Put on goggles","Call the client"]'::jsonb, 1, 'Flush immediately with water for 15 minutes, then tell your manager.'
union all select (select cid from c), 'written', 'mixing', 'What happens when bleach is mixed with ammonia or acids?', '["It cleans twice as well","It makes a nicer smell","It can create toxic gas that can kill","Nothing, it is safe"]'::jsonb, 2, 'Bleach plus ammonia or acid creates toxic chloramine/chlorine gas. Never mix chemicals.'
union all select (select cid from c), 'written', 'mixing', 'A spray bottle has no label and you do not know what is in it. What do you do?', '["Smell it to identify it","Mix in some all-purpose cleaner","Do not use it — tell your manager","Pour it down the drain"]'::jsonb, 2, 'Never use an unknown chemical. Do not smell it, mix it, or dump it. Report it.'
union all select (select cid from c), 'written', 'mixing', 'Which statement about mixing cleaning products is true?', '["Mixing makes them stronger","Only mix products of the same color","Never mix chemicals unless the label says to","Mixing is fine in small amounts"]'::jsonb, 2, 'The rule is absolute: never mix. The label is the only authority.'
union all select (select cid from c), 'written', 'dilution', 'The label says 1 ounce per gallon. Your bottle holds half a gallon. How much concentrate?', '["1 ounce","Half an ounce","2 ounces","Fill it halfway with concentrate"]'::jsonb, 1, 'Half the water means half the concentrate: half an ounce. More chemical is not better.'
union all select (select cid from c), 'written', 'dilution', 'Why is using MORE concentrate than the label says a bad idea?', '["It works too fast","It leaves sticky residue and can damage surfaces","It makes the bottle too heavy","There is no downside"]'::jsonb, 1, 'Over-concentration leaves residue that attracts dirt and can ruin finishes.'
union all select (select cid from c), 'written', 'dilution', 'A disinfectant label lists a dwell time of 10 minutes. What does that mean?', '["Spray and wipe within 10 minutes","The surface must stay wet for 10 minutes to kill germs","Wait 10 minutes before entering the room","Reapply every 10 minutes"]'::jsonb, 1, 'Dwell time is wet contact time. Spraying and instantly wiping does not disinfect.'
union all select (select cid from c), 'written', 'colorcode', 'Which cloth color is for toilets and urinals?', '["Blue","Green","Red","Yellow"]'::jsonb, 2, 'Red = restroom fixtures (toilets/urinals). This never touches any other surface.'
union all select (select cid from c), 'written', 'colorcode', 'You just wiped a toilet with a red cloth. What do you do with that cloth next?', '["Use it on the restroom mirror","Rinse it and dust a desk","Retire it — it never touches another surface","Use it on the break room counter"]'::jsonb, 2, 'A restroom cloth is done after restroom fixtures. Using it elsewhere spreads germs.'
union all select (select cid from c), 'written', 'colorcode', 'Which color is used for general dusting like desks and sills?', '["Red","Blue","Yellow","Green"]'::jsonb, 1, 'Blue = general dusting. Green = kitchens, yellow = restroom sinks, red = toilets.'
union all select (select cid from c), 'written', 'order', 'What is the correct room order?', '["Floors, trash, dusting, surfaces","Trash, high dusting, surfaces, restrooms, floors last","Restrooms first, then everything else","Glass first, then floors, then trash"]'::jsonb, 1, 'Trash, high-to-low dusting, surfaces, restrooms, floors last. Floors are always last because dust falls down.'
union all select (select cid from c), 'written', 'order', 'Why do floors get cleaned last in every room?', '["It is tradition","Because dust and debris fall down as you clean above","So the floors dry faster","Because vacuums are loud"]'::jsonb, 1, 'Everything you do above the floor drops debris onto it. Clean floors last and you only do them once.'
union all select (select cid from c), 'written', 'order', 'You should work through a room in which direction?', '["Start in the middle and spiral out","Start at the door and work toward the back","Start at the windows","It does not matter"]'::jsonb, 1, 'Door to back, so you never walk across a floor you just cleaned.'
union all select (select cid from c), 'written', 'microfiber', 'How should a microfiber cloth be used?', '["Dry, in big circles","Damp, folded in quarters, flipping to clean faces","Soaking wet for maximum cleaning","One cloth for the whole building"]'::jsonb, 1, 'Damp (not dripping), folded in quarters gives 8 clean faces. Swap cloths when they are all used.'
union all select (select cid from c), 'written', 'microfiber', 'How do you launder microfiber cloths?', '["With fabric softener for softness","Hot water with bleach","Without fabric softener","They are disposable — throw them out"]'::jsonb, 2, 'Fabric softener coats the fibers and ruins them. Wash without it.'
union all select (select cid from c), 'written', 'microfiber', 'A dry microfiber cloth is best for:', '["Mopping floors","Dusting — it grabs dust with static","Scrubbing toilets","Polishing with chemical"]'::jsonb, 1, 'Dry microfiber grabs dust electrostatically. Damp is for wiping surfaces.'
union all select (select cid from c), 'written', 'restroom', 'What is the correct order for cleaning a restroom?', '["Mirrors, toilets, floors","Bowls first (let chemical work), exteriors, sinks, floors last","Floors first so they dry","Trash last"]'::jsonb, 1, 'Apply bowl cleaner first so it works while you do exteriors, then sinks/mirrors, floors last.'
union all select (select cid from c), 'written', 'restroom', 'After cleaning a restroom, what should you check before leaving?', '["That the door locks","Soap, paper towels, and toilet paper are stocked","That the lights are bright","That the trash smells fine"]'::jsonb, 1, 'Restock everything. An empty dispenser is the most common client complaint.'
union all select (select cid from c), 'written', 'restroom', 'Which surfaces in a restroom must be disinfected?', '["Only the toilet bowl","High-touch points: flush handles, stall latches, faucet handles, door handles","Only the mirror","Only the floor"]'::jsonb, 1, 'Disinfect what hands touch: handles, latches, faucets, doors — with full dwell time.'
union all select (select cid from c), 'written', 'professional', 'You notice a client''s desk drawer is slightly open with cash visible. You should:', '["Close it and say nothing","Take a photo to show your manager","Not touch it and mention it to your manager","Count it to make sure it is all there"]'::jsonb, 2, 'Do not touch it. Tell your manager so it is documented. You touch nothing that is not yours to clean.'
union all select (select cid from c), 'written', 'professional', 'You cannot finish an area before your shift ends. What do you do?', '["Skip it quietly and hope nobody notices","Tell your manager before you leave","Come back tomorrow unpaid","Rush it in 2 minutes"]'::jsonb, 1, 'Communicate. Clients forgive problems they hear about; they do not forgive problems they discover.'
union all select (select cid from c), 'written', 'professional', 'Your phone buzzes with a personal text while cleaning. You should:', '["Answer it — it is quick","Keep it in your pocket except for clocking in/out","Take the call in the hallway","Text back between rooms"]'::jsonb, 1, 'Phone stays in your pocket. You are being paid to clean, and clients notice.';

-- ============ STEP 7: SCENARIO EXAM (5 groups x 2 variants) ============

with c as (select id as cid from public.training_courses where slug = 'intro-commercial-cleaning')
insert into public.training_questions (course_id, kind, variant_group, question, choices, correct_index, explanation)
select (select cid from c), 'scenario', 'alarm', 'You arrive at 6 PM. Your key works but the alarm panel rejects your code and starts beeping. What do you do?', '["Try three more codes quickly","Step outside, call your manager, and wait","Go in and start cleaning — it will stop","Disarm it by unplugging the panel"]'::jsonb, 1, 'Never guess alarm codes — wrong tries can trigger a silent alarm and police response. Call your manager.'
union all select (select cid from c), 'scenario', 'alarm', 'The alarm arms itself while you are still inside cleaning. You hear the exit-delay beeps. What now?', '["Ignore it — you are supposed to be here","Disarm it with your code right away","Run out the door before it arms","Call the client"]'::jsonb, 1, 'Disarm it with your own code immediately, then tell your manager it happened so the schedule can be checked.'
union all select (select cid from c), 'scenario', 'spill', 'You find a red stain on the break room carpet. It could be juice or blood. What is the safe move?', '["Treat it as blood: gloves, disinfectant, full dwell time, report it","Scrub it with all-purpose cleaner","Pour bleach on it","Leave it for the day crew"]'::jsonb, 0, 'Unknown red stains are treated as blood: gloves, disinfectant with dwell time, and report to your manager.'
union all select (select cid from c), 'scenario', 'spill', 'A trash bag splits in the hallway, spilling food waste across the floor. What is the right order?', '["Mop first, then pick up the big pieces","Pick up solids, clean the area, disinfect the spot, then mop","Leave it — it is the client''s mess","Spray air freshener and move on"]'::jsonb, 1, 'Remove solids first, then clean, disinfect the affected spot, then mop. Never mop over chunks.'
union all select (select cid from c), 'scenario', 'behind', 'You are 45 minutes behind and your shift ends in 30. What do you do?', '["Skip restroom floors to finish on time","Call your manager and ask whether to stay or prioritize","Clock out on time and leave the rest","Rush everything at double speed"]'::jsonb, 1, 'Your manager decides — the client may pay for extra time. Never silently skip restrooms.'
union all select (select cid from c), 'scenario', 'behind', 'An office is far dirtier than usual after a party and you will not finish. What is your first action?', '["Clean faster and skip dusting","Tell your manager before your shift ends","Do a perfect job on half the building","Leave a note on the client''s desk"]'::jsonb, 1, 'Communicate early. Your manager can authorize overtime or adjust priorities — hiding it guarantees an angry client.'
union all select (select cid from c), 'scenario', 'broken', 'You knock over a framed photo and the glass cracks. What do you do?', '["Put it back and say nothing","Clean up the glass safely and tell your manager immediately","Throw it away so nobody sees","Fix it with tape"]'::jsonb, 1, 'Clean up safely, then report it right away. Honesty about accidents builds trust; hiding them destroys it.'
union all select (select cid from c), 'scenario', 'broken', 'The vacuum dies halfway through the job with a burning smell. What now?', '["Keep trying — it might restart","Unplug it, stop using it, tell your manager","Open it up and fix the motor","Finish with a broom and say nothing"]'::jsonb, 1, 'A burning smell means stop immediately and unplug. Report it — electrical issues are a fire risk.'
union all select (select cid from c), 'scenario', 'stranger', 'Someone you do not recognize walks in while you are cleaning and asks what you are doing. You should:', '["Tell them to leave immediately","Politely say you are the cleaning crew, ask who they are, and call your manager if unsure","Ignore them","Let them look around"]'::jsonb, 1, 'Be polite but verify. If they cannot identify themselves as staff, call your manager. Never confront aggressively.'
union all select (select cid from c), 'scenario', 'stranger', 'You find a back door propped open that should be locked. What do you do?', '["Close and lock it, then tell your manager","Leave it — someone must want it open","Prop it wider for fresh air","Ignore it, not your job"]'::jsonb, 0, 'Secure the building: close and lock it, then report it. An open door undoes all the building''s security.';

-- ============ STEP 8: PRACTICAL ============

with c as (select id as cid from public.training_courses where slug = 'intro-commercial-cleaning')
insert into public.training_practicals (course_id, title, instructions, checklist)
select (select cid from c), 'Clean a small office to standard',
'With your manager observing (or on a supervised practice clean), complete a full clean of a small office or a set of rooms: trash, dusting, surfaces, glass, restroom, and floors. Work the top-to-bottom, door-to-back system from this course. Your manager will check each item below.',
'["Arrived on time in uniform with complete caddy","Clocked in with GPS at the location","Emptied all trash and replaced liners","Dusted high to low, door to back, without moving client items","Wiped surfaces with correct cloth colors","Cleaned glass without streaks or drips","Cleaned and disinfected restroom with red/yellow separation","Restocked soap, paper towels, and toilet paper","Disinfected high-touch points with proper dwell time","Vacuumed/mopped floors last, working toward the door","Final walk completed — nothing missed, lights off","Locked up, alarm set, clocked out, reported issues"]'::jsonb;
