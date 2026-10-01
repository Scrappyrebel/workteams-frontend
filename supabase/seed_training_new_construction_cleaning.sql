-- Seed: New Construction Cleaning (new-construction-cleaning)
-- Run AFTER 021_training_academy.sql in the WorkTeams Supabase project.
-- Note: prose strings use $$ dollar-quoting so apostrophes need no escaping.

delete from public.training_questions where course_id = (select id from public.training_courses where slug = 'new-construction-cleaning');
delete from public.training_lessons where course_id = (select id from public.training_courses where slug = 'new-construction-cleaning');
delete from public.training_practicals where course_id = (select id from public.training_courses where slug = 'new-construction-cleaning');
delete from public.training_steps where course_id = (select id from public.training_courses where slug = 'new-construction-cleaning');
delete from public.training_courses where slug = 'new-construction-cleaning';

insert into public.training_courses (slug, title, description, category, department, sort_order, estimated_hours, recert_months)
values ('new-construction-cleaning', 'New Construction Cleaning', 'Post-construction cleanup: dust control, stickers and paint specks, phased rough/final cleans.', 'cleaning', 'Specialty Cleaning', 5, 3, 12);

with c as (select id as cid from public.training_courses where slug = 'new-construction-cleaning')
insert into public.training_steps (course_id, step_number, step_key, title, description)
select cid, 1, 'reading', $$Reading: construction cleaning fundamentals$$, $$Core knowledge: phases, tools, chemicals, safety.$$ from c
union all select cid, 2, 'visual', $$Visual guide: phases and work order$$, $$Diagrams that reinforce the reading.$$ from c
union all select cid, 3, 'worked_example', $$Worked example: 1,800 sq ft final clean$$, $$A complete new-home final clean worked start to finish.$$ from c
union all select cid, 4, 'guided_practice', $$Guided practice: stickers, specks, walkthroughs$$, $$Practice with coaching and checkpoints.$$ from c
union all select cid, 5, 'simulator', $$Simulator: the job site surprises you$$, $$Make the call when the site is not ready.$$ from c
union all select cid, 6, 'written_exam', $$Written exam$$, $$Randomized questions. 80% to pass.$$ from c
union all select cid, 7, 'scenario_exam', $$Scenario exam$$, $$What would you do? 80% to pass.$$ from c
union all select cid, 8, 'practical_final', $$Practical final$$, $$Demonstrate a final clean against a checklist.$$ from c
union all select cid, 9, 'evidence', $$Evidence submission$$, $$Upload photo proof of your work.$$ from c
union all select cid, 10, 'approval', $$Manager approval$$, $$A manager reviews and approves.$$ from c
union all select cid, 11, 'recertification', $$Recertification$$, $$Stay current. Renew before expiry.$$ from c;

-- ============ STEP 1: READING (3 lessons) ============

with c as (select id as cid from public.training_courses where slug = 'new-construction-cleaning'),
st as (select step_number, id as sid from public.training_steps where course_id = (select cid from c))
insert into public.training_lessons (course_id, step_id, sort_order, kind, title, body, media_svg)
select (select cid from c), (select sid from st where step_number = 1), 1, 'reading', $$What construction cleaning is$$,
$$Construction cleaning is the cleanup done after builders finish their work. It turns a dusty work site into a space that is ready for the owner to walk into. Without it, a brand-new building looks unfinished. With it, the builder can hand over the keys with pride.

There are two phases, and mixing them up is the most common rookie mistake.

PHASE 1: THE ROUGH CLEAN. This happens while work is wrapping up, sometimes while a few trades are still on site. The goal is to get the big stuff out. You remove large debris, scrap wood, and packaging. You pull the protective stickers off windows and fixtures (a first pass, not perfect). You sweep the floors roughly. You are not detailing anything yet. Think of it as clearing the battlefield.

PHASE 2: THE FINAL CLEAN. This happens when all the trades are done. Now you detail everything, top to bottom. You dust every surface, clean glass inside and out, scrub bathrooms and kitchens, wipe down cabinets inside and out, and finish the floors. This is the clean the homeowner or tenant actually sees.

Some jobs also have a TOUCH-UP clean. That is a quick pass right before move-in or the final walkthrough, to catch the dust that settled after your final clean. Builders often ask for it a day or two before closing.

KEY TERMS you will hear on every job:
- Punch list: the builder's list of items that still need fixing or cleaning before handover.
- Rough clean: phase 1, debris and rough sweep.
- Final clean: phase 2, full detail.
- Touch-up: a light final pass before walkthrough.
- HEPA: a high-efficiency vacuum filter that traps fine dust instead of blowing it back out. On construction dust, a regular vacuum just rearranges the problem.
- Silica dust: the very fine dust from concrete, mortar, and drywall. It is harmful to breathe. You will learn how to control it in lesson 3.

WHY THIS WORK MATTERS: builders judge cleaning companies on the final walkthrough. One dusty windowsill or one missed sticker can cost the company the next three jobs from that builder. Construction cleaning is also some of the best-paying cleaning work, because it is hard, dirty, and skilled. Learn it well and you become one of the crew members every company wants.$$, null
union all select (select cid from c), (select sid from st where step_number = 1), 2, 'reading', $$Tools, chemicals, and equipment$$,
$$You do not need a truck full of gear, but you do need the RIGHT gear. Using the wrong tool on a new surface is how damage happens.

SCRAPERS. Your two best friends. A plastic scraper (or plastic razor blade) is your default tool for stickers and specks on glass, tubs, and finished surfaces. Plastic rarely scratches. A single-edge razor scraper is for glass ONLY, and only on wet glass, held at a low angle. Never use a razor on tubs, counters, appliances, or any coated surface. Never use a razor on dry glass. When in doubt, use plastic.

VACUUMS. A HEPA-filter vacuum is strongly recommended for construction dust. Fine concrete and drywall dust passes straight through cheap vacuums and paper bags, and you end up breathing it. Use the brush attachment on hard floors so you do not scratch new finishes.

CLOTHS AND MOPS. Microfiber cloths for dusting and glass. Flat microfiber mops for hard floors, because you can change the pad often. Change mop water or pads OFTEN. Mopping a new floor with dirty water just paints a thin layer of grime back on.

CHEMICALS. Keep it simple and safe:
- All-purpose cleaner for general wiping. Mix per the label, usually around 2 ounces per gallon.
- Glass cleaner for mirrors and glass touch-ups.
- An adhesive remover (citrus or mineral-spirit based) for sticker residue. Use it sparingly, ventilate the room, and wipe the surface clean afterward so no oily film remains.
- Never mix chemicals. Never assume a stronger mix cleans better. Stronger mixes leave residue and can damage new finishes.

LADDERS AND REACH TOOLS. A sturdy step ladder for high dusting and tall windows. An extension pole with a washer and squeegee for tall glass, so you can work from the ground. Wet-floor signs, always, when floors are wet.

TRASH GEAR. Heavy-duty bags, a dolly or hand truck for heavy bags, and gloves. Construction trash is heavier and sharper than office trash.

WHAT NOT TO BRING: abrasive scrub pads (they scratch new tubs and counters), steel wool, bleach-based products on new stone or colored grout, and any tool you have not been trained on. If you are unsure whether a tool is safe on a surface, test in a hidden spot or ask your supervisor. Ten seconds of asking beats a scratched $2,000 countertop.$$, null
union all select (select cid from c), (select sid from st where step_number = 1), 3, 'reading', $$Staying safe on a job site$$,
$$A construction site is not an office. It has hazards an office never has. These rules are not suggestions.

SILICA DUST. Concrete, mortar, and drywall create very fine dust that can damage your lungs over time. When you are sweeping concrete dust, scraping drywall dust, or working in a visibly dusty room: wear a dust mask or respirator, and use dust-controlled methods. That means a HEPA vacuum or a damp mop instead of dry sweeping whenever you can. If a dust cloud rises, stop, let it settle, and ventilate before you continue. Never blow dust around with a leaf blower or a reversed vacuum.

SHARP OBJECTS. Nails, screws, staples, and metal strapping hide in debris and underfoot. Wear sturdy, closed-toe shoes with thick soles. Watch where you kneel. Never grab a handful of debris blindly. If you find protruding nails, do not pull them with your hands. Mark the spot and tell your supervisor.

ELECTRICAL. Do not touch open electrical panels, exposed wiring, or breaker boxes. Do not unplug contractor equipment to plug in your vacuum. If you need power, ask where you may plug in.

WORKING AROUND TRADES. Painters, electricians, and installers may still be on site during a rough clean. Do not move their tools or materials. Communicate: tell them where you will be working and ask where they need space. If a trade is actively working in the room you planned to clean, clean another area first and come back.

LADDERS. Set the ladder on firm, level ground. Keep three points of contact (two hands and a foot, or two feet and a hand). Never overreach to the side. Never stand on the top step.

CHEMICAL SAFETY. Read the label before you use anything new. Wear gloves with adhesive removers and solvents. Ventilate small rooms. If you feel dizzy or get a headache from fumes, step out into fresh air immediately and tell your supervisor.

PPE CHECKLIST for every construction clean: dust mask or respirator, safety glasses when scraping overhead, sturdy shoes, and gloves. Put them on BEFORE you start, not after you notice the dust.

COMMON ROOKIE MISTAKES: dry-sweeping concrete dust without a mask. Using a razor scraper on a fiberglass tub. Dragging a full trash bag across a new hardwood floor. Mixing two cleaners to make them stronger. Promising the builder you will fix damage you caused instead of reporting it immediately. Every one of these has cost someone a job. Do not be that person.$$, null;

-- ============ STEP 2: VISUAL (2 lessons with SVG) ============

with c as (select id as cid from public.training_courses where slug = 'new-construction-cleaning'),
st as (select step_number, id as sid from public.training_steps where course_id = (select cid from c))
insert into public.training_lessons (course_id, step_id, sort_order, kind, title, body, media_svg)
select (select cid from c), (select sid from st where step_number = 2), 1, 'visual', $$Diagram: the three phases$$,
$$Study this flow. Every construction job moves left to right. Your crew's job changes completely at each phase, and the builder judges you on the last one.

Phase 1 (rough clean) is about REMOVAL: debris, stickers, rough sweep. Phase 2 (final clean) is about DETAIL: dust, glass, scrub, floors. The walkthrough is about PROOF: punch list, touch-ups, sign-off.

The arrows only go one way. Never do detail work before the debris is out, or you will clean everything twice.$$,
'<svg width="640" height="190" xmlns="http://www.w3.org/2000/svg" font-family="sans-serif"><rect x="5" y="5" width="630" height="180" rx="12" fill="#f8fafc" stroke="#cbd5e1"/><rect x="25" y="45" width="170" height="105" rx="10" fill="#dbeafe" stroke="#2563eb" stroke-width="2"/><text x="110" y="75" text-anchor="middle" font-size="15" font-weight="bold" fill="#1e3a8a">PHASE 1</text><text x="110" y="97" text-anchor="middle" font-size="14" fill="#1e3a8a">Rough clean</text><text x="110" y="117" text-anchor="middle" font-size="12" fill="#334155">Debris out. Stickers</text><text x="110" y="133" text-anchor="middle" font-size="12" fill="#334155">off. Rough sweep.</text><text x="207" y="105" font-size="30" fill="#64748b">&#8594;</text><rect x="235" y="45" width="170" height="105" rx="10" fill="#dcfce7" stroke="#16a34a" stroke-width="2"/><text x="320" y="75" text-anchor="middle" font-size="15" font-weight="bold" fill="#14532d">PHASE 2</text><text x="320" y="97" text-anchor="middle" font-size="14" fill="#14532d">Final clean</text><text x="320" y="117" text-anchor="middle" font-size="12" fill="#334155">Detail dust top to</text><text x="320" y="133" text-anchor="middle" font-size="12" fill="#334155">bottom. Glass. Floors.</text><text x="417" y="105" font-size="30" fill="#64748b">&#8594;</text><rect x="445" y="45" width="170" height="105" rx="10" fill="#fef3c7" stroke="#d97706" stroke-width="2"/><text x="530" y="75" text-anchor="middle" font-size="15" font-weight="bold" fill="#92400e">WALKTHROUGH</text><text x="530" y="97" text-anchor="middle" font-size="14" fill="#92400e">Punch list</text><text x="530" y="117" text-anchor="middle" font-size="12" fill="#334155">Touch-ups. Sign-off.</text><text x="530" y="133" text-anchor="middle" font-size="12" fill="#334155">Then you get paid.</text></svg>'
union all select (select cid from c), (select sid from st where step_number = 2), 2, 'visual', $$Diagram: clean top to bottom, back to front$$,
$$This is the order of work inside any room on a final clean. Dust falls DOWN, so you always start high and finish low. You also work from the farthest corner toward the door, so you never walk across a floor you just finished.

1. Ceiling corners and vents. 2. Light fixtures and ceiling fans. 3. Walls, windows, and blinds. 4. Counters, cabinets, fixtures. 5. Baseboards. 6. Floors last.

If you mop first and dust the blinds after, the dust lands on your wet floor and you start over. Order is everything.$$,
'<svg width="640" height="300" xmlns="http://www.w3.org/2000/svg" font-family="sans-serif"><rect x="5" y="5" width="630" height="290" rx="12" fill="#f8fafc" stroke="#cbd5e1"/><text x="320" y="35" text-anchor="middle" font-size="16" font-weight="bold" fill="#0f172a">FINAL CLEAN ORDER: TOP TO BOTTOM, BACK TO FRONT</text><rect x="180" y="55" width="280" height="200" fill="#e2e8f0" stroke="#94a3b8" stroke-width="2"/><rect x="180" y="55" width="280" height="34" fill="#bfdbfe"/><text x="320" y="77" text-anchor="middle" font-size="13" font-weight="bold" fill="#1e3a8a">1. HIGH: vents, corners, fans</text><rect x="180" y="89" width="280" height="34" fill="#dbeafe"/><text x="320" y="111" text-anchor="middle" font-size="13" font-weight="bold" fill="#1e3a8a">2. MID-HIGH: windows, blinds</text><rect x="180" y="123" width="280" height="34" fill="#e0e7ff"/><text x="320" y="145" text-anchor="middle" font-size="13" font-weight="bold" fill="#3730a3">3. MID: counters, cabinets</text><rect x="180" y="157" width="280" height="34" fill="#fef3c7"/><text x="320" y="179" text-anchor="middle" font-size="13" font-weight="bold" fill="#92400e">4. LOW: baseboards</text><rect x="180" y="191" width="280" height="34" fill="#dcfce7"/><text x="320" y="213" text-anchor="middle" font-size="13" font-weight="bold" fill="#14532d">5. FLOOR: vacuum, then mop</text><rect x="180" y="225" width="280" height="30" fill="#f1f5f9"/><text x="320" y="245" text-anchor="middle" font-size="13" font-weight="bold" fill="#475569">6. DOOR: exit, final check</text><text x="500" y="150" font-size="13" fill="#b91c1c" font-weight="bold">Dust falls</text><text x="500" y="168" font-size="13" fill="#b91c1c" font-weight="bold">down &#8595;</text><text x="500" y="196" font-size="13" fill="#166534" font-weight="bold">Start at back,</text><text x="500" y="214" font-size="13" fill="#166534" font-weight="bold">exit at door &#8594;</text></svg>';

-- ============ STEP 3: WORKED EXAMPLE ============

with c as (select id as cid from public.training_courses where slug = 'new-construction-cleaning'),
st as (select step_number, id as sid from public.training_steps where course_id = (select cid from c))
insert into public.training_lessons (course_id, step_id, sort_order, kind, title, body, media_svg)
select (select cid from c), (select sid from st where step_number = 3), 1, 'worked_example', $$Worked example: 1,800 sq ft final clean$$,
$$THE JOB: a newly built 1,800 square foot single-story home. 3 bedrooms, 2 baths, kitchen, living room. The trades finished yesterday. The builder wants a final clean before the buyer walkthrough on Friday. Your crew: you and one partner. Time budget: about 6 hours for two people.

HOUR 0:00 - WALKTHROUGH (15 minutes). Walk the whole house before touching anything. Note damage: a scratched windowsill in bedroom 2, a chipped tile in the hall bath. Photograph both and text them to your supervisor NOW, before you start. Check that water and power are on. Put on PPE: dust mask, glasses, gloves, sturdy shoes.

HOUR 0:15 - TRASH AND DEBRIS (45 minutes). Both of you bag all trash, scrap, and packaging. Carry bags out to the builder's dumpster. Do not drag bags across new floors. Sweep up piles of sawdust with a push broom, wearing your mask. This is still rough-clean thinking: get the big stuff out first.

HOUR 1:00 - HIGH DUSTING (45 minutes). Partner A takes the bedrooms with a microfiber duster on a pole: ceiling corners, vents, light fixtures, fan blades, tops of door frames. Partner B does the living room, kitchen, and baths the same way. Work top to bottom.

HOUR 1:45 - WINDOWS (90 minutes). Every window: peel stickers with a plastic scraper. Wet the glass, then remove paint specks with a razor scraper held at a low angle, only on plain glass. Wash with a washer sleeve, squeegee off, detail the edges with a dry microfiber. Clean the sill and track. 14 windows, about 6 minutes each with two people leapfrogging.

HOUR 3:15 - KITCHEN AND BATHS (75 minutes). Wipe cabinets inside and out. Scrub sinks, tubs, and toilets (plastic scraper for specks on the tub, never a razor). Polish faucets. Clean mirrors. In the baths, check the grout lines for haze and wipe them.

HOUR 4:30 - FLOORS (60 minutes). Vacuum all hard floors with the brush attachment. Damp-mop with all-purpose at 2 ounces per gallon. Change the water after every 400 square feet, about 4 changes for this house. Vacuum bedrooms if carpeted.

HOUR 5:30 - BASEBOARDS AND DETAILS (30 minutes). Wipe all baseboards, light switch plates, and door handles. These are the things buyers touch and look at.

HOUR 6:00 - FINAL WALK (15 minutes). Walk the house the way a buyer would: enter the front door, look at eye level, open cabinets, check windows against the light. Catch the one dusty sill you missed. Text the supervisor: done, with photos of the finished rooms.

TOTAL: about 6 hours. The builder walks in Friday, sees a finished home, and calls your company for the next three houses. That is how construction cleaning turns into repeat business.$$, null;

-- ============ STEP 4: GUIDED PRACTICE (2 lessons) ============

with c as (select id as cid from public.training_courses where slug = 'new-construction-cleaning'),
st as (select step_number, id as sid from public.training_steps where course_id = (select cid from c))
insert into public.training_lessons (course_id, step_id, sort_order, kind, title, body, media_svg)
select (select cid from c), (select sid from st where step_number = 4), 1, 'guided_practice', $$Practice: sticker and paint speck removal$$,
$$Do this practice on a piece of scrap glass or an old window before you ever touch a client's new windows. You need: a plastic scraper, a single-edge razor scraper, a spray bottle of water, glass cleaner, microfiber cloths, and adhesive remover.

EXERCISE 1 - THE STICKER. Stick a label on the glass. Now remove it the right way: 1) Lift a corner with the plastic scraper. 2) Peel slowly at a low angle. Pulling fast tears the sticker and leaves more residue. 3) For the sticky residue left behind: spray a little adhesive remover on a cloth (not directly on the glass), let it sit 30 seconds, wipe. 4) Wash the glass with glass cleaner to remove the oily film the remover leaves.

CHECK YOURSELF: Is the glass scratch-free? Hold it up to the light and look at an angle. Is there any oily haze? If yes, you skipped step 4.

EXERCISE 2 - THE PAINT SPECK. Dab a speck of dried latex paint on the glass. Now: 1) Wet the glass well. The razor NEVER touches dry glass. 2) Hold the razor nearly flat, about a 30-degree angle, and push the speck off with one smooth stroke. 3) Wipe and check.

CHECK YOURSELF: Did the blade chatter or skip? Your angle was too steep. Did you see a scratch? You pressed too hard or the glass was dry. Practice until you can clear ten specks in a row with no marks.

EXERCISE 3 - THE WRONG SURFACE. Now try the razor on a piece of scrap plastic or a painted board. See the scratch it leaves? That is why the rule is GLASS ONLY. On tubs, counters, and appliances, you use the plastic scraper and patience.

Do these three exercises until each one feels boring. Boring means your hands know it. On a real job, there is no practice glass.$$, null
union all select (select cid from c), (select sid from st where step_number = 4), 2, 'guided_practice', $$Practice: put the final clean in order$$,
$$Below are 8 tasks from a final clean, scrambled. Write them in the correct order on paper, then check yourself against the answer key.

A. Damp-mop the hard floors
B. Dust ceiling fans and vents
C. Clean the inside of the windows
D. Wipe baseboards
E. Bag all trash and carry it out
F. Scrub the bathtubs
G. Detail the window sills and tracks
H. Final walkthrough from the front door

ANSWER KEY: E, B, C, G, F, D, A, H.

WHY: Trash first (E), because debris ruins detail work. Then high dusting (B), because dust falls down. Then windows (C) and their sills (G), because glass work drips and sheds. Then tubs (F), mid-level scrubbing. Then baseboards (D), low but before floors. Then floors (A), always last among the cleaning tasks. Then the final walk (H), the way a buyer would enter.

If you got fewer than 7 right, re-read the visual lesson on work order. This sequence is the backbone of every final clean you will ever do. When a supervisor sees you working out of order, it tells them you do not understand dust. When they see you working in order without being told, it tells them you are ready for bigger jobs.$$, null;

-- ============ STEP 5: SIMULATOR ============

with c as (select id as cid from public.training_courses where slug = 'new-construction-cleaning'),
st as (select step_number, id as sid from public.training_steps where course_id = (select cid from c))
insert into public.training_lessons (course_id, step_id, sort_order, kind, title, body, media_svg)
select (select cid from c), (select sid from st where step_number = 5), 1, 'simulator', $$Simulator: the painters are still here$$,
$$Read the situation, pick what you would do, then read what happens with each choice. Be honest with yourself. This is practice, and practice is where mistakes are cheap.

SITUATION: You and your partner arrive at 8:00 AM for a scheduled final clean of a new home. The work order says all trades are done. But the painter's van is in the driveway, and he is rolling the living room walls right now. Dust sheets are down, paint is wet, and he says he will be another two hours. The builder is not answering his phone.

OPTION A: Start dusting the living room anyway, working around the painter.
WHAT HAPPENS: Your dusting stirs dust onto his wet paint. He has to redo a wall. He complains to the builder. The builder blames your company. You also breathe paint fumes in a closed room. Bad outcome.

OPTION B: Tell the painter to stop and leave because your crew is scheduled.
WHAT HAPPENS: You have no authority to order trades off a site. The painter refuses, an argument starts, and the builder hears about a fight on his job site. Your company looks unprofessional. Bad outcome.

OPTION C: Ask the painter how long each room will take, then start your clean at the far end of the house in the bedrooms, and text your supervisor about the situation.
WHAT HAPPENS: The painter finishes the living room while you detail the bedrooms. By the time you reach the living room, the paint is dry and he is gone. You texted your supervisor, so if the schedule slips, the company can tell the builder early instead of apologizing late. Good outcome.

THE CORRECT PATH IS C. The principles: never fight trades for space, sequence your work around reality instead of the plan, and communicate upward early. A supervisor would rather get your text at 8:05 AM than your apology at 3:00 PM.

NOW YOU TRY ONE: You are halfway through the final clean and find a cracked floor tile in the kitchen that was not there on your morning walkthrough. Your choices: 1) Try to glue it back yourself. 2) Ignore it and hope nobody notices. 3) Photograph it, tell your supervisor immediately, and keep cleaning around it. The right answer is 3. You did not break it, but hiding damage or attempting repairs makes it your problem. Report, document, move on.$$, null;

-- ============ STEP 6: WRITTEN EXAM (24 questions, 8 groups x 3) ============

with c as (select id as cid from public.training_courses where slug = 'new-construction-cleaning')
insert into public.training_questions (course_id, kind, variant_group, question, choices, correct_index, explanation)
select (select cid from c), 'written', 'phases-1', $$A builder asks for a rough clean. What does that include?$$, '["Removing large debris, pulling window stickers, and rough sweeping","Detail dusting every blind and baseboard","Scrubbing bathrooms and polishing faucets","Washing all windows inside and out"]'::jsonb, 0, $$The rough clean clears the big stuff: debris, stickers, rough sweep. Detail work belongs to the final clean.$$
union all select (select cid from c), 'written', 'phases-1', $$Which task belongs in the FINAL clean, not the rough clean?$$, '["Hauling scrap lumber to the dumpster","Detail dusting of blinds, sills, and baseboards","Pulling protective film off appliances","Rough sweeping the garage"]'::jsonb, 1, $$Detail dusting is final-clean work. The rough clean only clears debris and does a rough pass.$$
union all select (select cid from c), 'written', 'phases-1', $$Your crew finished the rough clean. Now the builder wants the final clean. What changes?$$, '["You switch from debris removal to top-to-bottom detail work","You bring heavier trash bags","You work faster and skip the bathrooms","You clean only the rooms the buyer will see"]'::jsonb, 0, $$The final clean is a different job: detail every surface top to bottom instead of clearing debris.$$
union all select (select cid from c), 'written', 'dust-silica-1', $$You are dry sweeping concrete dust in a new build. What should you wear?$$, '["A dust mask or respirator","Sunglasses","A hard hat at all times","No PPE is needed for dust"]'::jsonb, 0, $$Concrete dust contains silica, which harms lungs. Wear a dust mask or respirator when dust is in the air.$$
union all select (select cid from c), 'written', 'dust-silica-1', $$Why is a HEPA vacuum or damp mop better than dry sweeping on construction dust?$$, '["It is faster","It keeps fine silica dust out of the air instead of stirring it up","It uses less water","Dry sweeping is banned everywhere"]'::jsonb, 1, $$Dry sweeping launches fine dust into the air you breathe. HEPA vacuums trap it and damp mopping keeps it down.$$
union all select (select cid from c), 'written', 'dust-silica-1', $$A thick dust cloud rises while you sweep. What is the safest action?$$, '["Keep sweeping so you finish faster","Stop, let it settle, ventilate, and use dust-controlled methods","Spray air freshener to cover the dust","Sweep harder to push the dust outside"]'::jsonb, 1, $$Stop and control the dust: let it settle, ventilate, and switch to a HEPA vac or damp method with a mask on.$$
union all select (select cid from c), 'written', 'stickers-1', $$What is the correct first tool for removing a sticker from a new window?$$, '["A plastic scraper","A metal putty knife","A single-edge razor, used dry","A wire brush"]'::jsonb, 0, $$Plastic scrapers remove stickers without scratching. Metal tools and dry razors risk scratching the glass.$$
union all select (select cid from c), 'written', 'stickers-1', $$Why should you NOT use a metal scraper on a new window?$$, '["It is too slow","It can scratch the glass","Metal costs too much","It voids the sticker warranty"]'::jsonb, 1, $$Metal scrapers scratch glass. Plastic is the safe default on new windows and finishes.$$
union all select (select cid from c), 'written', 'stickers-1', $$After peeling a sticker, sticky residue remains. What is the correct next step?$$, '["Apply adhesive remover to a cloth, let it dwell briefly, wipe, then wash the glass","Scrape harder with the razor until it is gone","Leave it; the buyer will not notice","Pour hot water on the window"]'::jsonb, 0, $$Adhesive remover on a cloth with a short dwell time dissolves residue. Wash afterward so no oily film remains.$$
union all select (select cid from c), 'written', 'paint-specks-1', $$You find dried paint specks on plain glass. What is the correct method?$$, '["Wet the glass and use a razor scraper at a low angle","Scrape the dry glass with a razor held upright","Use a plastic scouring pad with bleach","Sand the specks off with fine sandpaper"]'::jsonb, 0, $$Wet glass plus a razor at a low angle removes specks safely. Dry glass or a steep angle causes scratches.$$
union all select (select cid from c), 'written', 'paint-specks-1', $$There is a paint speck on a brand-new wood windowsill. What should you do?$$, '["Scrape it off with a razor like you would on glass","Use a damp cloth and patience; test any solvent in a hidden spot first","Sand the whole sill down","Paint over the speck"]'::jsonb, 1, $$Finished wood scratches easily. Use gentle methods and test solvents hidden first. Never razor finished wood.$$
union all select (select cid from c), 'written', 'paint-specks-1', $$A blob of dried paint sits on new carpet. What is the safest first move?$$, '["Rub it hard with a wet rag","Blunt-scrape the excess without grinding it in, then tell your supervisor","Pour paint thinner on it","Cut the stained fibers out"]'::jsonb, 1, $$Do not grind paint deeper. Lift what you can gently and report it. Aggressive chemicals or cutting make it worse.$$
union all select (select cid from c), 'written', 'glass-1', $$New windows have a hazy construction film. What is the likely cause and fix?$$, '["It is defective glass; report it for replacement","It is fine construction dust film; wash and squeegee, possibly twice","It needs wax to shine","It will burn off in the sun"]'::jsonb, 1, $$Construction dust leaves a haze on new glass. A proper wash and squeegee, sometimes two passes, clears it.$$
union all select (select cid from c), 'written', 'glass-1', $$Dried cement splatter is stuck on a window. What do you try first?$$, '["Soak it with water, then lift gently with a plastic scraper","Hit it with a hammer","Use a razor on dry glass","Spray oven cleaner on it"]'::jsonb, 0, $$Soaking softens cement splatter so a plastic scraper can lift it without scratching the glass.$$
union all select (select cid from c), 'written', 'glass-1', $$You need to clean the outside of second-story new windows. What is the safest approach?$$, '["Lean a ladder against the gutter and climb up","Use an extension pole with washer and squeegee from the ground","Climb onto the roof","Skip the outsides; nobody checks them"]'::jsonb, 1, $$An extension pole lets you clean high glass from the ground. Ladders and roofs add fall risk for a cleaning task.$$
union all select (select cid from c), 'written', 'floors-1', $$How do you protect new finished floors while you clean around them?$$, '["Drag equipment; the floors are durable","Use walk-off mats at entries and never drag bags or equipment","Mop with as much water as possible","Cover them in plastic for the whole job"]'::jsonb, 1, $$Walk-off mats catch grit and carrying (not dragging) prevents scratches on new finishes.$$
union all select (select cid from c), 'written', 'floors-1', $$Gritty dust covers a new hardwood floor. What is the safest way to remove it?$$, '["Push it around with a stiff shop broom","Vacuum with a soft brush attachment or use a dust mop","Wet mop it immediately with lots of water","Leave it for the homeowner"]'::jsonb, 1, $$Grit scratches wood when dragged. Vacuum it up or dust-mop it away instead of pushing it across the finish.$$
union all select (select cid from c), 'written', 'floors-1', $$When damp-mopping new hard floors on a final clean, how should you manage the water?$$, '["Use the same water for the whole house to save time","Change the water often, about every 400 square feet","Mop with plain water only, no cleaner","Flood the floor so it dries streak-free"]'::jsonb, 1, $$Dirty mop water paints grime back onto new floors. Change it often so every pass lays down clean water.$$
union all select (select cid from c), 'written', 'safety-1', $$You spot exposed nails sticking out of debris. What do you do?$$, '["Pull them out with your hands","Mark the spot, tell your supervisor, and keep sturdy shoes on","Kick the debris aside","Ignore them; the builder handles nails"]'::jsonb, 1, $$Never grab nails with your hands. Mark the hazard, report it, and keep protective footwear on.$$
union all select (select cid from c), 'written', 'safety-1', $$You find an open electrical panel with exposed wiring. What is correct?$$, '["Close it yourself quickly","Do not touch it, keep your distance, and tell your supervisor","Unplug your vacuum from nearby","Take a photo and post it online"]'::jsonb, 1, $$Electrical panels are not your job. Do not touch them. Keep clear and report the hazard.$$
union all select (select cid from c), 'written', 'safety-1', $$A small bathroom smells strongly of solvent fumes. What should you do?$$, '["Keep working; the smell means it is cleaning well","Ventilate the room and step into fresh air; tell your supervisor if you feel dizzy","Mix in another cleaner to overpower the smell","Hold your breath and finish faster"]'::jsonb, 1, $$Fumes in a small space are dangerous. Ventilate, get fresh air, and never mix chemicals to fix the smell.$$
union all select (select cid from c), 'written', 'debris-1', $$Where does bagged construction trash go?$$, '["In the homeowner''s kitchen trash can","In the builder''s dumpster, separated if the builder requires it","Piled by the curb for pickup","Burned on site"]'::jsonb, 1, $$Construction debris goes in the builder's dumpster. Some builders require separating wood, metal, or trash.$$
union all select (select cid from c), 'written', 'debris-1', $$A trash bag is too heavy to lift safely. What should you do?$$, '["Drag it across the new floor to the door","Split it into two lighter bags or use a dolly","Leave it for the builder","Kick it toward the exit"]'::jsonb, 1, $$Dragging heavy bags scratches new floors and hurts backs. Split the load or wheel it out on a dolly.$$
union all select (select cid from c), 'written', 'debris-1', $$You find half-full paint cans in the trash pile. What is correct?$$, '["Throw them in the dumpster with everything else","Ask your supervisor; paint is often hazardous waste","Pour the paint out behind the house","Take them home"]'::jsonb, 1, $$Leftover paint is often regulated as hazardous waste. Ask your supervisor instead of dumping it.$$;

-- ============ STEP 7: SCENARIO EXAM (10 questions, 5 groups x 2) ============

with c as (select id as cid from public.training_courses where slug = 'new-construction-cleaning')
insert into public.training_questions (course_id, kind, variant_group, question, choices, correct_index, explanation)
select (select cid from c), 'scenario', 'trades-working-1', $$You arrive for a final clean and the painter is still rolling walls in the living room. What do you do?$$, '["Dust the living room around him so you stay on schedule","Order him off the site; your crew is scheduled","Ask how long each room will take, start at the far end of the house, and text your supervisor","Pack up and leave without telling anyone"]'::jsonb, 2, $$Work around reality: sequence your rooms away from the trade and communicate upward early. Never fight trades for space.$$
union all select (select cid from c), 'scenario', 'trades-working-1', $$An electrician needs the breaker room you are about to clean. What is the professional move?$$, '["Clean around him while he works on live breakers","Step out, clean elsewhere, and return when he is done","Tell him to hurry up","Unplug his tools so you have the outlet"]'::jsonb, 1, $$Give trades their space, especially around electrical work. Clean another area and circle back.$$
union all select (select cid from c), 'scenario', 'damage-found-1', $$Your scraper leaves a visible scratch on a new countertop. What do you do?$$, '["Stop, tell your supervisor immediately, and document it with a photo","Try to buff it out secretly before anyone sees","Blame the installer; it was probably already there","Cover it with a decoration"]'::jsonb, 0, $$Report damage immediately with documentation. Hiding it or attempting repairs turns an accident into a trust problem.$$
union all select (select cid from c), 'scenario', 'damage-found-1', $$During the final clean you find a cracked tile that was fine this morning. What is correct?$$, '["Try to glue it back yourself","Report it to your supervisor with a photo; do not attempt a repair","Pretend you never saw it","Bill the builder for the repair"]'::jsonb, 1, $$Document and report. Repairs are the builder's call, and attempting them yourself creates liability.$$
union all select (select cid from c), 'scenario', 'walkthrough-1', $$The homeowner walks in mid-clean and complains loudly about the dust. How do you respond?$$, '["Argue that construction is dusty and walk away","Stay calm, explain you are mid-process and the final pass comes last, and keep working","Stop working until they leave","Offer them a discount on the spot"]'::jsonb, 1, $$Stay professional: briefly explain the process, do not argue, and let the finished work speak. Discounts are the supervisor's call.$$
union all select (select cid from c), 'scenario', 'walkthrough-1', $$At the final walkthrough the builder adds 10 punch-list items. What do you do?$$, '["Promise they will all be done today","Write them down, tell your supervisor, and do not promise timelines you cannot keep","Refuse; the walkthrough already happened","Do them silently without telling anyone"]'::jsonb, 1, $$Record the items and escalate. Promising timelines you cannot keep damages the company's credibility.$$
union all select (select cid from c), 'scenario', 'supply-problem-1', $$You run out of glass cleaner with 20 windows left. What is the best move?$$, '["Use all-purpose cleaner with a microfiber; it works fine on glass","Use paper towels and water","Skip the remaining windows","Spray air freshener on the glass"]'::jsonb, 0, $$All-purpose cleaner with a clean microfiber handles glass well. Paper towels shed lint on new windows.$$
union all select (select cid from c), 'scenario', 'supply-problem-1', $$The vacuum bag is full and there are no spares on the truck. What do you do?$$, '["Empty it carefully into a trash bag and continue","Blow the dust out with the vacuum reversed","Keep vacuuming; a full bag still works","Sweep everything with a dry broom instead"]'::jsonb, 0, $$Empty the bag carefully into a lined trash bag so dust stays contained, and tell your supervisor to restock.$$
union all select (select cid from c), 'scenario', 'hazard-1', $$You find a hypodermic needle in renovation debris. What do you do?$$, '["Pick it up carefully and put it in the trash bag","Do not touch it; tell your supervisor immediately","Kick it under the debris pile","Take it to the dumpster yourself"]'::jsonb, 1, $$Never handle sharps with your hands. Stop, keep others clear, and report it to your supervisor at once.$$
union all select (select cid from c), 'scenario', 'hazard-1', $$Your ladder wobbles on uneven ground outside. What is the safe choice?$$, '["Climb carefully and get it over with","Do not climb it; move to level ground or skip the task and report it","Have your partner hold it while you climb high","Stack bricks under one leg"]'::jsonb, 1, $$A wobbly ladder is a fall waiting to happen. Relocate to firm level ground, or skip the task and report it.$$;

-- ============ STEP 8: PRACTICAL ============

with c as (select id as cid from public.training_courses where slug = 'new-construction-cleaning')
insert into public.training_practicals (course_id, title, instructions, checklist)
select (select cid from c), $$Practical: final clean of one room$$,
$$Perform a complete final clean of one bedroom including its windows, as if the buyer walkthrough is tomorrow. Work top to bottom and back to front. Your reviewer will observe and check each item. Bring your PPE, plastic scraper, razor scraper, microfibers, glass cleaner, all-purpose cleaner, vacuum, and mop.$$,
$$["Walked the room first and noted/photographed any existing damage","Wearing dust mask, glasses, gloves, and sturdy shoes before starting","Removed all trash and debris; bags carried out, not dragged","Removed window stickers with plastic scraper with no scratches","Removed paint specks from glass correctly: wet glass, low razor angle, glass only","Dusted high to low: vents, fixtures, blinds, door frames","Cleaned window glass inside streak-free; sill and track wiped","Damp-mopped floor with clean water; water changed when dirty","Final check from the doorway at eye level; caught misses","Work area left clean with all tools collected"]$$::jsonb;
