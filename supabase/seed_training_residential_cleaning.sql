-- Seed: Residential Cleaning (residential-cleaning)
-- Run AFTER 021_training_academy.sql in the WorkTeams Supabase project.

delete from public.training_questions where course_id = (select id from public.training_courses where slug = 'residential-cleaning');
delete from public.training_lessons where course_id = (select id from public.training_courses where slug = 'residential-cleaning');
delete from public.training_practicals where course_id = (select id from public.training_courses where slug = 'residential-cleaning');
delete from public.training_steps where course_id = (select id from public.training_courses where slug = 'residential-cleaning');
delete from public.training_courses where slug = 'residential-cleaning';

insert into public.training_courses (slug, title, description, category, department, sort_order, estimated_hours, recert_months)
values ('residential-cleaning', 'Residential Cleaning', 'Cleaning homes professionally: room-by-room systems, client expectations, and working respectfully in someone''s home.', 'cleaning', 'Specialty Cleaning', 3, 3, 12);

with c as (select id as cid from public.training_courses where slug = 'residential-cleaning')
insert into public.training_steps (course_id, step_number, step_key, title, description)
select cid, 1, 'reading', 'Reading: residential cleaning fundamentals', 'Core knowledge: professionalism, systems, tools, client expectations.' from c
union all select cid, 2, 'visual', 'Visual guide: room system and caddy setup', 'Diagrams that reinforce the reading.' from c
union all select cid, 3, 'worked_example', 'Worked example: full home clean', 'A complete job worked start to finish.' from c
union all select cid, 4, 'guided_practice', 'Guided practice', 'Practice with coaching and checkpoints.' from c
union all select cid, 5, 'simulator', 'Simulator: the client comes home early', 'Safe hands-on simulation.' from c
union all select cid, 6, 'written_exam', 'Written exam', 'Randomized questions. 80% to pass.' from c
union all select cid, 7, 'scenario_exam', 'Scenario exam', 'What would you do? 80% to pass.' from c
union all select cid, 8, 'practical_final', 'Practical final', 'Demonstrate the work against a checklist.' from c
union all select cid, 9, 'evidence', 'Evidence submission', 'Upload photo proof of your work.' from c
union all select cid, 10, 'approval', 'Manager approval', 'A manager reviews and approves.' from c
union all select cid, 11, 'recertification', 'Recertification', 'Stay current. Renew before expiry.' from c;

-- ================= STEP 1: READING (3 lessons) =================

with c as (select id as cid from public.training_courses where slug = 'residential-cleaning'),
st as (select step_number, id as sid from public.training_steps where course_id = (select cid from c))
insert into public.training_lessons (course_id, step_id, sort_order, kind, title, body, media_svg)
select (select cid from c), (select sid from st where step_number = 1), 1, 'reading', 'You are a guest: professionalism and trust in someone''s home',
'When you clean a home, you are a guest in the most personal space a person has. Clients trust you with their belongings, their children''s rooms, and their privacy. That trust is the whole business. One broken promise can lose a client forever.

PROFESSIONAL CONDUCT

Arrive on time. Wear your uniform or company shirt. Greet the client warmly and briefly, then get to work. Keep your phone silent and in your pocket. Do not eat the client''s food, use their personal items, or sit on their furniture to rest. Smoke breaks happen outside, away from the home, and never in uniform near the client''s door.

PRIVACY IS SACRED

You will see personal things: mail, photos, medications, financial papers. Do not read them. Do not discuss them with anyone, including coworkers. Do not take photos inside a client''s home without permission. If you overhear a private conversation, act as if you heard nothing.

BOUNDARIES WITH BELONGINGS

Do not open drawers, cabinets, or closets unless cleaning them is part of the job. If cash or valuables are lying out, leave them exactly where they are and clean around them. Never move valuables to ''a safer spot'' — if something goes missing, you want zero doubt. If jewelry or small valuables block a surface you must clean, ask the client where to place them, or carefully move them aside and put them back exactly.

CHILDREN AND PETS

Follow the client''s instructions about pets every time. Some pets are friendly, some are fearful, some must stay in a room. Never feed a pet without permission. Keep pets away from wet floors and open chemical bottles. With children, be friendly but do not discipline them, give them food, or take them anywhere.

BREAKAGE

Accidents happen. The rule is simple: tell the truth immediately. Tell the client honestly and report to your supervisor the same day. Never hide breakage. Clients forgive accidents; they do not forgive cover-ups.

You represent the company in every home. Clean well, respect everything, and leave the home better than you found it.

FIRST IMPRESSIONS AND COMMUNICATION

Clients decide in the first minutes whether they trust you. A clean uniform, a friendly greeting, and getting straight to work say everything. If the client gives instructions, repeat them back so they know you heard. If something changes — you are running late, a room is locked, a product is missing — tell your supervisor right away so the client hears it from the company first, not as a surprise. Small courtesies build the trust that turns one-time cleans into weekly clients.', null
union all select (select cid from c), (select sid from st where step_number = 1), 2, 'reading', 'The room-by-room system: top to bottom, left to right',
'Professional cleaners do not wander. They follow a system so nothing is missed and no work is redone. Learn this system and use it in every home.

THE MASTER ORDER

1. Start with dry work throughout: dusting, cobweb removal, vacuuming.
2. Then do wet work: bathrooms, kitchen, mopping.
3. Within each room: top to bottom, left to right.
4. Floors are always last in each room.

Top to bottom means dirt falls to areas you have not cleaned yet. Ceiling fans and high shelves first, baseboards later, floors last. Left to right means you move around the room in one direction without backtracking or missing spots.

THE KITCHEN SYSTEM

1. Clear and load: put dishes in the dishwasher or sink, clear counters.
2. Appliances: wipe the stovetop (cool surfaces only), microwave inside and out, refrigerator exterior, small appliances.
3. Counters and sink: wipe counters, scrub the sink — sinks hold more germs than they appear to.
4. Floor last: sweep or vacuum, then damp-mop.

THE BATHROOM SYSTEM

1. Mirror and fixtures first.
2. Counters and sink.
3. Shower and tub: apply cleaner, let it work while you do the toilet area, then scrub and rinse.
4. Toilet: use a dedicated cloth, working from the cleanest parts (tank, handle) to the dirtiest (bowl exterior, base). Never use the toilet cloth on anything else.
5. Floor last: sweep behind the toilet and under the vanity, then mop.

BEDROOMS AND LIVING AREAS

1. Tidy and straighten: pillows, throws, items on surfaces.
2. Dust high to low: shelves, frames, electronics (dry cloth), baseboards.
3. Mirrors and glass as needed.
4. Vacuum: under furniture edges, corners, under beds where reachable.
5. Hard floors: damp-mop last.

CHANGE YOUR WATER AND CLOTHS

Dirty water just moves dirt around. Change mop water when it looks cloudy. Flip and refold microfiber cloths to a clean side often. A fresh cloth cleans; a dirty cloth smears.

Work the system every time and speed will come naturally. Rushing without a system just means missed spots and callbacks.

ADAPTING WITHOUT BREAKING THE SYSTEM

Every home is a little different, but the system does not change — only the time each part takes. A home with more bathrooms needs more wet-work time. A home with pets needs extra vacuuming. Plan when you walk in: glance at each room, note the heavy areas, and start. If a client asks for extra attention somewhere, give it — then trim time from low-priority dusting, never from bathrooms or kitchens. The system keeps you consistent. Your judgment keeps you on schedule.', null
union all select (select cid from c), (select sid from st where step_number = 1), 3, 'reading', 'Tools, products, and meeting client expectations',
'YOUR CADDY

A professional caddy carries: all-purpose/neutral cleaner, glass cleaner, bathroom cleaner or descaler, disinfectant, microfiber cloths (several, color-coded if your company uses colors), scrub pads (non-scratch), a toilet brush, gloves, trash bags, and a duster. Everything has a place. Restock after every job so you never run out mid-clean.

MICROFIBER BASICS

Microfiber cleans best slightly damp, not soaking wet. Fold cloths into quarters: this gives you eight clean surfaces before you need a fresh cloth. Never use fabric softener on microfiber — it coats the fibers and ruins them. Wash microfiber separately from lint-producing laundry.

KNOW YOUR PRODUCTS

Neutral/all-purpose cleaner: your everyday product for dust, fingerprints, and light soil. Glass cleaner: mirrors and glass, sprayed on the cloth to avoid drips on frames. Bathroom cleaner/descaler: soap scum and hard water — use with ventilation. Disinfectant: high-touch areas like doorknobs, light switches, and bathroom surfaces — respect the dwell time on the label.

Never mix bleach with ammonia or acids. Never mix products in general. Use each product as its label directs.

CLIENT EXPECTATIONS

Most clients want three things: consistency, communication, and care. Consistency means the home looks the same great way every visit — follow the same system. Communication means telling the client (or your supervisor) about anything unusual: a stain that will not come out, a broken item, a room you could not access. Care means treating the home like it matters, because it does.

THE WALKTHROUGH HABIT

Before you leave, walk through the home slowly with fresh eyes. Check each room against your mental checklist. Crouch to see baseboards and floors at an angle. This five-minute habit prevents most callbacks.

COMMON ROOKIE MISTAKES

Cleaning with a dry dirty cloth and wondering why surfaces look smeary. Forgetting the top of the refrigerator, ceiling fan blades, and light switches. Using too much product — more product does not mean more clean, it means residue. Leaving the job without a final walkthrough.

Bring the right tools, follow the system, respect the home, and check your work. That is residential cleaning.

TAKE CARE OF YOUR TOOLS

Your tools are your livelihood. Rinse mop heads and wring them out after every job — a sour mop makes every floor smell bad. Launder microfiber regularly and replace cloths when they stop grabbing dust. Check your caddy before each job: full bottles, clean cloths, fresh bags, working sprayers. A cleaner who shows up with worn-out tools works twice as hard for worse results. Ten minutes of tool care after each job saves hours of frustration.', null;

-- ================= STEP 2: VISUAL (2 lessons with SVG) =================

with c as (select id as cid from public.training_courses where slug = 'residential-cleaning'),
st as (select step_number, id as sid from public.training_steps where course_id = (select cid from c))
insert into public.training_lessons (course_id, step_id, sort_order, kind, title, body, media_svg)
select (select cid from c), (select sid from st where step_number = 2), 1, 'visual', 'The top-to-bottom, left-to-right system',
'This diagram shows the order for any room. Start at the top (ceiling, fans, high shelves) and work down. Move left to right around the room so you never miss a section. Dry dusting comes before any wet work. Floors are always last.

Follow the arrows: high dust first, then mid-level surfaces left to right, then baseboards, then the floor. In kitchens and bathrooms, the same pattern applies within the wet-work stage.',
'<svg width="460" height="330" xmlns="http://www.w3.org/2000/svg"><rect x="10" y="10" width="440" height="310" rx="12" fill="#f8fafc" stroke="#cbd5e1"/><text x="230" y="45" text-anchor="middle" font-size="16" font-weight="bold" fill="#0f172a">ROOM CLEANING ORDER</text><rect x="120" y="65" width="220" height="200" rx="8" fill="#ffffff" stroke="#94a3b8"/><text x="230" y="90" text-anchor="middle" font-size="13" font-weight="bold" fill="#0f172a">1. HIGH DUST</text><text x="230" y="108" text-anchor="middle" font-size="12" fill="#475569">Ceiling fan, tops of shelves</text><line x1="230" y1="120" x2="230" y2="140" stroke="#16a34a" stroke-width="3"/><polygon points="230,148 222,136 238,136" fill="#16a34a"/><text x="230" y="170" text-anchor="middle" font-size="13" font-weight="bold" fill="#0f172a">2. SURFACES, LEFT TO RIGHT</text><text x="230" y="188" text-anchor="middle" font-size="12" fill="#475569">Counters, tables, sills, frames</text><line x1="230" y1="200" x2="230" y2="218" stroke="#16a34a" stroke-width="3"/><polygon points="230,226 222,214 238,214" fill="#16a34a"/><text x="230" y="248" text-anchor="middle" font-size="13" font-weight="bold" fill="#0f172a">3. FLOORS LAST</text><text x="230" y="262" text-anchor="middle" font-size="12" fill="#475569">Vacuum, then damp-mop</text><text x="230" y="292" text-anchor="middle" font-size="13" font-weight="bold" fill="#b45309">Dry work before wet work. Never redo a floor.</text></svg>'
union all select (select cid from c), (select sid from st where step_number = 2), 2, 'visual', 'Your caddy, stocked and ready',
'A stocked caddy means you never leave a room to hunt for supplies. Everything rides with you.

Carry: neutral all-purpose cleaner, glass cleaner, bathroom descaler, disinfectant, a stack of folded microfiber cloths, non-scratch scrub pads, toilet brush, gloves, trash bags, and a duster.

Rules: chemicals upright with caps on and labels facing out. Cloths folded in quarters. Restock after every job. Never leave the caddy unattended where children or pets can reach it.',
'<svg width="460" height="300" xmlns="http://www.w3.org/2000/svg"><rect x="10" y="10" width="440" height="280" rx="12" fill="#f8fafc" stroke="#cbd5e1"/><text x="230" y="45" text-anchor="middle" font-size="16" font-weight="bold" fill="#0f172a">THE STOCKED CADDY</text><rect x="150" y="70" width="160" height="130" rx="10" fill="#e2e8f0" stroke="#64748b"/><g font-size="12" fill="#0f172a"><rect x="165" y="85" width="130" height="24" rx="6" fill="#dbeafe" stroke="#3b82f6"/><text x="230" y="101" text-anchor="middle">Neutral cleaner</text><rect x="165" y="115" width="130" height="24" rx="6" fill="#dbeafe" stroke="#3b82f6"/><text x="230" y="131" text-anchor="middle">Glass cleaner</text><rect x="165" y="145" width="130" height="24" rx="6" fill="#fef3c7" stroke="#d97706"/><text x="230" y="161" text-anchor="middle">Bathroom descaler</text><rect x="165" y="175" width="130" height="24" rx="6" fill="#dcfce7" stroke="#16a34a"/><text x="230" y="191" text-anchor="middle">Microfiber cloths</text></g><text x="230" y="228" text-anchor="middle" font-size="12" fill="#475569">+ scrub pads, toilet brush, gloves, bags, duster</text><text x="230" y="252" text-anchor="middle" font-size="13" font-weight="bold" fill="#b91c1c">Restock after EVERY job</text><text x="230" y="272" text-anchor="middle" font-size="12" fill="#475569">Never leave chemicals where kids or pets can reach</text></svg>';

-- ================= STEP 3: WORKED EXAMPLE =================

with c as (select id as cid from public.training_courses where slug = 'residential-cleaning'),
st as (select step_number, id as sid from public.training_steps where course_id = (select cid from c))
insert into public.training_lessons (course_id, step_id, sort_order, kind, title, body, media_svg)
select (select cid from c), (select sid from st where step_number = 3), 1, 'worked_example', 'Worked example: 3-bed, 2-bath home in 3 hours',
'THE JOB: A 1,600 sq ft home, 3 bedrooms, 2 bathrooms, kitchen, living room. Maintenance clean, booked for 3 hours. The client left a note: ''Dog is friendly, in the backyard. Please do the master bath extra well.''

HOUR 1: DRY WORK THROUGHOUT (top to bottom, left to right)
Start at the front door with your caddy. Bedrooms first: strip nothing (linens are the client''s job unless asked), straighten pillows and throws, dust high to low — ceiling fan, shelves, frames, baseboards. Living room: same pattern, fluff cushions, dust electronics with a dry cloth. Do not move the client''s papers on the desk; dust around them. Vacuum all carpeted areas, getting under bed edges and corners.

HOUR 2: BATHROOMS (wet work)
Guest bath: mirror, counter, sink, then apply descaler to the shower and let it work while you clean the toilet (dedicated cloth, tank to base). Scrub and rinse the shower. Floor last — sweep behind the toilet, mop.
Master bath (the priority): same system, extra attention to the shower glass and grout lines since the client asked. Take your time here; this is what the client will check.

HOUR 2.5-3: KITCHEN AND FINISH
Kitchen: dishes into the dishwasher, wipe stovetop (cool), microwave inside and out, counters, scrub the sink, wipe appliance fronts. Sweep and damp-mop the kitchen floor, then the entry and laundry floors. Let the dog back in from the backyard.

FINAL 10 MINUTES: WALKTHROUGH
Caddy packed, trash tied. Walk every room slowly. You spot a missed baseboard in the hallway — wipe it. The master bath mirror has a streak — fix it. Everything checks out. Lock up as instructed, note the completed visit.

NOTICE THE DECISIONS: dry before wet, system in every room, the client''s note honored (master bath got extra time), papers and valuables untouched, dog handled per instructions, breakage-free because items were moved carefully, and a final walkthrough caught two small misses before the client ever saw them.

Three hours, one system, zero callbacks.', null;

-- ================= STEP 4: GUIDED PRACTICE (2 lessons) =================

with c as (select id as cid from public.training_courses where slug = 'residential-cleaning'),
st as (select step_number, id as sid from public.training_steps where course_id = (select cid from c))
insert into public.training_lessons (course_id, step_id, sort_order, kind, title, body, media_svg)
select (select cid from c), (select sid from st where step_number = 4), 1, 'guided_practice', 'Practice 1: put the room in order',
'Put each list in the correct order. Answers at the bottom.

EXERCISE A: Bathroom order. Steps: mop the floor, clean the mirror, scrub the shower, wipe the counter and sink, clean the toilet.
Correct order: ___, ___, ___, ___, ___.

EXERCISE B: Kitchen order. Steps: mop the floor, wipe counters, clean the stovetop, scrub the sink, clear dishes.
Correct order: ___, ___, ___, ___, ___.

EXERCISE C: Whole-home order. Steps: bathrooms, dry dusting everywhere, kitchen, final walkthrough, bedrooms and living areas.
Correct order: ___, ___, ___, ___, ___.

ANSWERS
A: mirror, counter and sink, shower (apply cleaner early, scrub after it works), toilet, floor last.
B: clear dishes, stovetop, counters, sink, floor last.
C: dry dusting everywhere first, then bedrooms and living areas, then bathrooms, then kitchen, final walkthrough.

The pattern never changes: dry before wet, top to bottom, floors last, walkthrough at the end.', null
union all select (select cid from c), (select sid from st where step_number = 4), 2, 'guided_practice', 'Practice 2: what would you do?',
'Choose the best answer. Answers at the bottom.

1. You find $40 cash on a dresser while dusting. Best action?
   A. Put it in a drawer for safekeeping. B. Leave it exactly where it is and dust around it. C. Count it to make sure none is missing.

2. The client''s toddler follows you from room to room. Best action?
   A. Give the child your duster to play with. B. Be friendly, keep working, keep chemicals out of reach. C. Tell the child to go away.

3. You notice a stain on the carpet that will not come out. Best action?
   A. Scrub harder with bleach. B. Note it and tell your supervisor/the client honestly. C. Cover it with furniture.

4. The home has a strong pet odor. Best action?
   A. Spray air freshener heavily everywhere. B. Clean thoroughly, ventilate, and mention it to your supervisor. C. Complain to the client.

ANSWERS
1. B — never move cash or valuables.
2. B — friendly, safe, professional.
3. B — honesty beats hiding; bleach can ruin carpet.
4. B — real cleaning and ventilation beat masking odors.', null;

-- ================= STEP 5: SIMULATOR =================

with c as (select id as cid from public.training_courses where slug = 'residential-cleaning'),
st as (select step_number, id as sid from public.training_steps where course_id = (select cid from c))
insert into public.training_lessons (course_id, step_id, sort_order, kind, title, body, media_svg)
select (select cid from c), (select sid from st where step_number = 5), 1, 'simulator', 'Simulator: the client comes home early',
'Read the situation. Choose A, B, or C. Then read what happens.

SITUATION
You are 90 minutes into a 3-hour clean. You are in the master bedroom, halfway through dusting, when you hear the front door open. The client is home two hours early with a friend. They are chatting in the living room, which you have already cleaned.

OPTION A: Keep dusting the bedroom as if nothing happened. They will leave again soon.
OPTION B: Greet them warmly and briefly, quietly move your caddy to an uncleaned area (the kitchen), give them space, and continue working efficiently.
OPTION C: Stop working, go chat with them in the living room, and wait for them to leave before continuing.

WHAT HAPPENS

Option A: The client walks into the bedroom to grab something and finds a stranger dusting near their nightstand. They feel uncomfortable in their own home. Trust drops. Even though you did nothing wrong, the surprise damages the relationship.

Option C: Twenty minutes of chatting eats your schedule. Now you must rush the bathrooms and kitchen, quality drops, and you run over time. The client enjoyed the chat but notices the rushed work later.

Option B: CORRECT. You acknowledged them without being intrusive, moved away from their space, and kept the job on track. The client sees a professional who respects their home and their time. You finish on schedule with quality intact.

THE LESSON: When a client comes home early, be warm, be brief, and relocate. Never clean a room the client is occupying. Never stop working to socialize on a timed job — friendly does not mean idle. And always keep chemicals and tools out of the way of unexpected guests.', null;

-- ================= STEP 6: WRITTEN EXAM (24 questions: 8 groups x 3) =================

with c as (select id as cid from public.training_courses where slug = 'residential-cleaning')
insert into public.training_questions (course_id, kind, variant_group, question, choices, correct_index, explanation)
select (select cid from c), 'written', 'cleaning-order', 'When cleaning a room, you work:', '["Bottom to top so dirt falls down","Top to bottom so dirt falls to areas not yet cleaned","In circles around the room","Starting with the floor"]'::jsonb, 1, 'Top-to-bottom means dirt falls where you have not cleaned yet.'
union all select (select cid from c), 'written', 'cleaning-order', 'Within a room, the best pattern is:', '["Left to right, top to bottom","Random — anywhere you see dirt","Floor first, then surfaces","One wall at a time, floor to ceiling"]'::jsonb, 0, 'Left-to-right plus top-to-bottom covers everything without backtracking.'
union all select (select cid from c), 'written', 'cleaning-order', 'You should do dry work (dusting) before wet work (mopping) because:', '["Wet floors dry faster that way","Dust falls onto floors you have not cleaned yet","It does not matter","Dry work is easier"]'::jsonb, 1, 'Dusting after mopping drops dirt onto your clean floor.'
union all select (select cid from c), 'written', 'microfiber', 'Microfiber cloths work best when:', '["Soaking wet","Slightly damp","Completely dry and dusty","Used with bleach every time"]'::jsonb, 1, 'Slightly damp microfiber grabs dust; soaking wet just smears.'
union all select (select cid from c), 'written', 'microfiber', 'Why fold a microfiber cloth into quarters?', '["It looks professional","It gives you 8 clean surfaces before needing a new cloth","It makes the cloth stronger","It is required by law"]'::jsonb, 1, 'Quarters give 8 fresh faces — flip and refold as each soils.'
union all select (select cid from c), 'written', 'microfiber', 'You should NOT use fabric softener on microfiber because:', '["It makes them smell bad","It coats the fibers and ruins their cleaning ability","It changes their color","It makes them too soft"]'::jsonb, 1, 'Softener coats fibers so they stop grabbing dirt.'
union all select (select cid from c), 'written', 'client-privacy', 'You find personal mail on a client''s counter while dusting. You should:', '["Read it — it might be important","Not read it — dust around it and respect privacy","Open it to check for bills","Mention it to the client''s neighbor"]'::jsonb, 1, 'Client mail is private. Never read it or discuss it.'
union all select (select cid from c), 'written', 'client-privacy', 'A client''s personal photos are on display. While cleaning you should:', '["Handle them carefully and put them back exactly","Rearrange them to look nicer","Take a photo of them","Dust them roughly — they are just decorations"]'::jsonb, 0, 'Handle personal items with care and return them exactly.'
union all select (select cid from c), 'written', 'client-privacy', 'You overhear a private phone call while cleaning. You should:', '["Listen — it could be interesting","Act as if you heard nothing and keep working","Repeat it to your next client","Ask the client about it"]'::jsonb, 1, 'What you overhear stays unheard. Never repeat it.'
union all select (select cid from c), 'written', 'pets', 'A client''s dog is in the house while you clean. You should:', '["Let it outside without asking","Follow the client''s instructions about the pet","Feed it treats from your bag","Lock it in a bedroom"]'::jsonb, 1, 'Always follow the client''s pet instructions exactly.'
union all select (select cid from c), 'written', 'pets', 'The client''s cat knocks over your spray bottle. You should:', '["Yell at the cat","Clean up the spill, check the cat is fine, keep working","Leave the mess for the client","Spray the cat to teach it a lesson"]'::jsonb, 1, 'Stay calm, clean up, make sure the animal is okay.'
union all select (select cid from c), 'written', 'pets', 'Before using products in a home with pets, you should:', '["Use extra-strong chemicals","Keep pets away from wet surfaces and chemicals","Let pets sniff the mop","It does not matter — pets are tough"]'::jsonb, 1, 'Pets must be kept away from wet product and open chemicals.'
union all select (select cid from c), 'written', 'breakage', 'You accidentally knock over and break a vase. You should:', '["Hide the pieces and say nothing","Tell the client honestly right away and report to your supervisor","Blame the client''s cat","Glue it and hope they do not notice"]'::jsonb, 1, 'Honesty immediately. Clients forgive accidents, not cover-ups.'
union all select (select cid from c), 'written', 'breakage', 'To prevent breakage, you should:', '["Dust around items when possible, and move items with care","Move quickly to save time","Stack fragile items together","Only use dry cloths on valuables"]'::jsonb, 0, 'Slow, careful hands around fragile items prevent accidents.'
union all select (select cid from c), 'written', 'breakage', 'If a client has extremely fragile valuables in a cleaning area, the best practice is:', '["Clean them extra hard","Ask the client how they want them handled, or clean around them","Move them to another room","Skip the whole room"]'::jsonb, 1, 'Ask the client — never guess with irreplaceable items.'
union all select (select cid from c), 'written', 'kitchen-system', 'The best order for a kitchen clean is:', '["Floor, counters, appliances, sink","Clear dishes, appliances, counters, sink, floor last","Counters first, then floor, then appliances","Any order is fine"]'::jsonb, 1, 'Work the system: dishes, appliances, counters, sink, floor last.'
union all select (select cid from c), 'written', 'kitchen-system', 'When cleaning a stovetop, you should:', '["Spray cleaner on hot burners","Wait until surfaces are cool, then clean","Pour water on hot burners","Only wipe the knobs"]'::jsonb, 1, 'Hot surfaces plus cleaner can burn you and bake on residue.'
union all select (select cid from c), 'written', 'kitchen-system', 'The kitchen sink should be cleaned:', '["Only if it looks dirty","Every visit — it holds more germs than it appears","Once a month","Only the faucet, not the basin"]'::jsonb, 1, 'Sinks harbor germs invisibly. Clean them every visit.'
union all select (select cid from c), 'written', 'bathroom-system', 'In a bathroom, which order is correct?', '["Floor, toilet, mirror, shower","Mirror, counters, shower/tub, toilet, floor last","Toilet first, then everything else","Shower first, then mirror"]'::jsonb, 1, 'Top to bottom, toilet before floor, floor always last.'
union all select (select cid from c), 'written', 'bathroom-system', 'The toilet should be cleaned:', '["With the same cloth used on the mirror","With a dedicated cloth, from cleanest to dirtiest parts","Only the seat","Only when the client asks"]'::jsonb, 1, 'A dedicated toilet cloth, tank to base, never reused elsewhere.'
union all select (select cid from c), 'written', 'bathroom-system', 'Hard water spots on a shower door are best handled by:', '["Scrubbing with steel wool","An appropriate descaler used as directed, with ventilation","Ignoring them","Bleach alone"]'::jsonb, 1, 'Descaler as directed removes mineral spots without scratching.'
union all select (select cid from c), 'written', 'products-safety', 'You should never mix:', '["Dish soap and water","Bleach with ammonia or acids","Vinegar and baking soda","Two brands of dish soap"]'::jsonb, 1, 'Bleach plus ammonia or acids creates toxic gas.'
union all select (select cid from c), 'written', 'products-safety', 'When a client asks you to use their own products, you should:', '["Refuse — only company products are allowed","Use them as the client directs, checking they are safe for the surface","Mix them with company products","Use extra amounts"]'::jsonb, 1, 'Honor the request, but verify the product suits the surface.'
union all select (select cid from c), 'written', 'products-safety', 'Cleaning products in a home with small children should be:', '["Left on counters for easy access","Kept with you in your caddy, never left unattended","Stored under the sink","Given to the children to help"]'::jsonb, 1, 'Chemicals stay with you or locked away — never unattended.';

-- ================= STEP 7: SCENARIO EXAM (10 questions: 5 groups x 2) =================

with c as (select id as cid from public.training_courses where slug = 'residential-cleaning')
insert into public.training_questions (course_id, kind, variant_group, question, choices, correct_index, explanation)
select (select cid from c), 'scenario', 'broken-item', 'You break a picture frame while dusting. The client is not home. What do you do?', '["Hide the broken frame in the trash","Leave a note, tell your supervisor immediately, and be honest with the client","Fix it with tape and say nothing","Blame it on the previous cleaner"]'::jsonb, 1, 'Report honestly at once — never hide breakage.'
union all select (select cid from c), 'scenario', 'broken-item', 'You chip a client''s expensive countertop with a tool. You should:', '["Cover it with a towel","Report it honestly to your supervisor and the client right away","Pretend you did not notice","Offer to pay cash without telling the company"]'::jsonb, 1, 'Immediate honest reporting protects you and the company.'
union all select (select cid from c), 'scenario', 'client-home-early', 'The client comes home two hours early while you are cleaning the bedroom. You should:', '["Keep cleaning the bedroom around them","Greet them politely, move to another area, and give them space","Leave immediately","Ask them to leave"]'::jsonb, 1, 'Be warm and brief, then relocate — never clean an occupied room.'
union all select (select cid from c), 'scenario', 'client-home-early', 'A client wants to chat for 20 minutes during a timed clean. You should:', '["Chat as long as they want","Be friendly but explain you need to keep working to finish on time","Ignore them completely","Tell them you do not talk to clients"]'::jsonb, 1, 'Friendly but professional — protect the schedule and the quality.'
union all select (select cid from c), 'scenario', 'valuable-items', 'You find cash on a nightstand while dusting. You should:', '["Take it — they will not miss it","Leave it exactly where it is and clean around it","Move it to a drawer for safekeeping","Count it to make sure it is all there"]'::jsonb, 1, 'Never touch cash or valuables. Leave them exactly as found.'
union all select (select cid from c), 'scenario', 'valuable-items', 'Jewelry is scattered on a bathroom counter you need to clean. You should:', '["Put it in your pocket so it does not get wet","Ask the client where to put it, or carefully move it aside and put it back","Wear it while you clean","Leave the counter dirty"]'::jsonb, 1, 'Ask first, or move aside carefully and restore exactly.'
union all select (select cid from c), 'scenario', 'pet-mess', 'The client''s dog has an accident on the carpet while you are there. The client is not home. You should:', '["Ignore it — pets are not your job","Clean it up as best you can and leave a note for the client","Scold the dog","Use bleach on the carpet"]'::jsonb, 1, 'Handle it professionally and communicate — never use bleach on carpet.'
union all select (select cid from c), 'scenario', 'pet-mess', 'A normally friendly dog starts growling at you. You should:', '["Try to pet it to calm it down","Back away slowly, leave the room, and call your supervisor","Spray it with cleaner","Lock yourself in the bathroom"]'::jsonb, 1, 'Never challenge an agitated animal. Withdraw safely and report.'
union all select (select cid from c), 'scenario', 'unfinished-on-time', 'You realize you cannot finish the whole house in the booked time. You should:', '["Rush and do a poor job on everything","Do the priority areas well, tell your supervisor, and be honest with the client","Skip the bathrooms — nobody checks","Leave early without telling anyone"]'::jsonb, 1, 'Quality plus honesty beats rushed everything or silent skipping.'
union all select (select cid from c), 'scenario', 'unfinished-on-time', 'The home is much dirtier than described and needs extra time. You should:', '["Clean for free until it is done","Tell your supervisor so extra time or a re-quote can be arranged","Do a quick surface wipe and leave","Complain to the client"]'::jsonb, 1, 'Scope changes go through your supervisor — never decide alone.';

-- ================= STEP 8: PRACTICAL =================

with c as (select id as cid from public.training_courses where slug = 'residential-cleaning')
insert into public.training_practicals (course_id, title, instructions, checklist)
select (select cid from c), 'Whole-home maintenance clean',
'Perform a complete maintenance clean of a home exactly as trained: follow the room-by-room system, respect the client''s space and belongings, and finish with a walkthrough. Your manager will observe or review photos.',
'["Followed the system: dry dusting first, then wet work, top to bottom, left to right","Floors done last in every room — vacuum then damp-mop","Kitchen completed in order: dishes, appliances, counters, sink, floor","Bathrooms completed in order: mirror, counters, shower/tub, toilet, floor","Used a dedicated toilet cloth — not reused on any other surface","Client belongings, papers, and valuables left untouched and in place","Pets handled per client instructions; chemicals never left unattended","Microfiber used slightly damp and refolded to clean sides","Performed a slow final walkthrough and fixed every miss found","Home left tidy, fresh, and ready — zero callbacks expected"]'::jsonb;
