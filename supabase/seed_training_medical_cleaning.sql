-- Seed: Medical Facility Cleaning (medical-cleaning)
-- Run AFTER 021_training_academy.sql in the WorkTeams Supabase project.

delete from public.training_questions where course_id = (select id from public.training_courses where slug = 'medical-cleaning');
delete from public.training_lessons where course_id = (select id from public.training_courses where slug = 'medical-cleaning');
delete from public.training_practicals where course_id = (select id from public.training_courses where slug = 'medical-cleaning');
delete from public.training_steps where course_id = (select id from public.training_courses where slug = 'medical-cleaning');
delete from public.training_courses where slug = 'medical-cleaning';

insert into public.training_courses (slug, title, description, category, department, sort_order, estimated_hours, recert_months)
values ('medical-cleaning', 'Medical Facility Cleaning', 'Cleaning clinics, dental offices, and medical facilities: infection control, disinfectants, PPE, and regulated waste.', 'cleaning', 'Specialty Cleaning', 2, 4, 12);

with c as (select id as cid from public.training_courses where slug = 'medical-cleaning')
insert into public.training_steps (course_id, step_number, step_key, title, description)
select cid, 1, 'reading', 'Reading: medical cleaning fundamentals', 'Core knowledge: infection control, terms, procedures, safety.' from c
union all select cid, 2, 'visual', 'Visual guide: PPE and color coding', 'Diagrams that reinforce the reading.' from c
union all select cid, 3, 'worked_example', 'Worked example: dental operatory clean', 'A complete job worked start to finish.' from c
union all select cid, 4, 'guided_practice', 'Guided practice', 'Practice with coaching and checkpoints.' from c
union all select cid, 5, 'simulator', 'Simulator: blood spill response', 'Safe hands-on simulation.' from c
union all select cid, 6, 'written_exam', 'Written exam', 'Randomized questions. 80% to pass.' from c
union all select cid, 7, 'scenario_exam', 'Scenario exam', 'What would you do? 80% to pass.' from c
union all select cid, 8, 'practical_final', 'Practical final', 'Demonstrate the work against a checklist.' from c
union all select cid, 9, 'evidence', 'Evidence submission', 'Upload photo proof of your work.' from c
union all select cid, 10, 'approval', 'Manager approval', 'A manager reviews and approves.' from c
union all select cid, 11, 'recertification', 'Recertification', 'Stay current. Renew before expiry.' from c;

-- ================= STEP 1: READING (3 lessons) =================

with c as (select id as cid from public.training_courses where slug = 'medical-cleaning'),
st as (select step_number, id as sid from public.training_steps where course_id = (select cid from c))
insert into public.training_lessons (course_id, step_id, sort_order, kind, title, body, media_svg)
select (select cid from c), (select sid from st where step_number = 1), 1, 'reading', 'What medical cleaning is, and why the bar is higher',
'Medical facilities include doctor offices, dental offices, urgent care clinics, labs, and surgical centers. People who are sick, injured, or having procedures visit these places every day. Germs are present here in higher numbers than in a normal office.

Cleaning in these buildings is not just about appearance. It is about infection control. Infection control means stopping germs from spreading from one person to another through surfaces, hands, and equipment.

Germs that spread in healthcare settings can cause what are called healthcare-associated infections. Patients can pick these up during a visit. Good cleaning is one of the main defenses against them.

Here is the key difference from regular commercial cleaning. In an office, a dusty shelf is a cosmetic problem. In a medical facility, a poorly disinfected exam table can make the next patient sick. The stakes are higher, so the standards are higher.

KEY TERMS YOU MUST KNOW

Clean: remove dirt and soil you can see. This is always step one.

Sanitize: lower germs to a safe level. Used on some surfaces.

Disinfect: kill almost all germs on a surface. This is the standard for medical facilities.

Dwell time (contact time): how long a disinfectant must stay wet on a surface to work. It is printed on the product label.

High-touch surface: anything many hands touch. Door handles, light switches, faucets, exam tables, chair arms, railings, elevator buttons.

Cross-contamination: moving germs from one surface to another, usually on a cloth, mop, or glove.

PPE: personal protective equipment. Gloves, gowns, masks, eye protection.

THE GOLDEN RULES

1. Clean first, then disinfect. Disinfectant cannot work through dirt.
2. Respect dwell time. Spray and walk away. Come back after the label time.
3. Work from clean areas to dirty areas, and from high to low.
4. Never use the same cloth in a restroom and an exam room.
5. Change gloves between rooms, and wash your hands often.

COMMON ROOKIE MISTAKES

Spraying disinfectant and wiping it dry right away. This skips the dwell time, so the surface is not disinfected.

Dusting after disinfecting, which drops dirt onto a disinfected surface.

Forgetting high-touch spots like light switches and door handles.

Wearing the same gloves from room to room, which spreads germs.

Rushing. In medical cleaning, slow and correct beats fast and sloppy every time.

Your job is to protect patients, staff, and yourself. Take it seriously, follow the steps, and ask your supervisor whenever you are unsure.', null
union all select (select cid from c), (select sid from st where step_number = 1), 2, 'reading', 'Disinfectants, dwell time, and chemical safety',
'There are three levels of germ control. Cleaning removes visible dirt. Sanitizing lowers germs to a safe level. Disinfecting kills almost all germs. In medical facilities, disinfecting is the standard for exam rooms, restrooms, and high-touch surfaces.

COMMON PRODUCTS

Neutral cleaner: an everyday cleaner for dust and light soil. It does not disinfect.

Quaternary ammonium disinfectant (often called a quat): the workhorse disinfectant for medical facilities. Kills a broad range of germs.

Hydrogen-peroxide cleaner: a disinfecting cleaner that breaks down into water and oxygen. Good for many surfaces.

Bleach solution: powerful but harsh. Only use where your company directs, and never mix it with anything but water.

READ THE LABEL EVERY TIME

Every disinfectant label tells you three things: what germs it kills, how to dilute it, and the dwell time. The dwell time might be 1 minute, 5 minutes, or 10 minutes. If the surface dries before the dwell time is up, you must reapply. A surface that dried too soon was not disinfected.

DILUTION

Many disinfectants are concentrates that must be mixed with water. Measure carefully. Too weak and it will not disinfect. Too strong and it can damage surfaces and harm you. Use the measuring tools provided, not guesses.

THE MIXING RULE: NEVER MIX CHEMICALS

Never mix bleach with ammonia. Never mix bleach with acids (like toilet bowl cleaner). These combinations create toxic gas that can injure or kill you. Never mix any two cleaning products unless the label specifically tells you to. When in doubt, use one product at a time and rinse between them.

SAFETY DATA SHEETS (SDS)

Every chemical your company uses has a safety data sheet. It lists hazards, first aid, and what to do in a spill. Know where the SDS binder or file is at each facility. If a product splashes in your eyes, the SDS tells you to rinse with water, usually for 15 minutes, and get help.

STORAGE AND VENTILATION

Store chemicals in their original labeled containers, upright, with caps on. Never put chemicals in food or drink containers. Work with ventilation when you can: open doors, run fans. If you feel dizzy, get fresh air immediately and tell your supervisor.

Remember: the label is the law. If the label says 10 minutes of dwell time, the surface stays wet for 10 minutes. No shortcuts.

BUILD SAFE HABITS

Make these habits automatic. Read every new label before first use, even if you have used a similar product. Know where the SDS is at each facility so you can find it in under a minute. If a label is missing or unreadable, do not use the product — tell your supervisor. Wash your hands after handling concentrates. Never eat, drink, or touch your face while chemicals are on your gloves. Safe habits protect you on every shift, not just the risky ones.', null
union all select (select cid from c), (select sid from st where step_number = 1), 3, 'reading', 'PPE, sharps, blood, and waste',
'PPE stands for personal protective equipment. In medical cleaning this usually means gloves, and sometimes gowns, masks, and eye protection. PPE protects you from germs and chemicals.

PUTTING PPE ON (DONNING)

Put PPE on in this order: 1. Gown. 2. Mask. 3. Eye protection. 4. Gloves. Gloves go on last so they cover the cuffs of the gown.

TAKING PPE OFF (DOFFING)

Take PPE off in this order: 1. Gloves. 2. Eye protection. 3. Gown. 4. Mask. The mask comes off last because it protected your breathing the whole time. Remove everything without touching the outside surfaces, which are contaminated. Wash or sanitize your hands immediately after all PPE is off.

GLOVES

Wear gloves for all medical cleaning. Change gloves between rooms. Change gloves immediately if they tear. Never wash and reuse disposable gloves. Never touch your face, phone, or personal items with work gloves on.

SHARPS

Sharps are needles, syringes, lancets, and broken glass that may carry blood. The rules are absolute:
- Never recap a needle. Ever.
- Never reach into a trash bag or container to grab a sharp.
- Use tongs, a dustpan, or forceps to pick up a sharp.
- Place it in a puncture-proof sharps container, point first.
- Never push down the contents of a full sharps container with your hand.
- Report overfilled containers to your supervisor immediately.

If you are stuck by a needle, wash the area, tell your supervisor at once, and get medical evaluation the same day.

BLOODBORNE PATHOGENS

Treat ALL blood and body fluids as infectious. This is called universal precaution. It does not matter if the blood looks clean or the patient looks healthy. Assume it can carry disease.

Blood spill procedure:
1. Put on gloves and PPE. Keep others away from the area.
2. Contain the spill so it does not spread.
3. Clean up the bulk material with disposable towels.
4. Apply disinfectant and allow the FULL dwell time.
5. Dispose of all materials in the correct waste stream.
6. Remove PPE correctly and wash your hands.

REGULATED MEDICAL WASTE VS REGULAR TRASH

Regulated medical waste goes in red biohazard bags: bloody gauze, used bandages, anything soaked with blood or body fluids. Sharps go in sharps containers, never in bags. Regular trash (paper towels, packaging, empty boxes) goes in regular bags. When in doubt, ask your supervisor. Never guess with medical waste.

PRIVACY

You will see private things in medical facilities. Do not read patient charts. Do not look at computer screens. Do not discuss patients with anyone. Knock and announce yourself before entering any room. If a room is occupied, step out and return later unless staff tell you otherwise.

Your safety and patient safety come first, every room, every time.', null;

-- ================= STEP 2: VISUAL (2 lessons with SVG) =================

with c as (select id as cid from public.training_courses where slug = 'medical-cleaning'),
st as (select step_number, id as sid from public.training_steps where course_id = (select cid from c))
insert into public.training_lessons (course_id, step_id, sort_order, kind, title, body, media_svg)
select (select cid from c), (select sid from st where step_number = 2), 1, 'visual', 'PPE: on and off in the right order',
'Study this chart until you can recite both orders from memory. Putting PPE on in the wrong order leaves gaps in protection. Taking it off in the wrong order contaminates your skin and clothes.

PUTTING ON: gown first, then mask, then eye protection, then gloves last (gloves cover the gown cuffs).

TAKING OFF: gloves first, then eye protection, then gown, then mask last. Touch only the insides as you remove each piece.

After everything is off: wash your hands or use hand sanitizer immediately. Every time, no exceptions.',
'<svg width="460" height="320" xmlns="http://www.w3.org/2000/svg"><rect x="10" y="10" width="440" height="300" rx="12" fill="#f8fafc" stroke="#cbd5e1"/><text x="125" y="45" text-anchor="middle" font-size="15" font-weight="bold" fill="#0f172a">PUTTING ON</text><text x="335" y="45" text-anchor="middle" font-size="15" font-weight="bold" fill="#0f172a">TAKING OFF</text><g font-size="14" fill="#0f172a"><rect x="30" y="60" width="190" height="44" rx="8" fill="#dcfce7" stroke="#16a34a"/><text x="50" y="88">1. Gown</text><rect x="30" y="112" width="190" height="44" rx="8" fill="#dcfce7" stroke="#16a34a"/><text x="50" y="140">2. Mask</text><rect x="30" y="164" width="190" height="44" rx="8" fill="#dcfce7" stroke="#16a34a"/><text x="50" y="192">3. Eye protection</text><rect x="30" y="216" width="190" height="44" rx="8" fill="#dcfce7" stroke="#16a34a"/><text x="50" y="244">4. Gloves (cover cuffs)</text><rect x="240" y="60" width="190" height="44" rx="8" fill="#fee2e2" stroke="#dc2626"/><text x="260" y="88">1. Gloves</text><rect x="240" y="112" width="190" height="44" rx="8" fill="#fee2e2" stroke="#dc2626"/><text x="260" y="140">2. Eye protection</text><rect x="240" y="164" width="190" height="44" rx="8" fill="#fee2e2" stroke="#dc2626"/><text x="260" y="192">3. Gown</text><rect x="240" y="216" width="190" height="44" rx="8" fill="#fee2e2" stroke="#dc2626"/><text x="260" y="244">4. Mask (last off)</text></g><text x="230" y="292" text-anchor="middle" font-size="13" font-weight="bold" fill="#0f172a">Wash hands after all PPE is off</text></svg>'
union all select (select cid from c), (select sid from st where step_number = 2), 2, 'visual', 'Cloth color code and blood spill steps',
'Two systems you must never mix up.

CLOTH COLORS keep germs from traveling between zones. Red cloths are for restrooms only. Yellow cloths are for isolation or infectious areas. Green cloths are for kitchens and break rooms. Blue cloths are for general low-risk areas like waiting rooms. A restroom cloth must never touch an exam room surface.

BLOOD SPILL RESPONSE has five steps in order: 1. PPE on and keep others away. 2. Contain the spill. 3. Remove bulk material with disposable towels. 4. Disinfect with full dwell time. 5. Dispose in the correct waste stream, remove PPE, wash hands.

If you remember nothing else: PPE first, contain, disinfect with dwell time, dispose correctly.',
'<svg width="460" height="360" xmlns="http://www.w3.org/2000/svg"><rect x="10" y="10" width="440" height="340" rx="12" fill="#f8fafc" stroke="#cbd5e1"/><text x="115" y="45" text-anchor="middle" font-size="15" font-weight="bold" fill="#0f172a">CLOTH COLOR CODE</text><rect x="25" y="60" width="40" height="40" fill="#ef4444"/><text x="45" y="118" text-anchor="middle" font-size="11" fill="#0f172a">Red</text><text x="45" y="132" text-anchor="middle" font-size="11" fill="#0f172a">Restrooms</text><rect x="80" y="60" width="40" height="40" fill="#eab308"/><text x="100" y="118" text-anchor="middle" font-size="11" fill="#0f172a">Yellow</text><text x="100" y="132" text-anchor="middle" font-size="11" fill="#0f172a">Isolation</text><rect x="135" y="60" width="40" height="40" fill="#22c55e"/><text x="155" y="118" text-anchor="middle" font-size="11" fill="#0f172a">Green</text><text x="155" y="132" text-anchor="middle" font-size="11" fill="#0f172a">Kitchens</text><rect x="190" y="60" width="40" height="40" fill="#3b82f6"/><text x="210" y="118" text-anchor="middle" font-size="11" fill="#0f172a">Blue</text><text x="210" y="132" text-anchor="middle" font-size="11" fill="#0f172a">General</text><text x="345" y="45" text-anchor="middle" font-size="15" font-weight="bold" fill="#0f172a">BLOOD SPILL: 5 STEPS</text><g font-size="13" fill="#0f172a"><rect x="255" y="60" width="180" height="36" rx="8" fill="#fef3c7" stroke="#d97706"/><text x="268" y="83">1. PPE on, clear area</text><rect x="255" y="104" width="180" height="36" rx="8" fill="#fef3c7" stroke="#d97706"/><text x="268" y="127">2. Contain the spill</text><rect x="255" y="148" width="180" height="36" rx="8" fill="#fef3c7" stroke="#d97706"/><text x="268" y="171">3. Remove bulk material</text><rect x="255" y="192" width="180" height="36" rx="8" fill="#fef3c7" stroke="#d97706"/><text x="268" y="215">4. Disinfect, full dwell</text><rect x="255" y="236" width="180" height="36" rx="8" fill="#fef3c7" stroke="#d97706"/><text x="268" y="259">5. Dispose, wash hands</text></g><text x="230" y="310" text-anchor="middle" font-size="13" font-weight="bold" fill="#0f172a">Never use a restroom cloth in an exam room</text><text x="230" y="330" text-anchor="middle" font-size="12" fill="#475569">Treat all blood as infectious</text></svg>';

-- ================= STEP 3: WORKED EXAMPLE =================

with c as (select id as cid from public.training_courses where slug = 'medical-cleaning'),
st as (select step_number, id as sid from public.training_steps where course_id = (select cid from c))
insert into public.training_lessons (course_id, step_id, sort_order, kind, title, body, media_svg)
select (select cid from c), (select sid from st where step_number = 3), 1, 'worked_example', 'Worked example: dental operatory, start to finish',
'THE JOB: A dental operatory (treatment room) after the last patient of the day. About 25 minutes. Products: neutral cleaner, quaternary disinfectant (10-minute dwell), glass cleaner. Blue cloths for general surfaces.

MINUTE 0-3: GATHER AND GEAR UP
Knock, announce yourself, confirm the room is empty. Put on PPE in order: gown, mask, eye protection, gloves. Bring in your caddy, fresh blue cloths, mop, and trash bags. Check the sharps container: it is half full and the lid closes, so you leave it alone.

MINUTE 3-6: TRASH AND TIDY
Remove the regular trash bag without hugging it to your body. Tie it, replace the liner. Check for regulated waste: one gauze with a spot of blood goes in the red biohazard bag. Wipe the trash can lid with disinfectant.

MINUTE 6-10: HIGH DUSTING, THEN CLEAN
Dust high to low: light fixture, shelf tops, monitor. Then clean visible soil: wipe the dental chair, countertops, and sink with neutral cleaner and a blue cloth. Remember: disinfectant cannot work through dirt, so this step matters.

MINUTE 10-18: DISINFECT HIGH-TOUCH SURFACES
Spray quaternary disinfectant on: door handles (both sides), light switches, chair arms and headrest, countertop, faucet handles, sink basin, keyboard and mouse covers, cabinet pulls. Leave everything visibly wet. Start your mental timer: 10 minutes of dwell time. While you wait, damp-mop the floor edges and corners with disinfectant solution.

MINUTE 18-23: DWELL TIME FINISHES
Do not wipe early. At 10 minutes, the disinfection is done. Wipe the chair and counter with a clean dry blue cloth. Spot-clean the mirror with glass cleaner.

MINUTE 23-25: MOP OUT AND GEAR DOWN
Damp-mop the floor from the far corner toward the door. Step out. Remove PPE in order: gloves, eye protection, gown, mask. Dispose of disposables. Wash your hands. Do a final look: surfaces dry and streak-free, trash empty, room stocked and ready.

NOTICE THE DECISIONS: PPE before touching anything. Trash sorted into the right stream. Clean before disinfect. Full 10-minute dwell, timed, not guessed. Blue cloths only — no restroom cloth entered this room. Gloves come off first, mask last, hands washed at the end.

That is a complete medical room clean. Every room follows the same skeleton: gear up, trash, clean, disinfect with dwell, floors, gear down, check.', null;

-- ================= STEP 4: GUIDED PRACTICE (2 lessons) =================

with c as (select id as cid from public.training_courses where slug = 'medical-cleaning'),
st as (select step_number, id as sid from public.training_steps where course_id = (select cid from c))
insert into public.training_lessons (course_id, step_id, sort_order, kind, title, body, media_svg)
select (select cid from c), (select sid from st where step_number = 4), 1, 'guided_practice', 'Practice 1: put the steps in order',
'For each list, put the steps in the correct order. Answers are at the bottom. Cover them and try first.

EXERCISE A: Putting on PPE. The steps are: gloves, gown, eye protection, mask.
Write the correct order: ___, ___, ___, ___.

EXERCISE B: Taking off PPE. The steps are: mask, gloves, gown, eye protection.
Write the correct order: ___, ___, ___, ___.

EXERCISE C: Blood spill response. The steps are: disinfect with full dwell time, put on PPE and clear the area, dispose in the correct waste stream and wash hands, remove bulk material with disposable towels, contain the spill.
Write the correct order: ___, ___, ___, ___, ___.

EXERCISE D: Cleaning an exam room. The steps are: disinfect high-touch surfaces with dwell time, remove trash and sort waste, mop the floor toward the door, dust high to low and clean visible soil, put on PPE.
Write the correct order: ___, ___, ___, ___, ___.

ANSWERS
A: gown, mask, eye protection, gloves. (Gloves last, covering the gown cuffs.)
B: gloves, eye protection, gown, mask. (Mask last off, then wash hands.)
C: PPE on and clear the area, contain the spill, remove bulk material, disinfect with full dwell time, dispose correctly and wash hands.
D: PPE on, trash and waste sort, dust high to low and clean soil, disinfect with dwell time, mop toward the door.

How did you do? If you missed any, re-read the lesson and try again from memory.', null
union all select (select cid from c), (select sid from st where step_number = 4), 2, 'guided_practice', 'Practice 2: spot the mistake',
'Each story has one mistake. Find it. Answers at the bottom.

1. Dana sprays disinfectant on the exam table, wipes it dry immediately, and moves on. The label requires 5 minutes of dwell time. What did she do wrong?

2. Marcus finishes a restroom, keeps the same gloves on, and starts wiping the waiting room chairs. What did he do wrong?

3. Priya finds a used syringe on the counter. She carefully recaps it with both hands and drops it in the regular trash. List everything wrong.

4. Leo mops the exam room floor first, then dusts the shelves and disinfects the counter. What is wrong with this order?

5. Sofia sees a patient chart open on the counter and reads it while she dusts. What rule did she break?

ANSWERS
1. She skipped the dwell time. The surface stayed wet for seconds, not 5 minutes, so it was not disinfected.
2. He wore restroom gloves into a clean area. That is cross-contamination. Change gloves (and cloths) between zones.
3. Three mistakes: never recap a needle, never handle a sharp with hands (use tongs), and never put sharps in regular trash (sharps container only).
4. He worked low to high. Dusting after mopping drops dirt onto the clean floor. Always high to low, floors last.
5. She violated patient privacy. Never read charts or screens. Knock, announce, and respect private information.

If you caught all five, you are thinking like a medical cleaner.', null;

-- ================= STEP 5: SIMULATOR =================

with c as (select id as cid from public.training_courses where slug = 'medical-cleaning'),
st as (select step_number, id as sid from public.training_steps where course_id = (select cid from c))
insert into public.training_lessons (course_id, step_id, sort_order, kind, title, body, media_svg)
select (select cid from c), (select sid from st where step_number = 5), 1, 'simulator', 'Simulator: blood in the hallway',
'Read the situation. Choose A, B, or C. Then read what happens with each choice.

SITUATION
It is 9:40 AM. You are damp-mopping the main hallway of an urgent care clinic. Around the corner near the restroom door, you see a pool of blood about the size of a dinner plate. No one else is around. Patients walk this hallway. Your spill kit and PPE are on your cart 20 feet away.

OPTION A: Mop over it quickly with your disinfectant mop so nobody slips, then keep going.
OPTION B: Stop. Put on gloves and PPE, set a wet-floor sign to block the area, get your spill kit, tell the front desk, contain and clean the spill with full dwell time, dispose correctly.
OPTION C: Leave it there. It is not your assigned area, and the clinic staff will find it eventually.

WHAT HAPPENS

Option A: You spread blood across the hallway with your mop. Your mop head is now contaminated and you have tracked blood into areas you already cleaned. You had no proper PPE for blood. The disinfectant never got dwell time on the blood. You created a bigger hazard and broke infection control rules. This is a failure.

Option C: A patient slips in the blood and is hurt. Other patients walk through it and track it everywhere. You knew about a biohazard and walked away. This is a serious failure and could cost you the job.

Option B: CORRECT. You protected yourself first with PPE. You protected others by blocking the area. You told staff so they knew. You contained the spill, removed the bulk material, disinfected with the full dwell time, and disposed of everything in the right waste stream. Then you removed PPE correctly and washed your hands. The hallway is safe again.

THE LESSON: With blood, the order is always protect, contain, clean, disinfect with dwell time, dispose. Speed never beats safety. When in doubt, stop and get your supervisor. No one will ever punish you for handling blood carefully.', null;

-- ================= STEP 6: WRITTEN EXAM (24 questions: 8 groups x 3) =================

with c as (select id as cid from public.training_courses where slug = 'medical-cleaning')
insert into public.training_questions (course_id, kind, variant_group, question, choices, correct_index, explanation)
select (select cid from c), 'written', 'dwell-time', 'A disinfectant label says the dwell time is 10 minutes. What does this mean?', '["The surface must stay wet with the product for 10 minutes","You must wait 10 minutes before spraying","The product takes 10 minutes to mix","You should scrub the surface for 10 minutes"]'::jsonb, 0, 'Dwell time is the wet contact time the product needs to kill germs.'
union all select (select cid from c), 'written', 'dwell-time', 'You spray disinfectant on an exam table and wipe it dry after 30 seconds. The label requires 5 minutes of dwell time. What is the result?', '["The table is disinfected because you used enough product","The table is probably NOT disinfected — the dwell time was skipped","The table is clean so disinfectant was not needed","Wiping faster makes the product work better"]'::jsonb, 1, 'Wiping before the dwell time ends means the germs were not killed.'
union all select (select cid from c), 'written', 'dwell-time', 'Where do you find the required dwell time for a disinfectant?', '["On the product label","On the spray bottle cap","You guess based on the smell","Dwell time is the same for every product"]'::jsonb, 0, 'The label is the law — it states the exact dwell time.'
union all select (select cid from c), 'written', 'ppe-order', 'What is the correct order for PUTTING ON PPE?', '["Gloves, gown, mask, eye protection","Gown, mask, eye protection, gloves","Mask, gloves, gown, eye protection","Eye protection, gloves, gown, mask"]'::jsonb, 1, 'Gloves go on last so they cover the gown cuffs.'
union all select (select cid from c), 'written', 'ppe-order', 'When TAKING OFF PPE, what comes off first?', '["The mask","The gown","Gloves","Eye protection"]'::jsonb, 2, 'Gloves are the most contaminated, so they come off first.'
union all select (select cid from c), 'written', 'ppe-order', 'After removing all PPE, what must you do immediately?', '["Put on a new pair of gloves","Wash or sanitize your hands","Take a break","Start the next room right away"]'::jsonb, 1, 'Hand hygiene after doffing is required every time.'
union all select (select cid from c), 'written', 'sharps', 'You find a used needle on the floor of an exam room. What do you do?', '["Pick it up carefully with your gloved hand","Use tongs or a dustpan and place it in a sharps container","Push it under the cabinet for maintenance","Recap it and throw it in the regular trash"]'::jsonb, 1, 'Never touch a sharp with your hands — use tongs and a sharps container.'
union all select (select cid from c), 'written', 'sharps', 'Which of these is NEVER allowed with a used needle?', '["Placing it in a sharps container","Picking it up with tongs","Recapping it","Calling your supervisor"]'::jsonb, 2, 'Recapping causes needlestick injuries and is never allowed.'
union all select (select cid from c), 'written', 'sharps', 'A sharps container is full to the top and the lid will not close. You should:', '["Push the contents down with your hand","Tell your supervisor and do not use that container","Empty it into the regular trash","Leave it and keep working"]'::jsonb, 1, 'Never push sharps down by hand. Report a full container at once.'
union all select (select cid from c), 'written', 'chemical-mixing', 'What happens if you mix bleach with ammonia or an acid cleaner?', '["It cleans twice as well","It creates toxic gas that can injure or kill","It becomes safe to use without gloves","Nothing — mixing is harmless"]'::jsonb, 1, 'Mixing bleach with ammonia or acids releases toxic gas.'
union all select (select cid from c), 'written', 'chemical-mixing', 'You want a stronger cleaner, so you mix two different products in one bottle. This is:', '["A good way to save time","Dangerous — never mix chemicals","Fine if both are disinfectants","Required for medical cleaning"]'::jsonb, 1, 'Never mix chemicals unless a label specifically tells you to.'
union all select (select cid from c), 'written', 'chemical-mixing', 'Before using any cleaning chemical, where do you check for hazards and first aid?', '["The safety data sheet (SDS)","The company website homepage","You do not need to check anything","Ask another cleaner to guess"]'::jsonb, 0, 'The SDS lists hazards, first aid, and spill steps for every product.'
union all select (select cid from c), 'written', 'high-touch', 'Which of these is a high-touch surface that must be disinfected?', '["The top of a tall cabinet","A light switch","The inside of a supply closet","A ceiling vent"]'::jsonb, 1, 'Light switches are touched by many hands and must be disinfected.'
union all select (select cid from c), 'written', 'high-touch', 'Why do high-touch surfaces get special attention in medical facilities?', '["They are the most visible","Many hands touch them, so germs spread through them","They are the hardest to reach","They use the most product"]'::jsonb, 1, 'Germs travel on hands, so high-touch surfaces are transmission points.'
union all select (select cid from c), 'written', 'high-touch', 'Which list is ALL high-touch surfaces?', '["Door handles, exam tables, faucets, light switches","Ceilings, baseboards, windows, floors","Supply shelves, curtains, vents, mirrors","Trash cans, mop buckets, carts, closets"]'::jsonb, 0, 'Handles, tables, faucets, and switches are all touched constantly.'
union all select (select cid from c), 'written', 'medical-waste', 'Bloody gauze and used bandages go in:', '["The regular trash bag","A red biohazard bag","The recycling bin","A sharps container"]'::jsonb, 1, 'Blood-soaked materials are regulated medical waste — red bag.'
union all select (select cid from c), 'written', 'medical-waste', 'Paper towels and empty supply boxes from an exam room go in:', '["A red biohazard bag","The regular trash","A sharps container","The laundry hamper"]'::jsonb, 1, 'Non-contaminated waste is regular trash, not biohazard.'
union all select (select cid from c), 'written', 'medical-waste', 'You are not sure whether an item is regulated medical waste. You should:', '["Put it in the regular trash to be safe","Ask your supervisor — never guess with medical waste","Put everything in the red bag just in case","Leave it for the next shift"]'::jsonb, 1, 'Never guess with medical waste. Ask your supervisor.'
union all select (select cid from c), 'written', 'blood-spill', 'Before cleaning up any blood spill, you must first:', '["Put on gloves and other PPE","Mop the area quickly","Open the windows","Move the patient"]'::jsonb, 0, 'Protect yourself with PPE before touching any blood.'
union all select (select cid from c), 'written', 'blood-spill', 'Treat all blood and body fluids as:', '["Harmless if they look clean","Infectious — always assume they can carry disease","Safe after 5 minutes in the air","Only dangerous in hospitals, not clinics"]'::jsonb, 1, 'Universal precaution: assume all blood and body fluids are infectious.'
union all select (select cid from c), 'written', 'blood-spill', 'After applying disinfectant to a blood spill, you must:', '["Leave the area wet and walk away","Allow the full dwell time, then dispose of materials correctly","Rinse with water only","Dry it with a regular towel and reuse the towel"]'::jsonb, 1, 'Full dwell time plus correct disposal completes the job safely.'
union all select (select cid from c), 'written', 'privacy', 'While cleaning an exam room you see a patient chart open on the counter. You should:', '["Read it to learn about the patient","Not read it — respect patient privacy","Take a photo to show your coworker","Move it to the waiting room"]'::jsonb, 1, 'Patient information is private. Never read charts or screens.'
union all select (select cid from c), 'written', 'privacy', 'A computer screen at a nurse station shows patient names. While cleaning nearby you should:', '["Avoid looking at or touching the screen","Read the names to check your schedule","Turn the computer off","Move the mouse to see more"]'::jsonb, 0, 'Do not look at or touch screens showing patient information.'
union all select (select cid from c), 'written', 'privacy', 'Before entering an occupied exam room to clean, you should:', '["Walk in quietly without disturbing anyone","Knock, announce yourself, and wait for permission","Clean around the patient silently","Skip it — occupied rooms are never cleaned"]'::jsonb, 1, 'Always knock, announce, and wait for permission before entering.';

-- ================= STEP 7: SCENARIO EXAM (10 questions: 5 groups x 2) =================

with c as (select id as cid from public.training_courses where slug = 'medical-cleaning')
insert into public.training_questions (course_id, kind, variant_group, question, choices, correct_index, explanation)
select (select cid from c), 'scenario', 'blood-spill-scenario', 'You are mopping a clinic hallway and find a pool of blood near the restroom door. No one else is around. What do you do first?', '["Mop over it quickly so nobody slips","Put on gloves, block the area, get your spill kit and tell staff","Wipe it with a dry paper towel and keep mopping","Pour disinfectant on it and leave it for the next cleaner"]'::jsonb, 1, 'Blood needs PPE, containment, full dwell-time disinfection, and correct disposal — never rushed.'
union all select (select cid from c), 'scenario', 'blood-spill-scenario', 'A patient in the waiting room has a nosebleed and blood drips on a chair. Staff are helping the patient. You should:', '["Clean the chair immediately while staff work","Wait until the patient is cared for, then clean with PPE and disinfectant","Spray air freshener and ignore it","Ask the patient to clean it"]'::jsonb, 1, 'Let staff care for the patient first, then clean properly with PPE.'
union all select (select cid from c), 'scenario', 'sharps-found', 'While emptying trash in a dental operatory you see a used needle inside the regular trash bag. What do you do?', '["Pull it out with your gloved hand and move it to sharps","Stop, do not reach in — use tongs, tell your supervisor, dispose in a sharps container","Tie the bag and throw it in the dumpster","Leave the bag for someone else"]'::jsonb, 1, 'Never reach into trash for a sharp. Use tongs, report it, use the sharps container.'
union all select (select cid from c), 'scenario', 'sharps-found', 'You find an uncapped syringe on top of an overfilled sharps container. What is the safe response?', '["Push it into the container with your hand","Use tongs to place it safely and report the full container","Cap it and put it in your pocket","Ignore it — sharps are the clinic''s problem"]'::jsonb, 1, 'Use tongs, never your hand, and report the overfilled container at once.'
union all select (select cid from c), 'scenario', 'patient-present', 'You enter an exam room to clean and a patient is still getting dressed behind the curtain. You should:', '["Start cleaning quietly to stay on schedule","Step out, apologize, and return later","Clean around them quickly","Ask them to hurry up"]'::jsonb, 1, 'Respect patient privacy and dignity — leave and come back.'
union all select (select cid from c), 'scenario', 'patient-present', 'A patient asks you what their test results were while you clean the room. You should:', '["Tell them what you overheard from staff","Politely say you do not have that information and direct them to staff","Guess based on the equipment in the room","Ignore the patient completely"]'::jsonb, 1, 'Never share or guess at medical information. Direct them to clinical staff.'
union all select (select cid from c), 'scenario', 'chemical-splash', 'Disinfectant splashes into your eye while spraying. What do you do?', '["Rub your eye and keep working","Rinse your eye with water for 15 minutes and get help","Wipe it with a dirty cloth","Wait to see if it hurts later"]'::jsonb, 1, 'Eye exposure needs long rinsing and help — the SDS confirms this.'
union all select (select cid from c), 'scenario', 'chemical-splash', 'You feel dizzy using a strong disinfectant in a small room with no ventilation. You should:', '["Keep working — dizziness is normal","Leave for fresh air immediately and tell your supervisor","Spray more to finish faster","Sit on the floor and wait"]'::jsonb, 1, 'Dizziness signals chemical overexposure. Get air and report it.'
union all select (select cid from c), 'scenario', 'rushed-disinfection', 'You are behind schedule. A supervisor asks you to skip dwell time to catch up. You should:', '["Skip it — the supervisor said so","Explain that skipping dwell time means surfaces are not disinfected, and do the job correctly","Spray twice as much to make up for it","Only skip it in rooms that look clean"]'::jsonb, 1, 'No one can authorize skipping disinfection — patient safety comes first.'
union all select (select cid from c), 'scenario', 'rushed-disinfection', 'A coworker tells you they never wait for dwell time and ''nobody checks.'' What do you do?', '["Do the same to fit in","Keep following dwell time — patient safety comes first","Report them to the police","Only follow dwell time when watched"]'::jsonb, 1, 'Do the job right whether or not anyone is watching.';

-- ================= STEP 8: PRACTICAL =================

with c as (select id as cid from public.training_courses where slug = 'medical-cleaning')
insert into public.training_practicals (course_id, title, instructions, checklist)
select (select cid from c), 'Exam room terminal clean',
'Perform a complete terminal clean of a medical exam room exactly as trained. Your manager will observe or review photos. Work clean-to-dirty and high-to-low, respect all dwell times, and handle all waste correctly.',
'["Put on PPE in the correct order before starting","Removed regular trash and replaced liners without hugging the bag","Placed any regulated waste in the correct container — none in regular trash","Cleaned first, then disinfected — no disinfectant applied over visible soil","Disinfected all high-touch surfaces: door handles, light switches, exam table, chair arms, faucet, counter","Allowed the full label dwell time before wiping disinfected surfaces","Used color-coded cloths correctly — no restroom cloth used in the exam area","Worked high to low and from clean areas toward dirty areas","Removed PPE in the correct order and performed hand hygiene","Room left dry, stocked, trash-free, and ready for the next patient"]'::jsonb;
