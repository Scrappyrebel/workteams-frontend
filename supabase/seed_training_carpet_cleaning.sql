-- Seed: Carpet Cleaning (carpet-cleaning)
-- Run AFTER 021_training_academy.sql in the WorkTeams Supabase project.
-- Note: prose strings use $$ dollar-quoting so apostrophes need no escaping.

delete from public.training_questions where course_id = (select id from public.training_courses where slug = 'carpet-cleaning');
delete from public.training_lessons where course_id = (select id from public.training_courses where slug = 'carpet-cleaning');
delete from public.training_practicals where course_id = (select id from public.training_courses where slug = 'carpet-cleaning');
delete from public.training_steps where course_id = (select id from public.training_courses where slug = 'carpet-cleaning');
delete from public.training_courses where slug = 'carpet-cleaning';

insert into public.training_courses (slug, title, description, category, department, sort_order, estimated_hours, recert_months)
values ('carpet-cleaning', 'Carpet Cleaning', 'Hot-water extraction and encapsulation: fiber ID, spotting, and equipment operation.', 'cleaning', 'Floor Care', 7, 4, 12);

with c as (select id as cid from public.training_courses where slug = 'carpet-cleaning')
insert into public.training_steps (course_id, step_number, step_key, title, description)
select cid, 1, 'reading', $$Reading: fibers, soil, and chemistry$$, $$Core knowledge: fiber types, pH, spotting science.$$ from c
union all select cid, 2, 'visual', $$Visual guide: fiber ID chart and wand passes$$, $$Diagrams that reinforce the reading.$$ from c
union all select cid, 3, 'worked_example', $$Worked example: 600 sq ft extraction job$$, $$Three bedrooms and a hall, start to finish.$$ from c
union all select cid, 4, 'guided_practice', $$Guided practice: spot ID and fiber ID$$, $$Practice with coaching and checkpoints.$$ from c
union all select cid, 5, 'simulator', $$Simulator: the wool surprise$$, $$Make the call when the fiber is not what you assumed.$$ from c
union all select cid, 6, 'written_exam', $$Written exam$$, $$Randomized questions. 80% to pass.$$ from c
union all select cid, 7, 'scenario_exam', $$Scenario exam$$, $$What would you do? 80% to pass.$$ from c
union all select cid, 8, 'practical_final', $$Practical final$$, $$Demonstrate extraction against a checklist.$$ from c
union all select cid, 9, 'evidence', $$Evidence submission$$, $$Upload photo proof of your work.$$ from c
union all select cid, 10, 'approval', $$Manager approval$$, $$A manager reviews and approves.$$ from c
union all select cid, 11, 'recertification', $$Recertification$$, $$Stay current. Renew before expiry.$$ from c;

-- ============ STEP 1: READING (3 lessons) ============

with c as (select id as cid from public.training_courses where slug = 'carpet-cleaning'),
st as (select step_number, id as sid from public.training_steps where course_id = (select cid from c))
insert into public.training_lessons (course_id, step_id, sort_order, kind, title, body, media_svg)
select (select cid from c), (select sid from st where step_number = 1), 1, 'reading', $$Carpet fibers: know what you are cleaning$$,
$$Every carpet is made of fiber, and the fiber decides what you are allowed to do to it. Clean the wrong fiber the wrong way and you can melt it, shrink it, or dye-stain it permanently. Fiber identification comes BEFORE heat, BEFORE strong chemicals, every time.

THE BIG FOUR FIBERS:

NYLON. The most common commercial carpet fiber. Tough, resilient, hides soil well. Handles hot water extraction and normal alkaline pre-sprays. The workhorse. If you only remember one fiber, remember nylon.

OLEFIN (polypropylene). Common in basements, rentals, and commercial glue-down. Very stain resistant to water-based spills, but oil loves it, so it can look dirty even when clean. Low melting point: keep heat moderate and never park a hot iron or steamer on it. Bleach-resistant, which is why you see it in rentals.

POLYESTER. Soft, great color clarity, common in residential cut pile. Not as resilient as nylon, so traffic lanes crush flat. Handles normal extraction fine.

WOOL. The premium natural fiber, and the one that punishes mistakes. Wool is damaged by high heat, high alkalinity, and aggressive agitation. It can shrink, felt, and bleed dye. On wool: low heat, neutral-pH products, gentle passes, and when in doubt, call your supervisor before you touch it. A $10,000 wool rug ruined by a hot alkaline pre-spray is a career-defining mistake.

PILE TYPES: cut pile (soft, upright yarns, shows footprints) and loop pile or berber (loops, hides traffic, can snag). Berber with loops: never use aggressive rotary agitation that can pull loops.

THE BURN TEST (field version, only if trained and with permission): clip a few fibers from a closet corner, hold with tweezers, burn, observe. Nylon melts into a hard bead. Olefin melts fast with a waxy smell. Polyester melts into a hard dark bead. Wool chars, smells like burnt hair, and crushes to ash. Never do a burn test in the middle of a client's room or near anything flammable.

DEFAULT RULE: if you cannot identify the fiber, treat it gently. Moderate heat, neutral pH, test in a closet first. Caution never ruined a carpet.$$, null
union all select (select cid from c), (select sid from st where step_number = 1), 2, 'reading', $$Soil, spots, and chemistry$$,
$$Carpet soil comes in two families, and each needs a different approach.

DRY SOIL is the gritty stuff: sand, dust, tracked-in dirt. It does most of the damage because sharp grit cuts fibers every time feet grind it in. The fix is boring and essential: thorough vacuuming BEFORE any wet cleaning. A carpet that is not pre-vacuumed is being cleaned with mud.

OILY SOIL is the sticky stuff: cooking grease, body oils, tracked-in grime. Water alone will not touch it. That is what pre-spray is for: an alkaline cleaner that breaks oil's grip so extraction can rinse it away.

THE pH SCALE, simplified: 0 to 6 is acidic, 7 is neutral, 8 to 14 is alkaline. Acids dissolve mineral and tannin stains (coffee, tea, rust). Alkalines dissolve oils and grease. Neutral is the safe middle. Match the chemistry to the soil, and rinse so no sticky residue stays behind. Residue is the number one cause of rapid re-soiling: the carpet looks great Tuesday and dirty Friday because leftover soap grabbed new dirt.

SPOTTING RULES (for individual spots before or during the job):
1. Identify the spot if you can: coffee, grease, ink, pet urine, paint. Different spots, different spotters.
2. Blot, never rub. Rubbing spreads the spot and damages pile.
3. Work from the outside of the spot inward, so you do not spread it.
4. Apply spotter to the cloth or the spot sparingly, give it dwell time, then blot and extract.
5. Test every spotter in a hidden area first. Some dyes bleed.
6. Never use bleach on carpet unless you are trained and the fiber allows it. Bleach spots are permanent.

GENERIC SPOTTER TYPES you will hear about: neutral spotter (everyday), acid/tannin spotter (coffee, tea, wine), protein spotter with enzymes (blood, milk, pet urine), solvent spotter (grease, tar, gum). Use the mildest one that works. Strong chemistry is a last resort, not a first move.

PET URINE deserves special mention: it soaks into the pad, and surface cleaning will not reach it. Enzyme treatment needs dwell time to work. If the pad is saturated, say so honestly. Some jobs need pad replacement, not more cleaning.$$, null
union all select (select cid from c), (select sid from st where step_number = 1), 3, 'reading', $$Hot-water extraction and encapsulation$$,
$$There are two main professional methods. Most jobs use hot-water extraction. Learn both.

HOT-WATER EXTRACTION (HWE), often called steam cleaning (though it is hot water, not steam). The process:
1. PRE-VACUUM thoroughly. Dry soil out first.
2. PRE-SPRAY the traffic lanes and spots with the right pre-spray for the fiber. Give it 5 to 15 minutes of dwell time. Dwell time is when chemistry works; skipping it is like pulling bread out of the oven early.
3. AGITATE lightly if needed, with a brush or bonnet, to work the pre-spray in.
4. EXTRACT with the wand: hot water goes down through the wand jets, and the vacuum pulls it right back up with the dissolved soil. Passes are slow and overlapping. Keep the wand MOVING. Parking a hot wand in one spot over-wets and can damage backing.
5. DRY PASSES. After the wet pass, make one or two vacuum-only passes over the same area. Dry passes pull out remaining moisture and are half of what makes a carpet dry fast.
6. GROOM the pile with a carpet rake so it dries uniform and looks finished.

ENCAPSULATION: a low-moisture method. You apply a crystallizing polymer solution, agitate it in, and it surrounds soil particles. When it dries, the crystals are vacuumed away. Great for commercial maintenance cleans and fast dry times. Not a substitute for extraction on trashed carpet, but excellent for interim cleaning.

THE OVER-WETTING DANGERS: too much water causes mildew and musty odor, browning (wicking of stains from backing), shrinkage (especially natural fibers), and delamination where the backing glue fails. Signs you are over-wetting: the wand leaves standing water, your dry passes pull up streams, the carpet squishes underfoot. Fix: more dry passes, air movers, and less water on the next section.

EQUIPMENT BASICS: a portable extractor has a solution tank (clean hot water) and a recovery tank (dirty water). Empty the recovery tank and refill the solution tank BEFORE they force you to stop mid-room. Hoses: keep them routed so nobody trips. The wand: trigger controls water, vacuum runs continuously. At the end of the job, flush the system with clean water so chemical does not sit in the lines.

DRY TIME GOAL: with proper dry passes and airflow, carpet should feel dry to the touch in 4 to 8 hours, faster with air movers. If it is still soggy the next day, something went wrong.$$, null;

-- ============ STEP 2: VISUAL (2 lessons with SVG) ============

with c as (select id as cid from public.training_courses where slug = 'carpet-cleaning'),
st as (select step_number, id as sid from public.training_steps where course_id = (select cid from c))
insert into public.training_lessons (course_id, step_id, sort_order, kind, title, body, media_svg)
select (select cid from c), (select sid from st where step_number = 2), 1, 'visual', $$Diagram: fiber ID quick chart$$,
$$Memorize this chart. When you cannot identify a fiber with confidence, treat it as wool: gentle heat, neutral pH, test hidden first.

The burn test is a field tool, not a party trick. Clip fibers from a closet corner, use tweezers, and keep water nearby. Never test in the middle of a room.$$,
'<svg width="640" height="330" xmlns="http://www.w3.org/2000/svg" font-family="sans-serif"><rect x="5" y="5" width="630" height="320" rx="12" fill="#f8fafc" stroke="#cbd5e1"/><text x="320" y="35" text-anchor="middle" font-size="16" font-weight="bold" fill="#0f172a">FIBER ID QUICK CHART (burn test)</text><rect x="30" y="55" width="130" height="40" fill="#1e293b"/><text x="95" y="80" text-anchor="middle" font-size="13" font-weight="bold" fill="#fff">FIBER</text><rect x="160" y="55" width="150" height="40" fill="#1e293b"/><text x="235" y="80" text-anchor="middle" font-size="13" font-weight="bold" fill="#fff">WHEN BURNED</text><rect x="310" y="55" width="150" height="40" fill="#1e293b"/><text x="385" y="80" text-anchor="middle" font-size="13" font-weight="bold" fill="#fff">SMELL / RESIDUE</text><rect x="460" y="55" width="150" height="40" fill="#1e293b"/><text x="535" y="80" text-anchor="middle" font-size="13" font-weight="bold" fill="#fff">SAFE APPROACH</text><rect x="30" y="95" width="130" height="52" fill="#dbeafe"/><text x="95" y="125" text-anchor="middle" font-size="13" font-weight="bold" fill="#1e3a8a">Nylon</text><rect x="160" y="95" width="150" height="52" fill="#eff6ff"/><text x="235" y="118" text-anchor="middle" font-size="12" fill="#334155">Melts, shrinks</text><text x="235" y="134" text-anchor="middle" font-size="12" fill="#334155">from flame</text><rect x="310" y="95" width="150" height="52" fill="#eff6ff"/><text x="385" y="118" text-anchor="middle" font-size="12" fill="#334155">Hard tan bead,</text><text x="385" y="134" text-anchor="middle" font-size="12" fill="#334155">celery-like odor</text><rect x="460" y="95" width="150" height="52" fill="#eff6ff"/><text x="535" y="118" text-anchor="middle" font-size="12" fill="#334155">Normal HWE,</text><text x="535" y="134" text-anchor="middle" font-size="12" fill="#334155">alkaline pre-spray OK</text><rect x="30" y="147" width="130" height="52" fill="#fef3c7"/><text x="95" y="177" text-anchor="middle" font-size="13" font-weight="bold" fill="#92400e">Olefin</text><rect x="160" y="147" width="150" height="52" fill="#fffbeb"/><text x="235" y="170" text-anchor="middle" font-size="12" fill="#334155">Melts fast</text><text x="235" y="186" text-anchor="middle" font-size="12" fill="#334155">burns quickly</text><rect x="310" y="147" width="150" height="52" fill="#fffbeb"/><text x="385" y="170" text-anchor="middle" font-size="12" fill="#334155">Waxy smell,</text><text x="385" y="186" text-anchor="middle" font-size="12" fill="#334155">hard bead</text><rect x="460" y="147" width="150" height="52" fill="#fffbeb"/><text x="535" y="170" text-anchor="middle" font-size="12" fill="#334155">Moderate heat,</text><text x="535" y="186" text-anchor="middle" font-size="12" fill="#334155">no high heat</text><rect x="30" y="199" width="130" height="52" fill="#ede9fe"/><text x="95" y="229" text-anchor="middle" font-size="13" font-weight="bold" fill="#5b21b6">Polyester</text><rect x="160" y="199" width="150" height="52" fill="#f5f3ff"/><text x="235" y="222" text-anchor="middle" font-size="12" fill="#334155">Melts into</text><text x="235" y="238" text-anchor="middle" font-size="12" fill="#334155">dark hard bead</text><rect x="310" y="199" width="150" height="52" fill="#f5f3ff"/><text x="385" y="222" text-anchor="middle" font-size="12" fill="#334155">Sweet chemical</text><text x="385" y="238" text-anchor="middle" font-size="12" fill="#334155">smell</text><rect x="460" y="199" width="150" height="52" fill="#f5f3ff"/><text x="535" y="222" text-anchor="middle" font-size="12" fill="#334155">Normal HWE,</text><text x="535" y="238" text-anchor="middle" font-size="12" fill="#334155">gentle agitation</text><rect x="30" y="251" width="130" height="52" fill="#fee2e2"/><text x="95" y="281" text-anchor="middle" font-size="13" font-weight="bold" fill="#b91c1c">Wool</text><rect x="160" y="251" width="150" height="52" fill="#fef2f2"/><text x="235" y="274" text-anchor="middle" font-size="12" fill="#334155">Chars, does</text><text x="235" y="290" text-anchor="middle" font-size="12" fill="#334155">not melt</text><rect x="310" y="251" width="150" height="52" fill="#fef2f2"/><text x="385" y="274" text-anchor="middle" font-size="12" fill="#334155">Burnt hair smell,</text><text x="385" y="290" text-anchor="middle" font-size="12" fill="#334155">crushable ash</text><rect x="460" y="251" width="150" height="52" fill="#fef2f2"/><text x="535" y="274" text-anchor="middle" font-size="12" fill="#b91c1c" font-weight="bold">LOW heat, neutral pH,</text><text x="535" y="290" text-anchor="middle" font-size="12" fill="#b91c1c" font-weight="bold">ask supervisor</text></svg>'
union all select (select cid from c), (select sid from st where step_number = 2), 2, 'visual', $$Diagram: the extraction wand pass$$,
$$The wand pass has two parts. The WET pass (trigger on): pull the wand toward you slowly, about 1 foot per second, laying hot water down and vacuuming it back up. Then the DRY pass (trigger off): push back over the same lane with vacuum only, pulling out leftover moisture.

Overlap each lane by half the wand width. Rushing the wand is the number one cause of carpets that stay wet for a day. Slow is smooth, smooth is dry.$$,
'<svg width="640" height="300" xmlns="http://www.w3.org/2000/svg" font-family="sans-serif"><rect x="5" y="5" width="630" height="290" rx="12" fill="#f8fafc" stroke="#cbd5e1"/><text x="320" y="35" text-anchor="middle" font-size="16" font-weight="bold" fill="#0f172a">WAND PASS: WET PULL + DRY PUSH, OVERLAPPED</text><rect x="120" y="60" width="400" height="170" fill="#e0f2fe" stroke="#0284c7" stroke-width="2"/><rect x="130" y="70" width="180" height="150" fill="#bae6fd" opacity="0.7"/><rect x="230" y="70" width="180" height="150" fill="#7dd3fc" opacity="0.7"/><rect x="330" y="70" width="180" height="150" fill="#bae6fd" opacity="0.7"/><text x="220" y="140" text-anchor="middle" font-size="13" font-weight="bold" fill="#0c4a6e">WET PASS</text><text x="220" y="160" text-anchor="middle" font-size="12" fill="#0c4a6e">trigger ON</text><text x="220" y="178" text-anchor="middle" font-size="12" fill="#0c4a6e">pull slowly &#8592;</text><text x="420" y="140" text-anchor="middle" font-size="13" font-weight="bold" fill="#0c4a6e">DRY PASS</text><text x="420" y="160" text-anchor="middle" font-size="12" fill="#0c4a6e">trigger OFF</text><text x="420" y="178" text-anchor="middle" font-size="12" fill="#0c4a6e">push back &#8594;</text><text x="320" y="255" text-anchor="middle" font-size="13" fill="#92400e" font-weight="bold">Overlap lanes by half the wand width. ~1 ft per second.</text><text x="320" y="278" text-anchor="middle" font-size="13" fill="#b91c1c" font-weight="bold">NEVER park a hot wand in one spot.</text></svg>';

-- ============ STEP 3: WORKED EXAMPLE ============

with c as (select id as cid from public.training_courses where slug = 'carpet-cleaning'),
st as (select step_number, id as sid from public.training_steps where course_id = (select cid from c))
insert into public.training_lessons (course_id, step_id, sort_order, kind, title, body, media_svg)
select (select cid from c), (select sid from st where step_number = 3), 1, 'worked_example', $$Worked example: 600 sq ft extraction job$$,
$$THE JOB: a rental home turnover. Three bedrooms and a hallway, about 600 sq ft of nylon cut-pile carpet. Moderate soiling, traffic lanes gray, a coffee spot in bedroom 2, pet odor in bedroom 3. Your crew: just you, with a portable extractor. Time budget: about 3 hours.

MINUTE 0 - WALKTHROUGH AND FIBER CHECK (10 min). Walk every room. The carpet is standard nylon cut pile, no wool, no berber loops. Note the coffee spot and the pet odor room. Check the extractor: solution tank full of hot water, recovery tank empty, hoses connected, wand trigger working. Set up air movers at the hallway.

MINUTE 10 - PRE-VACUUM (25 min). Vacuum everything slowly, two directions in the traffic lanes. The amount of dry soil that comes up always surprises new techs. This step is not optional. Empty the vacuum when full.

MINUTE 35 - SPOTTING (15 min). Coffee spot in bedroom 2: blot, apply tannin/acid spotter to a cloth, work outside-in, dwell 5 minutes, blot, extract the area with the wand. Pet odor in bedroom 3: apply enzyme spotter generously (it must reach the pad), note that it needs dwell time. You will extract this room last so the enzymes work longest.

MINUTE 50 - PRE-SPRAY (20 min). Mix pre-spray per label. Spray the traffic lanes and the whole hallway evenly. Do NOT soak it. Set a timer: 10 minutes dwell. While it dwells, groom the bedrooms lightly with a brush to work the pre-spray in.

MINUTE 80 - EXTRACTION (75 min). Start in the farthest bedroom. Wand technique: slow wet pull toward you, then dry push back, overlapping half the wand width. Bedroom 1, bedroom 2, then bedroom 3 last (enzymes had maximum dwell). The hallway last so you exit without walking on damp carpet. Watch the recovery tank: when the water coming up runs nearly clear, your passes are working. Empty the recovery tank once mid-job.

MINUTE 155 - DRY PASSES AND GROOM (15 min). One more full dry pass over the traffic lanes. Groom all pile in one direction with the carpet rake. Set air movers blowing across the carpet, not straight down.

MINUTE 170 - FINAL CHECK (10 min). Walk the job: traffic lanes even, no spots remaining, edges clean, no hoses left behind. Tell the property manager: dry in 4 to 6 hours with the air movers running, furniture can go back this evening.

TOTAL: about 3 hours. The traffic lanes are gone, the coffee spot is gone, the pet room smells neutral. That is a $250 job that leads to every turnover that property manager handles.$$, null;

-- ============ STEP 4: GUIDED PRACTICE (2 lessons) ============

with c as (select id as cid from public.training_courses where slug = 'carpet-cleaning'),
st as (select step_number, id as sid from public.training_steps where course_id = (select cid from c))
insert into public.training_lessons (course_id, step_id, sort_order, kind, title, body, media_svg)
select (select cid from c), (select sid from st where step_number = 4), 1, 'guided_practice', $$Practice: spot identification$$,
$$Match each spot to its best first treatment. Write your answers, then check the key. Use a piece of scrap carpet for the hands-on part.

1. Black coffee spill, still damp
2. Dried grease spot by the kitchen entry
3. Dried blood spot
4. Red wine, fresh
5. Old pet urine stain with odor
6. Chewing gum pressed into pile

ANSWER KEY:
1. Blot up excess, then tannin/acid spotter. Coffee is a tannin stain; acids dissolve tannins.
2. Solvent spotter, blotting. Grease is oil-based; solvents dissolve oils.
3. Cold water and enzyme/protein spotter. Never hot water first: heat sets protein stains like blood and milk.
4. Blot immediately, then tannin/acid spotter. Speed matters more than product with fresh wine.
5. Enzyme spotter with long dwell time, applied generously to reach the pad. Surface cleaning alone will not fix pad contamination.
6. Freeze with ice, then shatter and pick out the pieces. Gum gets brittle when frozen.

Now practice on scrap carpet: make a coffee spot and a grease spot (a dab of cooking oil). Treat each one using the steps above: blot, identify, choose the spotter, outside-in, dwell, blot, check. If the spot spreads, you rubbed instead of blotting or worked inside-out. Reset and try again. Spotting is a hand skill. Your hands learn it by doing, not by reading.$$, null
union all select (select cid from c), (select sid from st where step_number = 4), 2, 'guided_practice', $$Practice: fiber identification drill$$,
$$Read each description and name the fiber. Then check the key. This is the decision you will make on every job before choosing heat and chemistry.

1. Commercial glue-down carpet in a daycare. Very stain resistant, but the traffic lanes look gray and oily no matter how much you clean.
2. Plush residential carpet, deep colors, soft underfoot. The homeowner says it cost a fortune and mentions it is natural.
3. Standard office carpet tiles. Tough, bounce back after furniture, most common fiber in commercial work.
4. Bedroom carpet with vivid color, soft hand, but the traffic path to the bathroom is matted flat and will not spring back.

ANSWER KEY:
1. Olefin. Stain resistant to water-based spills but oil-loving, so it grays. Moderate heat only.
2. Wool. Natural, expensive, premium. Low heat, neutral pH, gentle. When in doubt, call the supervisor.
3. Nylon. The commercial workhorse. Handles normal hot-water extraction and alkaline pre-spray.
4. Polyester. Great color, soft, but crushes in traffic lanes. Normal extraction is fine; manage the client's expectations about the matting.

THE DRILL TO RUN ON EVERY JOB: before you mix anything, ask yourself three questions. What fiber is this? What does that fiber forbid? Did I test hidden first? Say it until it is automatic. The techs who skip fiber ID are the techs who melt olefin with too much heat or bleed the dye out of wool.$$, null;

-- ============ STEP 5: SIMULATOR ============

with c as (select id as cid from public.training_courses where slug = 'carpet-cleaning'),
st as (select step_number, id as sid from public.training_steps where course_id = (select cid from c))
insert into public.training_lessons (course_id, step_id, sort_order, kind, title, body, media_svg)
select (select cid from c), (select sid from st where step_number = 5), 1, 'simulator', $$Simulator: the wool surprise$$,
$$Read the situation, pick what you would do, then read what happens with each choice.

SITUATION: You arrive at an expensive home. The living room carpet is thick, soft, and the homeowner says it is a wool blend worth more than your car. Your partner has already set the extractor to maximum heat and mixed a strong alkaline pre-spray, the same setup you use on nylon rentals. The homeowner is watching.

OPTION A: Go ahead with the hot, strong setup. It is just carpet, and hot cleans better.
WHAT HAPPENS: The high heat and alkalinity shock the wool. Dyes bleed into each other, the pile starts to felt, and there is a faint shrinkage ripple by the time you finish. The homeowner notices the color change immediately. The company pays for a carpet you cannot un-damage. Career-damaging outcome.

OPTION B: Tell the homeowner their carpet cannot be cleaned and leave.
WHAT HAPPENS: Wool CAN be cleaned, just gently. Refusing the job makes the company look incompetent, and the homeowner hires a competitor who knows wool. Bad outcome.

OPTION C: Stop your partner. Turn the heat to low, switch to a neutral-pH pre-spray, test in a closet corner first, and explain to the homeowner that wool gets the gentle protocol.
WHAT HAPPENS: The test corner looks perfect. You clean the room with low heat, gentle passes, and extra dry passes. The carpet looks better than it has in years and the homeowner tips you and books annually. The homeowner also tells their friends about the careful company. Good outcome.

THE CORRECT PATH IS C. The principles: fiber ID controls heat and chemistry, wool means gentle, and a visible test spot builds client trust. Never let routine momentum (the usual hot setup) override what the fiber requires.

NOW YOU TRY ONE: You are extracting a basement carpet and the dry passes keep pulling up streams of water. The carpet squishes underfoot. Choices: 1) Keep going; more passes will fix it. 2) Stop the wet passes, do extra dry-only passes, set up air movers, and use less water on the remaining area. 3) Pour down dry compound to soak it up. The right answer is 2. You are over-wetting. Stop adding water, extract what is there, move air, and adjust. Over-wetting causes mildew, browning, and backing failure.$$, null;

-- ============ STEP 6: WRITTEN EXAM (24 questions, 8 groups x 3) ============

with c as (select id as cid from public.training_courses where slug = 'carpet-cleaning')
insert into public.training_questions (course_id, kind, variant_group, question, choices, correct_index, explanation)
select (select cid from c), 'written', 'fiber-id-1', $$A carpet burns with a burnt-hair smell and the residue crushes to ash. What fiber is it?$$, '["Nylon","Olefin","Polyester","Wool"]'::jsonb, 3, $$Burnt-hair smell and crushable ash means wool. Wool needs low heat and neutral pH.$$
union all select (select cid from c), 'written', 'fiber-id-1', $$A fiber melts quickly with a waxy smell and leaves a hard bead. What fiber is it?$$, '["Wool","Olefin","Cotton","Silk"]'::jsonb, 1, $$Olefin melts fast with a waxy smell. Keep heat moderate on olefin; it has a low melting point.$$
union all select (select cid from c), 'written', 'fiber-id-1', $$You cannot identify the fiber with confidence. What is the safe default?$$, '["Treat it as wool: gentle heat, neutral pH, test hidden first","Use maximum heat; heat works on everything","Skip the job","Use the strongest pre-spray to be sure"]'::jsonb, 0, $$When in doubt, go gentle. Caution never ruined a carpet, but wrong chemistry on wool is permanent.$$
union all select (select cid from c), 'written', 'ph-1', $$On the pH scale, what do acidic cleaners (pH below 7) best dissolve?$$, '["Grease and oil","Mineral deposits and tannin stains like coffee and tea","Nothing; acids are useless","Only pet urine"]'::jsonb, 1, $$Acids dissolve mineral and tannin stains (coffee, tea, rust). Alkalines handle oils and grease.$$
union all select (select cid from c), 'written', 'ph-1', $$Why must you rinse carpet after using an alkaline pre-spray?$$, '["Alkaline residue is sticky and causes rapid re-soiling","Rinsing is optional","To make the carpet smell better","To cool the carpet down"]'::jsonb, 0, $$Leftover soap residue grabs new dirt fast. The carpet looks clean Tuesday and dirty Friday. Rinse it out.$$
union all select (select cid from c), 'written', 'ph-1', $$Wool carpet requires which pH approach?$$, '["Strong alkaline for deep cleaning","Neutral pH; wool is damaged by high alkalinity","Strong acid to brighten it","pH does not matter on wool"]'::jsonb, 1, $$Wool is damaged by high heat and high alkalinity. Neutral pH and low heat are the wool rules.$$
union all select (select cid from c), 'written', 'overwet-1', $$What is the most serious risk of over-wetting carpet?$$, '["It takes longer to finish the job","Mildew, browning, shrinkage, and backing failure","The client will complain about noise","The wand gets too heavy"]'::jsonb, 1, $$Over-wetting causes mildew and odor, browning from wicking, shrinkage, and delamination of the backing.$$
union all select (select cid from c), 'written', 'overwet-1', $$During extraction the carpet squishes underfoot and dry passes pull up streams. What is happening?$$, '["Normal extraction","You are over-wetting; stop wet passes and do dry passes with air movers","The vacuum is too strong","The carpet is defective"]'::jsonb, 1, $$Squishing and streaming means too much water. Stop adding water, extract dry, move air, adjust technique.$$
union all select (select cid from c), 'written', 'overwet-1', $$How long should properly cleaned carpet take to feel dry to the touch?$$, '["About 30 minutes","4 to 8 hours with dry passes and airflow","2 to 3 days","It should never fully dry"]'::jsonb, 1, $$With proper dry passes and air movers, carpet feels dry in 4 to 8 hours. Soggy the next day means over-wetting.$$
union all select (select cid from c), 'written', 'spotting-1', $$What is the correct first move on a fresh spot?$$, '["Rub it vigorously with a rag","Blot, working from the outside of the spot inward","Pour hot water on it","Apply bleach immediately"]'::jsonb, 1, $$Blot, never rub, and work outside-in so you do not spread the spot or damage the pile.$$
union all select (select cid from c), 'written', 'spotting-1', $$Why should you test every spotter in a hidden area first?$$, '["It wastes time otherwise","Some carpet dyes bleed or react with spotters","The label requires it by law","Hidden areas clean better"]'::jsonb, 1, $$Some dyes bleed when spotted. A closet test prevents a visible bleached patch in the middle of the room.$$
union all select (select cid from c), 'written', 'spotting-1', $$A dried blood spot needs treatment. What is the critical rule?$$, '["Use the hottest water possible","Never use hot water first; heat sets protein stains. Use cold water and enzyme spotter","Rub hard to break it up","Blood cannot be removed"]'::jsonb, 1, $$Heat sets protein stains (blood, milk, egg) permanently. Cold water and enzyme spotter first.$$
union all select (select cid from c), 'written', 'wand-1', $$What is the correct wand speed on the wet pass?$$, '["As fast as you can walk","About 1 foot per second, slow and overlapping","Speed does not matter","Faster on wool"]'::jsonb, 1, $$Slow overlapping passes let the vacuum recover the water. Rushing leaves the carpet soaked.$$
union all select (select cid from c), 'written', 'wand-1', $$Why must you keep the wand moving and never park it in one spot?$$, '["It gets too heavy","A parked hot wand over-wets and can damage the backing","It wastes electricity","The client will think you are lazy"]'::jsonb, 1, $$A stationary hot wand floods one spot, risking backing damage and over-wetting. Keep it moving.$$
union all select (select cid from c), 'written', 'wand-1', $$How much should extraction lanes overlap?$$, '["No overlap needed","About half the wand width","Full overlap, every lane twice","Overlap only on wool"]'::jsonb, 1, $$Half-wand overlap ensures even cleaning with no missed stripes between passes.$$
union all select (select cid from c), 'written', 'drypass-1', $$What is a dry pass and why does it matter?$$, '["A pass with no vacuum; it saves power","A vacuum-only pass that pulls leftover moisture; it is half of fast drying","Skipping a section to save time","A pass done after the client leaves"]'::jsonb, 1, $$Dry passes (trigger off, vacuum on) extract remaining moisture. They are what make carpet dry in hours instead of days.$$
union all select (select cid from c), 'written', 'drypass-1', $$When should you do dry passes?$$, '["Only on wool","After the wet pass over the same area, especially traffic lanes","Before pre-spray","Never; they wear out the wand"]'::jsonb, 1, $$Do dry passes right after the wet pass on the same lanes. Traffic lanes get an extra dry pass at the end.$$
union all select (select cid from c), 'written', 'drypass-1', $$The recovery tank water is running nearly clear on your passes. What does that tell you?$$, '["The machine is broken","Your passes are working; soil is being recovered","You need stronger chemical","The carpet was already clean"]'::jsonb, 1, $$Clear recovery water means the soil is coming out. It is the sign your technique is effective.$$
union all select (select cid from c), 'written', 'prevac-1', $$Why is thorough pre-vacuuming required before any wet cleaning?$$, '["It is just tradition","Dry gritty soil cuts fibers when ground in wet; vacuuming removes it first","It makes the pre-spray smell better","It warms up the carpet"]'::jsonb, 1, $$Dry soil is abrasive. Wet-cleaning over it grinds grit into fibers like sandpaper. Vacuum first, always.$$
union all select (select cid from c), 'written', 'prevac-1', $$How should you vacuum traffic lanes during pre-vacuuming?$$, '["One quick pass","Slowly, in two directions","Only the edges","Vacuuming lanes is unnecessary"]'::jsonb, 1, $$Slow two-direction vacuuming pulls the deep grit that one fast pass leaves behind.$$
union all select (select cid from c), 'written', 'prevac-1', $$A carpet was extracted without pre-vacuuming and now looks dull. What likely happened?$$, '["The chemical was too weak","Wet grit was ground into the fibers, dulling them","The client is imagining it","Dullness is normal after extraction"]'::jsonb, 1, $$Skipping pre-vacuum turns dry soil into mud ground into the pile. The dullness is embedded soil.$$
union all select (select cid from c), 'written', 'pet-urine-1', $$Why does surface cleaning often fail on pet urine?$$, '["Urine is invisible","It soaks into the pad below; surface cleaning cannot reach it","Enzymes do not work","Pet urine is permanent"]'::jsonb, 1, $$Urine penetrates to the pad. Enzyme treatment must reach the pad with dwell time, or the odor returns.$$
union all select (select cid from c), 'written', 'pet-urine-1', $$What does an enzyme spotter need to work on pet urine?$$, '["High heat","Dwell time to reach the contamination","Scrubbing hard","Mixing with bleach"]'::jsonb, 1, $$Enzymes need time to break down urine compounds. Apply generously and let them dwell; never mix with bleach.$$
union all select (select cid from c), 'written', 'pet-urine-1', $$The pad is saturated with old urine across a large area. What is the honest answer?$$, '["More surface cleaning will fix it","The pad may need replacement; say so honestly instead of promising cleaning will fix it","Paint over the stain","It will air out on its own"]'::jsonb, 1, $$Saturated pad cannot be cleaned from the surface. Honest techs say so; promising otherwise creates callbacks.$$;

-- ============ STEP 7: SCENARIO EXAM (10 questions, 5 groups x 2) ============

with c as (select id as cid from public.training_courses where slug = 'carpet-cleaning')
insert into public.training_questions (course_id, kind, variant_group, question, choices, correct_index, explanation)
select (select cid from c), 'scenario', 'wool-job-1', $$The living room carpet is an expensive wool blend and your partner already set maximum heat with strong alkaline pre-spray. What do you do?$$, '["Go ahead; hot cleans better","Refuse the job and leave","Stop, switch to low heat and neutral-pH pre-spray, test hidden first, and explain the gentle protocol to the homeowner","Dilute the alkaline spray with more water and continue hot"]'::jsonb, 2, $$Wool needs low heat and neutral pH. A hidden test plus the gentle protocol protects a carpet worth more than your car.$$
union all select (select cid from c), 'scenario', 'wool-job-1', $$Mid-job you realize the carpet you assumed was nylon is actually wool, and you already pre-sprayed alkaline. What is the best recovery?$$, '["Keep going; it is already sprayed","Stop, extract the pre-spray out thoroughly with extra rinse passes, switch to neutral chemistry, and tell your supervisor","Apply more alkaline to even it out","Blame your partner"]'::jsonb, 1, $$Stop the damage: extract the alkaline out, switch to wool-safe chemistry, and report the mistake so it is handled honestly.$$
union all select (select cid from c), 'scenario', 'flooded-1', $$Dry passes keep pulling up streams and the carpet squishes. What do you change?$$, '["Keep wet-passing; more passes fix everything","Stop wet passes, do extra dry-only passes, set up air movers, use less water ahead","Pour dry compound on it","Tell the client it dries in a week"]'::jsonb, 1, $$You are over-wetting. Stop adding water, extract dry, move air, and lighten up on the remaining area.$$
union all select (select cid from c), 'scenario', 'flooded-1', $$The next morning the client reports a musty smell in the cleaned rooms. What likely happened and what do you do?$$, '["Normal new-carpet smell; ignore it","Likely over-wetting caused mildew; report to your supervisor immediately so it can be addressed","The client is being difficult","Spray air freshener and move on"]'::jsonb, 1, $$Musty odor after cleaning signals trapped moisture and mildew risk. Report it at once; it needs professional remediation, not cover-up.$$
union all select (select cid from c), 'scenario', 'spot-callback-1', $$A coffee spot you treated yesterday has reappeared this morning. What is the likely cause and fix?$$, '["The client re-spilled","Wicking: residue deep in the pile dried and wicked back up; re-treat with thorough extraction and dry passes","Spots always come back","The carpet is haunted"]'::jsonb, 1, $$Wicking pulls deep residue back up as carpet dries. Re-treat with proper extraction and weighted dry passes.$$
union all select (select cid from c), 'scenario', 'spot-callback-1', $$A grease spot near the kitchen keeps returning after two cleanings. What should you tell the client?$$, '["It will come out on the third try, guaranteed","Explain honestly that some oil contamination deep in the pad may not fully resolve, and discuss options","Pretend it is gone","Charge extra and hope"]'::jsonb, 1, $$Honesty about limits beats guaranteed miracles. Explain the situation and discuss real options like pad work.$$
union all select (select cid from c), 'scenario', 'equipment-1', $$The recovery tank is full mid-room and dirty water is near the brim. What do you do?$$, '["Keep going; it holds a little more","Stop, empty the recovery tank properly, then resume","Dump it on the lawn","Pour it in the client''s sink"]'::jsonb, 1, $$Stop and empty the tank. Overflowing dirty water back onto clean carpet undoes your work. Dispose of properly.$$
union all select (select cid from c), 'scenario', 'equipment-1', $$The wand trigger sticks open, spraying water continuously. What is the safe move?$$, '["Keep working around it","Stop, shut off the solution flow, and fix or swap the wand before continuing","Let it spray; extra water cleans better","Unplug the vacuum only"]'::jsonb, 1, $$A stuck trigger floods the carpet fast. Stop the water flow immediately and fix the wand before another pass.$$
union all select (select cid from c), 'scenario', 'client-present-1', $$The homeowner insists on watching every pass and questions your pre-spray choice. How do you handle it?$$, '["Tell them to leave you alone","Stay friendly, briefly explain what the pre-spray does and that you tested it, and keep working professionally","Skip the pre-spray to avoid questions","Argue about chemistry"]'::jsonb, 1, $$Stay professional and brief. A short explanation builds trust; arguing or skipping steps destroys it.$$
union all select (select cid from c), 'scenario', 'client-present-1', $$The client asks you to also clean their expensive wool area rug with the same hot setup. What do you do?$$, '["Do it; the machine is already hot","Explain wool needs the gentle protocol and either adjust or decline that piece until a supervisor advises","Clean it fast before they change their mind","Charge double and do it hot"]'::jsonb, 1, $$Never hot-clean wool on momentum. Explain the fiber rules honestly and get supervisor guidance before touching it.$$;

-- ============ STEP 8: PRACTICAL ============

with c as (select id as cid from public.training_courses where slug = 'carpet-cleaning')
insert into public.training_practicals (course_id, title, instructions, checklist)
select (select cid from c), $$Practical: hot-water extraction of two rooms$$,
$$Perform a complete hot-water extraction on two rooms (about 300 sq ft total): pre-vacuum, pre-spray with dwell, extract with dry passes, and groom. Identify the fiber before you begin and state your heat and chemistry choices to the reviewer. Your reviewer will observe technique and inspect the carpet after drying.$$,
$$["Identified the carpet fiber correctly before choosing heat and chemistry","Pre-vacuumed thoroughly, two directions in traffic lanes","Pre-spray applied evenly with proper dwell time, not soaked","Wand passes slow and overlapping, about 1 foot per second","Wand kept moving; never parked in one spot","Dry passes done over each lane, trigger off","No over-wetting: carpet damp, not squishing, after passes","Hoses routed safely with no trip hazards","Recovery tank emptied properly; no spills","Pile groomed in one direction; edges and corners clean","Work area left clean; equipment flushed and packed properly","Can explain fiber ID, pH choice, and dry-pass purpose without notes"]$$::jsonb;
