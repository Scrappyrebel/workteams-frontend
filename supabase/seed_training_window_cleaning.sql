-- Seed: Window Cleaning (window-cleaning)
-- Run AFTER 021_training_academy.sql in the WorkTeams Supabase project.
-- Note: prose strings use $$ dollar-quoting so apostrophes need no escaping.

delete from public.training_questions where course_id = (select id from public.training_courses where slug = 'window-cleaning');
delete from public.training_lessons where course_id = (select id from public.training_courses where slug = 'window-cleaning');
delete from public.training_practicals where course_id = (select id from public.training_courses where slug = 'window-cleaning');
delete from public.training_steps where course_id = (select id from public.training_courses where slug = 'window-cleaning');
delete from public.training_courses where slug = 'window-cleaning';

insert into public.training_courses (slug, title, description, category, department, sort_order, estimated_hours, recert_months)
values ('window-cleaning', 'Window Cleaning', 'Streak-free glass inside and out: squeegee technique, pure-water basics, and ladder safety.', 'cleaning', 'Detail Cleaning', 8, 3, 12);

with c as (select id as cid from public.training_courses where slug = 'window-cleaning')
insert into public.training_steps (course_id, step_number, step_key, title, description)
select cid, 1, 'reading', $$Reading: glass, tools, and solution$$, $$Core knowledge: glass types, squeegee kit, mixing solution.$$ from c
union all select cid, 2, 'visual', $$Visual guide: squeegee strokes and ladder angle$$, $$Diagrams that reinforce the reading.$$ from c
union all select cid, 3, 'worked_example', $$Worked example: 12-pane storefront$$, $$Inside and out, start to finish with timing.$$ from c
union all select cid, 4, 'guided_practice', $$Guided practice: strokes and ladder setup$$, $$Practice with coaching and checkpoints.$$ from c
union all select cid, 5, 'simulator', $$Simulator: the tinted window$$, $$Make the call when the glass is not plain.$$ from c
union all select cid, 6, 'written_exam', $$Written exam$$, $$Randomized questions. 80% to pass.$$ from c
union all select cid, 7, 'scenario_exam', $$Scenario exam$$, $$What would you do? 80% to pass.$$ from c
union all select cid, 8, 'practical_final', $$Practical final$$, $$Demonstrate window cleaning against a checklist.$$ from c
union all select cid, 9, 'evidence', $$Evidence submission$$, $$Upload photo proof of your work.$$ from c
union all select cid, 10, 'approval', $$Manager approval$$, $$A manager reviews and approves.$$ from c
union all select cid, 11, 'recertification', $$Recertification$$, $$Stay current. Renew before expiry.$$ from c;

-- ============ STEP 1: READING (3 lessons) ============

with c as (select id as cid from public.training_courses where slug = 'window-cleaning'),
st as (select step_number, id as sid from public.training_steps where course_id = (select cid from c))
insert into public.training_lessons (course_id, step_id, sort_order, kind, title, body, media_svg)
select (select cid from c), (select sid from st where step_number = 1), 1, 'reading', $$Glass and your tools$$,
$$Window cleaning looks simple until you try it. The difference between a pro and a rookie is not strength. It is the right tools, the right solution, and technique. This lesson covers the kit.

THE SQUEEGEE. Three parts: the handle, the channel (the metal bar), and the rubber blade. The rubber does the work. A nicked or worn rubber leaves lines, so check the blade edge before every job and flip or replace it when worn. Common sizes: 12 inch for homes, 18 inch for storefronts. Match the channel to the glass: too big and you cannot detail the edges, too small and the job takes forever.

THE WASHER (scrubber). A sleeve on a T-bar that holds solution and scrubs the glass. Wet the entire pane evenly with it. A dry spot is a spot the squeegee will chatter across.

THE BUCKET. Wide enough to fit your washer and squeegee. Many pros use a rectangular bucket so the washer fits flat.

EXTENSION POLE. For high glass you clean from the ground. The washer and squeegee attach to the pole. This is always safer than a ladder when it reaches.

SCRAPER. A single-edge razor in a holder, for paint specks and stickers on glass. Rules you must never break: only on WET glass, only on PLAIN glass, at a low angle. More on specialty glass in lesson 3.

MICROFIBER CLOTHS. Dry ones, for detailing edges and sills after the squeegee pass. Keep a stack of dry cloths. A damp cloth for detailing just smears.

GLASS TYPES you will meet:
- Annealed (plain) glass: standard windows. The most forgiving.
- Tempered glass: heat-strengthened, used in doors, shower enclosures, and large windows near floors. It can have microscopic surface debris from manufacturing. NEVER use a razor scraper on tempered glass. It can scratch badly.
- Tinted glass and window film: a coating or film that scratches easily. NO razors, NO abrasive pads. Soft washer and gentle squeegee only.
- Low-E (low emissivity) coated glass: an invisible metallic coating for energy efficiency. Treat like tinted: no razors, no abrasives.

HOW TO TELL: look for a small etched mark in the corner of tempered glass. Ask the client about tint or film. When in doubt, use no razor. A missed paint speck is a callback. A scratched $800 window is a claim.$$, null
union all select (select cid from c), (select sid from st where step_number = 1), 2, 'reading', $$Streak-free technique$$,
$$Streaks come from four things: dirty solution, a bad rubber, wrong technique, or hot sun. Control all four and the glass comes out perfect.

THE SOLUTION. Professional window soap exists, but the classic mix is simple: clean water with a small squirt of dish soap, just enough to make the squeegee glide. Too much soap leaves a film that dries into streaks. Change the water when it looks dirty. Cleaning ten windows in gray water guarantees gray results.

THE BASIC STROKE (straight pulls): Start at the top corner. Pull the squeegee straight down in overlapping vertical lanes, wiping the blade with a dry cloth between each pass. Simple, reliable, great for beginners and tall narrow panes.

THE FANNING STROKE (S-technique): For wide panes, the squeegee snakes across the glass in a continuous S pattern without lifting, keeping a dry leading edge. Faster once learned, and it leaves no start-stop lines. You will practice this in guided practice.

THE RULES OF EVERY STROKE:
1. Wet the whole pane first. The squeegee needs glide.
2. Keep a dry leading edge. Water ahead of the blade gets picked up; water behind it stays.
3. Overlap passes slightly.
4. Wipe the blade between passes. A wet dirty blade redeposits grime.
5. Detail the edges. After squeegeeing, run a dry microfiber around all four edges and the corners. This is where drips hide, and drips dry into the lines clients notice first.

SUN AND HEAT: do not clean glass baking in direct hot sun if you can avoid it. Solution dries before you squeegee it, leaving instant streaks. Work the shaded side first, or come back when the sun moves. On a hot day, work smaller sections so nothing dries ahead of your blade.

FRAMES AND SILLS: wipe the frame first so dirty frame water does not run onto your clean glass. Clean the sill after the glass. Sills collect dead insects and grit; a quick wipe makes the whole window look finished.

INTERIOR VS EXTERIOR: exteriors are dirtier (pollen, dust, bird spots) and may need two passes. Interiors have fingerprints and film. Use separate cloths so exterior grime never touches interior glass.$$, null
union all select (select cid from c), (select sid from st where step_number = 1), 3, 'reading', $$Safety and specialty glass$$,
$$Most window cleaning injuries are ladder falls. Most window cleaning damage claims are scratched specialty glass. This lesson prevents both.

LADDER SAFETY:
- Set the ladder on firm, level ground. Never on soft soil, gravel, or a slope without proper leveling.
- The 4-to-1 rule: for every 4 feet of height to the contact point, the base sits 1 foot out from the wall. Too steep and it tips backward. Too shallow and the base slides out.
- Three points of contact at all times: two hands and a foot, or two feet and a hand.
- Never overreach to the side. If your belt buckle passes the ladder rail, climb down and move the ladder.
- Never stand on the top step or the top cap.
- Face the ladder when climbing. Carry tools in a belt or have a partner hand them up.
- If an extension pole reaches the glass, use the pole. The safest ladder is the one you never climb.

RAZOR SCRAPER RULES (memorize these):
1. Wet glass only. A dry razor scratches.
2. Plain annealed glass only. Never tempered, never tinted, never filmed, never coated.
3. Low angle, light pressure. Let the sharp edge do the work.
4. Test in a corner first. If you feel grit catching under the blade, STOP. That grit will scratch.
5. When in doubt, do not razor. Plastic scrapers and extra washing remove most things safely.

TEMPERED GLASS WARNING: tempered glass can carry microscopic fabricating debris fused to the surface. A razor drags that debris across the glass and leaves long scratches you cannot fix. This is the most expensive rookie mistake in window cleaning. No razor on tempered. Ever.

PURE-WATER SYSTEMS (basics): for exterior high glass, many companies use a water-fed pole with purified (deionized) water. Pure water has no minerals, so it dries spot-free with no squeegee needed. You scrub with the brush, rinse thoroughly, and walk away. The keys: the water must actually be pure (check the system), and the rinse must be thorough. Pure water is for exteriors and frames that can get wet, not for interior work.

ELECTRICAL AWARENESS: look up before you raise a pole or ladder. Power lines near second-story windows kill. Keep poles and ladders well clear of lines. If lines are close to the work area, stop and tell your supervisor.

PPE AND COMMON SENSE: gloves when handling scrapers, eye protection when scraping overhead, and never work under a coworker's ladder. Wet sills and wet floors get wet-floor awareness: one slip with a squeegee in hand is how cuts happen.$$, null;

-- ============ STEP 2: VISUAL (2 lessons with SVG) ============

with c as (select id as cid from public.training_courses where slug = 'window-cleaning'),
st as (select step_number, id as sid from public.training_steps where course_id = (select cid from c))
insert into public.training_lessons (course_id, step_id, sort_order, kind, title, body, media_svg)
select (select cid from c), (select sid from st where step_number = 2), 1, 'visual', $$Diagram: the fanning S-stroke$$,
$$The fanning stroke cleans a wide pane in one continuous motion. Start at the top left. Snake the squeegee right, curve down, snake left, curve down, keeping the blade's leading edge always on dry glass. Never lift the blade mid-pane.

The dry leading edge is the secret: water is always pushed ahead of the rubber, never trapped behind it. Practice this on a mirror until the motion feels smooth before trying it on a client's storefront.$$,
'<svg width="640" height="320" xmlns="http://www.w3.org/2000/svg" font-family="sans-serif"><rect x="5" y="5" width="630" height="310" rx="12" fill="#f8fafc" stroke="#cbd5e1"/><text x="320" y="35" text-anchor="middle" font-size="16" font-weight="bold" fill="#0f172a">FANNING STROKE: ONE CONTINUOUS S, DRY LEADING EDGE</text><rect x="170" y="60" width="300" height="210" fill="#dbeafe" stroke="#2563eb" stroke-width="3"/><path d="M 190 90 L 430 90 Q 450 90 450 110 L 450 110 Q 450 130 430 130 L 210 130 Q 190 130 190 150 L 190 150 Q 190 170 210 170 L 430 170 Q 450 170 450 190 L 450 190 Q 450 210 430 210 L 210 210" fill="none" stroke="#b91c1c" stroke-width="4"/><circle cx="190" cy="90" r="8" fill="#16a34a"/><text x="190" y="75" text-anchor="middle" font-size="12" font-weight="bold" fill="#14532d">START</text><text x="500" y="120" font-size="13" fill="#334155">Snake across,</text><text x="500" y="138" font-size="13" fill="#334155">never lifting</text><text x="500" y="156" font-size="13" fill="#334155">the blade.</text><text x="500" y="190" font-size="13" fill="#b91c1c" font-weight="bold">Leading edge stays</text><text x="500" y="208" font-size="13" fill="#b91c1c" font-weight="bold">on DRY glass.</text><text x="320" y="295" text-anchor="middle" font-size="13" fill="#475569">Finish at the bottom corner, then detail all edges with a dry cloth.</text></svg>'
union all select (select cid from c), (select sid from st where step_number = 2), 2, 'visual', $$Diagram: the 4-to-1 ladder rule$$,
$$For every 4 feet up to where the ladder touches the wall, the base sits 1 foot out. A 12-foot contact point means the base is 3 feet out. Too steep and the ladder tips backward. Too shallow and the feet slide out.

Quick field check: stand at the base facing the ladder, extend your arms straight. Your palms should just touch the rails. If you have to reach or you are crowded, adjust.$$,
'<svg width="640" height="320" xmlns="http://www.w3.org/2000/svg" font-family="sans-serif"><rect x="5" y="5" width="630" height="310" rx="12" fill="#f8fafc" stroke="#cbd5e1"/><text x="320" y="35" text-anchor="middle" font-size="16" font-weight="bold" fill="#0f172a">LADDER ANGLE: 4 UP, 1 OUT</text><rect x="80" y="60" width="14" height="220" fill="#94a3b8"/><text x="40" y="170" font-size="13" fill="#475569" transform="rotate(-90 40 170)">WALL</text><line x1="150" y1="280" x2="290" y2="80" stroke="#b45309" stroke-width="10" stroke-linecap="round"/><line x1="150" y1="290" x2="150" y2="290" stroke="#b45309" stroke-width="10"/><line x1="290" y1="80" x2="290" y2="280" stroke="#cbd5e1" stroke-width="2" stroke-dasharray="6,4"/><line x1="150" y1="280" x2="290" y2="280" stroke="#cbd5e1" stroke-width="2" stroke-dasharray="6,4"/><text x="305" y="185" font-size="14" font-weight="bold" fill="#0f172a">4 ft up</text><text x="215" y="305" font-size="14" font-weight="bold" fill="#0f172a">1 ft out</text><text x="420" y="120" font-size="13" fill="#b91c1c" font-weight="bold">Too steep: tips</text><text x="420" y="138" font-size="13" fill="#b91c1c" font-weight="bold">backward &#8595;</text><text x="420" y="170" font-size="13" fill="#b91c1c" font-weight="bold">Too shallow: feet</text><text x="420" y="188" font-size="13" fill="#b91c1c" font-weight="bold">slide out &#8594;</text><text x="420" y="220" font-size="13" fill="#166534" font-weight="bold">3 points of contact.</text><text x="420" y="238" font-size="13" fill="#166534" font-weight="bold">Never overreach.</text><text x="420" y="256" font-size="13" fill="#166534" font-weight="bold">Level ground only.</text></svg>';

-- ============ STEP 3: WORKED EXAMPLE ============

with c as (select id as cid from public.training_courses where slug = 'window-cleaning'),
st as (select step_number, id as sid from public.training_steps where course_id = (select cid from c))
insert into public.training_lessons (course_id, step_id, sort_order, kind, title, body, media_svg)
select (select cid from c), (select sid from st where step_number = 3), 1, 'worked_example', $$Worked example: 12-pane storefront$$,
$$THE JOB: a small retail storefront. 12 large panes, glass door included, inside and out. The glass has pollen film, fingerprints at handle height, and two paint specks on one exterior pane. No tint, all plain annealed glass. Late afternoon, so the west-facing front is in shade. Your crew: just you. Time budget: about 90 minutes.

MINUTE 0 - SETUP (10 min). Mix your bucket: clean water plus a small squirt of dish soap. Too much soap films; you want just enough glide. Check your squeegee rubber: run your finger along the edge feeling for nicks. Lay out dry microfibers. Check the paint-speck pane: plain glass, so the razor is allowed, but you will wet it well first.

MINUTE 10 - EXTERIOR (40 min). Work the shaded panes first. Washer on: wet each pane fully, scrubbing the pollen film loose. Squeegee with straight pulls top to bottom, wiping the blade between passes. Detail edges and corners with a dry microfiber immediately, before drips dry. The paint specks: wet the area generously, razor at a low angle, one smooth push each, then rewash the pane. Wipe the frames first on each pane so dirty frame water does not run down your clean glass. 12 exteriors at about 3 minutes each.

MINUTE 50 - INTERIOR (30 min). New dry cloths. Interiors are fingerprints and film, not pollen, so they go faster, but watch for drips on the merchandise below. Detail the edges carefully: interior drips show in the store lighting. Clean the door glass last since customers keep touching it.

MINUTE 80 - SILLS AND FINAL CHECK (10 min). Wipe every sill. Then step back across the street if you can, or at least ten feet back, and look at the whole storefront. Check at an angle for streaks. Catch the one corner drip you missed on pane 7. Pack up: dirty water dumped properly, never on the client's landscaping.

TOTAL: about 90 minutes. The owner comes out, looks at the glass, and cannot tell there is glass there. That is the compliment window cleaners live for, and it is why this store signs a monthly contract.$$, null;

-- ============ STEP 4: GUIDED PRACTICE (2 lessons) ============

with c as (select id as cid from public.training_courses where slug = 'window-cleaning'),
st as (select step_number, id as sid from public.training_steps where course_id = (select cid from c))
insert into public.training_lessons (course_id, step_id, sort_order, kind, title, body, media_svg)
select (select cid from c), (select sid from st where step_number = 4), 1, 'guided_practice', $$Practice: strokes on a mirror$$,
$$You need: a squeegee with good rubber, a washer, a bucket of solution, dry microfibers, and a large mirror or sliding glass door at home.

EXERCISE 1 - STRAIGHT PULLS. Wet the whole mirror. Starting at the top left, pull straight down. Wipe the blade. Next lane, overlapping slightly. Work across. Then detail all four edges with a dry cloth.

CHECK YOURSELF: Stand to the side and look at an angle. Lines where lanes meet mean you did not overlap or did not wipe the blade. Drips at the edges mean you skipped detailing.

EXERCISE 2 - FANNING. Wet the mirror. Start top left and snake the squeegee in a continuous S without lifting: right, curve down, left, curve down. Keep the leading edge on dry glass.

CHECK YOURSELF: If the blade chatters, the glass was too dry or you pressed too hard. If there is a water line where you lifted mid-pane, keep the blade down next time. If the bottom corner has a puddle, finish the stroke fully into the corner and detail it.

Do 20 panes of each on the mirror. Time yourself on the last five. A pro does a standard home window, wash plus squeegee plus detail, in about 3 minutes. Speed comes from smooth motion, not rushing. Rushing makes streaks, and streaks make callbacks.$$, null
union all select (select cid from c), (select sid from st where step_number = 4), 2, 'guided_practice', $$Practice: ladder setup with the 4-to-1 rule$$,
$$You need: an extension ladder, a tape measure, and a wall. Do this with a partner spotting you.

EXERCISE 1 - MEASURE IT. Extend the ladder against the wall so the contact point is 12 feet up. Measure from the wall to the ladder feet. It should be 3 feet. Now set it to an 8-foot contact point: the base should be 2 feet out. Feel what correct looks like from the side.

EXERCISE 2 - THE ARM CHECK. Stand at the base facing the ladder, arms straight out. Your palms should just touch the rails. Too far to reach means too steep. Crowded against the rails means too shallow. Practice until you can set it by feel and verify with the arm check.

EXERCISE 3 - CLIMB RIGHT. Climb to the fourth rung and back down: three points of contact the whole time, facing the ladder. Now lean sideways like you are reaching for a far window corner. Feel how unstable it gets? That is the overreach warning. Your belt buckle stays between the rails. If you cannot reach, climb down and move the ladder.

CHECK YOURSELF: Can you set the 4-to-1 angle without the tape? Do you automatically check the ground is level before climbing? Do you face the ladder? These habits are what keep you off the injury list. Ladders are the most dangerous tool in window cleaning. Respect them every single time.$$, null;

-- ============ STEP 5: SIMULATOR ============

with c as (select id as cid from public.training_courses where slug = 'window-cleaning'),
st as (select step_number, id as sid from public.training_steps where course_id = (select cid from c))
insert into public.training_lessons (course_id, step_id, sort_order, kind, title, body, media_svg)
select (select cid from c), (select sid from st where step_number = 5), 1, 'simulator', $$Simulator: the tinted window$$,
$$Read the situation, pick what you would do, then read what happens with each choice.

SITUATION: You are cleaning the interior of an office. One large window has paint specks along the bottom edge. As you look closer, you notice the glass has a slight bronze tint to it. Your scraper is in your hand. The office manager is watching.

OPTION A: Wet the glass and razor the specks off carefully. You have done it a hundred times.
WHAT HAPPENS: The razor scratches the tint film. The scratches catch the light and are visible from across the room. The tint film on that window costs $400 to replace, and the client is furious. Your hundred successful razors on plain glass do not matter. Bad outcome.

OPTION B: Tell the manager the specks cannot be removed and skip the window.
WHAT HAPPENS: The specks are still there at the final walkthrough, right at eye level. The client wonders what they are paying for. Giving up without trying the safe methods looks unprofessional. Bad outcome.

OPTION C: Put the razor away. Try a plastic scraper with plenty of solution and patience. If specks remain, tell the manager honestly what you found, what you safely removed, and that a razor would damage the tint.
WHAT HAPPENS: The plastic scraper gets most of the specks. The manager appreciates the honesty and the care for their tint. You keep a client and your reputation. Good outcome.

THE CORRECT PATH IS C. The principles: identify the glass before choosing the tool, never razor tint/film/tempered/coated glass, and honest communication beats silent damage or silent surrender.

NOW YOU TRY ONE: You are about to razor paint specks on what looks like plain glass, but you feel grit catching under the blade on the test corner. Choices: 1) Push harder to get through the grit. 2) Stop immediately, switch to plastic scraper and extra washing. 3) Dry the glass and try again. The right answer is 2. Grit under a razor scratches. Stop, go gentle, and protect the glass.$$, null;

-- ============ STEP 6: WRITTEN EXAM (24 questions, 8 groups x 3) ============

with c as (select id as cid from public.training_courses where slug = 'window-cleaning')
insert into public.training_questions (course_id, kind, variant_group, question, choices, correct_index, explanation)
select (select cid from c), 'written', 'squeegee-1', $$Which part of the squeegee actually does the cleaning?$$, '["The handle","The metal channel","The rubber blade","The end clips"]'::jsonb, 2, $$The rubber blade edge is what pulls the water off. A nicked blade leaves lines no technique can fix.$$
union all select (select cid from c), 'written', 'squeegee-1', $$Your squeegee is leaving a thin line down every pass. What is the most likely cause?$$, '["Too much soap","A nicked or worn rubber blade","Working too slowly","The wrong bucket"]'::jsonb, 1, $$A consistent line means a damaged blade edge. Check it, flip it, or replace it.$$
union all select (select cid from c), 'written', 'squeegee-1', $$How should the squeegee channel size relate to the glass?$$, '["Always use the biggest channel you own","Match it to the glass: big enough for speed, small enough to detail edges","Size does not matter","One size works for everything"]'::jsonb, 1, $$Match the channel to the pane. Too big cannot detail edges; too small wastes time.$$
union all select (select cid from c), 'written', 'fanning-1', $$What is the key principle of the fanning S-stroke?$$, '["Lift the blade between curves","Keep the leading edge on dry glass the whole time","Move as fast as possible","Start at the bottom"]'::jsonb, 1, $$The dry leading edge is the whole secret. Water is pushed ahead of the rubber, never trapped behind.$$
union all select (select cid from c), 'written', 'fanning-1', $$During fanning, the blade starts chattering across the glass. What is wrong?$$, '["Nothing; chattering is normal","The glass is too dry or you are pressing too hard","The rubber is too new","You are going too slow"]'::jsonb, 1, $$Chatter means not enough glide. Wet the glass more, lighten your pressure, and keep moving smoothly.$$
union all select (select cid from c), 'written', 'fanning-1', $$When is fanning the right choice over straight pulls?$$, '["On tall narrow panes","On wide panes where one continuous motion is faster","Never; straight pulls are always better","Only on tinted glass"]'::jsonb, 1, $$Fanning shines on wide panes. Straight pulls suit tall narrow glass and beginners.$$
union all select (select cid from c), 'written', 'detailing-1', $$After squeegeeing, what must you do before calling a pane done?$$, '["Nothing; the squeegee finished it","Detail all edges and corners with a dry microfiber","Spray it with glass cleaner","Wipe the whole pane again"]'::jsonb, 1, $$Edge detailing catches the drips that dry into visible lines. Skip it and the client finds them for you.$$
union all select (select cid from c), 'written', 'detailing-1', $$Why must the detailing cloth be dry?$$, '["Dry cloths are cheaper","A damp cloth smears instead of picking up edge drips","Wet cloths scratch glass","It does not matter"]'::jsonb, 1, $$A damp cloth just moves the water around. Dry microfiber picks the drips up cleanly.$$
union all select (select cid from c), 'written', 'detailing-1', $$Which edge mistakes do clients notice first?$$, '["Center of the pane","Corners and bottom edges where drips dry into lines","The top edge","None; clients never notice"]'::jsonb, 1, $$Drips collect at corners and bottom edges and dry into the lines clients spot immediately.$$
union all select (select cid from c), 'written', 'solution-1', $$How much soap goes in the bucket?$$, '["A big squirt; more soap cleans better","Just a small squirt, enough for glide","Half a bottle","No soap; water alone"]'::jsonb, 1, $$Too much soap leaves a film that dries into streaks. A small amount gives glide without residue.$$
union all select (select cid from c), 'written', 'solution-1', $$The bucket water has turned gray after several windows. What should you do?$$, '["Keep going; soap still works","Change the water; dirty water guarantees dirty glass","Add more soap to compensate","Use less water per window"]'::jsonb, 1, $$Gray water redeposits grime. Fresh water is cheap; re-cleaning ten windows is not.$$
union all select (select cid from c), 'written', 'solution-1', $$Why avoid cleaning glass in direct hot sun when possible?$$, '["Sunlight fades the rubber","Solution dries before you can squeegee it, leaving instant streaks","It is harder to see the glass","The soap evaporates"]'::jsonb, 1, $$Hot glass flash-dries the solution into streaks before your blade gets there. Work shade first or smaller sections.$$
union all select (select cid from c), 'written', 'scraper-1', $$When is a razor scraper allowed?$$, '["On any glass, anytime","Only on wet, plain annealed glass, at a low angle","Only on dry glass","Only on tinted glass"]'::jsonb, 1, $$Wet, plain, annealed glass only. Dry, tempered, tinted, filmed, or coated glass: never.$$
union all select (select cid from c), 'written', 'scraper-1', $$You feel grit catching under the razor blade on a test corner. What do you do?$$, '["Push harder to get through it","Stop immediately; grit under a razor scratches","Add more pressure and go faster","Switch to a duller blade"]'::jsonb, 1, $$Grit caught under a blade drags across the glass and scratches it. Stop, go gentle, protect the glass.$$
union all select (select cid from c), 'written', 'scraper-1', $$Why must tempered glass never be razored?$$, '["Tempered glass shatters on contact","Manufacturing debris on tempered glass gets dragged by razors, causing long scratches","Razors bounce off tempered glass","Tempered glass is too thick"]'::jsonb, 1, $$Microscopic fabricating debris on tempered glass turns a razor into a scratching tool. The scratches cannot be fixed.$$
union all select (select cid from c), 'written', 'ladder-1', $$What is the 4-to-1 ladder rule?$$, '["4 rungs up, 1 foot out","For every 4 feet of height, the base sits 1 foot from the wall","4 ladders per worker","Climb 4 feet per minute"]'::jsonb, 1, $$Four up, one out. Too steep tips backward; too shallow slides out.$$
union all select (select cid from c), 'written', 'ladder-1', $$What does "three points of contact" mean?$$, '["Three workers on the ladder","Two hands and a foot, or two feet and a hand, always","Three rungs between you and the top","Three tools in your belt"]'::jsonb, 1, $$Always three limbs on the ladder. It is the basic rule that prevents most falls.$$
union all select (select cid from c), 'written', 'ladder-1', $$Your belt buckle passes the side rail while reaching for a far corner. What do you do?$$, '["Stretch a little further","Climb down and move the ladder","Have someone hold the ladder while you lean","It is fine for a second"]'::jsonb, 1, $$Overreaching tips ladders. Climb down, move it, climb back up. Every time.$$
union all select (select cid from c), 'written', 'tint-1', $$How should you clean tinted or filmed glass?$$, '["Razor it carefully","No razors, no abrasives; soft washer and gentle squeegee only","Scrub hard with a pad","Same as plain glass"]'::jsonb, 1, $$Tint and film scratch easily. Gentle tools only, and tell the client you are protecting their tint.$$
union all select (select cid from c), 'written', 'tint-1', $$How can you identify tempered glass on site?$$, '["It looks blue","Look for a small etched mark in the corner of the pane","Tap it and listen","Tempered glass is always tinted"]'::jsonb, 1, $$Tempered glass usually has a small etched mark in the corner. When in doubt, no razor.$$
union all select (select cid from c), 'written', 'tint-1', $$A window has an invisible Low-E coating. How do you treat it?$$, '["Razor it; the coating is tough","Like tinted: no razors, no abrasives","Polish it with compound","Low-E needs no cleaning"]'::jsonb, 1, $$Low-E coatings damage like tint does. Gentle methods only.$$
union all select (select cid from c), 'written', 'purewater-1', $$Why does a pure-water system dry spot-free with no squeegee?$$, '["The brush polishes the glass","Pure water has no minerals, so nothing is left behind to spot","It uses hot water","The pole vibrates the water off"]'::jsonb, 1, $$Spots are mineral deposits. Deionized pure water leaves nothing behind when it dries.$$
union all select (select cid from c), 'written', 'purewater-1', $$What is the critical step when rinsing with a pure-water system?$$, '["Rinse quickly to save water","Rinse thoroughly; leftover dirty water spots even with pure water","Skip the rinse","Rinse only the frames"]'::jsonb, 1, $$The rinse must carry all the loosened dirt away. A thin rinse leaves dirty residue that dries visibly.$$
union all select (select cid from c), 'written', 'purewater-1', $$Where should you NOT use a water-fed pure-water pole?$$, '["Exterior second-story glass","Interior work where water would damage the inside","Storefronts","Brick buildings"]'::jsonb, 1, $$Pure-water poles soak everything. Interiors, and anything that cannot get wet, are squeegee work.$$;

-- ============ STEP 7: SCENARIO EXAM (10 questions, 5 groups x 2) ============

with c as (select id as cid from public.training_courses where slug = 'window-cleaning')
insert into public.training_questions (course_id, kind, variant_group, question, choices, correct_index, explanation)
select (select cid from c), 'scenario', 'tint-paint-1', $$Paint specks on a bronze-tinted office window, manager watching. What do you do?$$, '["Razor them off carefully; you have done it before","Skip the window and say nothing","Put the razor away, try a plastic scraper with solution, and honestly explain the tint limits to the manager","Scrub hard with an abrasive pad"]'::jsonb, 2, $$Never razor tint. Plastic scraper plus honesty protects the glass and your reputation.$$
union all select (select cid from c), 'scenario', 'tint-paint-1', $$A homeowner asks you to razor stickers off their sliding door. You spot the tempered etch mark in the corner. What do you do?$$, '["Razor carefully; it is just stickers","Decline the razor, use a plastic scraper and extra washing, and explain why tempered glass cannot be razored","Razor only the sticker area","Do it and hope for the best"]'::jsonb, 1, $$Tempered plus razor equals scratches. Explain the risk, use safe methods, keep the client.$$
union all select (select cid from c), 'scenario', 'ladder-ground-1', $$The only ladder spot for a second-story window is soft soil after rain. What do you do?$$, '["Set it up carefully and climb fast","Refuse and skip the window silently","Find firm level ground, use a board under the feet if needed, or use an extension pole from the ground; tell the client why","Have your partner hold the ladder while you climb"]'::jsonb, 2, $$Soft ground plus ladder equals a fall. Firm footing or a pole from the ground; explain it to the client.$$
union all select (select cid from c), 'scenario', 'ladder-ground-1', $$Power lines run close to the second-story windows you need to clean. What is the safe call?$$, '["Work carefully around them","Stop and tell your supervisor; keep all poles and ladders well clear of the lines","Use a shorter pole to stay under them","Clean only the lower half"]'::jsonb, 1, $$Power lines kill. Stop, report, and keep everything clear. No window is worth the risk.$$
union all select (select cid from c), 'scenario', 'sun-streak-1', $$It is 2 PM, the west glass is baking in hot sun, and streaks keep appearing no matter your technique. What do you change?$$, '["Add more soap","Work the shaded side first and come back when the sun moves, or work smaller sections so nothing dries ahead of the blade","Press harder with the squeegee","Switch to glass cleaner spray"]'::jsonb, 1, $$Hot glass flash-dries solution. Change the timing or the section size, not the chemistry.$$
union all select (select cid from c), 'scenario', 'sun-streak-1', $$Exterior panes keep showing a gray film after cleaning. What is the likely cause?$$, '["The glass is permanently stained","Your bucket water is dirty; change it","You need a bigger squeegee","Gray film is normal outdoors"]'::jsonb, 1, $$Dirty water redeposits grime as a film. Fresh water fixes what new tools cannot.$$
union all select (select cid from c), 'scenario', 'scratched-1', $$Mid-job you notice long scratches on a tempered door panel that were not there when you arrived. Your partner razored it earlier. What do you do?$$, '["Say nothing and hope nobody notices","Tell your supervisor immediately and honestly; hiding damage makes it worse","Blame the manufacturer","Try to polish the scratches out"]'::jsonb, 1, $$Report damage honestly and at once. Cover-ups turn a mistake into a lost client and a bigger claim.$$
union all select (select cid from c), 'scenario', 'scratched-1', $$A client points to scratches on a window you cleaned yesterday and asks if you caused them. What is the professional response?$$, '["Deny everything","Get defensive about your technique","Stay calm, inspect with them, document with photos, and report to your supervisor for an honest assessment","Offer to replace the window yourself"]'::jsonb, 2, $$Stay calm, look together, document, and escalate. Honest process protects everyone.$$
union all select (select cid from c), 'scenario', 'scope-1', $$The client asks you to also clean the chandelier crystals and the solar panels while you are there. What do you do?$$, '["Do it; the ladder is already up","Politely decline anything outside the agreed scope and offer to have the office quote it","Charge cash on the spot and do it","Clean the chandelier but skip the panels"]'::jsonb, 1, $$Out-of-scope work risks damage you are not trained or insured for. Decline politely, offer a proper quote.$$
union all select (select cid from c), 'scenario', 'scope-1', $$You finish the windows but notice the screens are filthy and were not in the quote. What is the best move?$$, '["Clean them free without saying anything","Mention to the client that the screens need attention and offer it as an add-on","Remove the screens and leave them off","Spray the screens with the hose through the window"]'::jsonb, 1, $$Flag it and offer the add-on. Unasked free work sets bad expectations; silent skipping misses revenue.$$;

-- ============ STEP 8: PRACTICAL ============

with c as (select id as cid from public.training_courses where slug = 'window-cleaning')
insert into public.training_practicals (course_id, title, instructions, checklist)
select (select cid from c), $$Practical: clean six windows inside and out$$,
$$Clean six standard windows (inside and out) at a training site or supervised job: mix solution, wash, squeegee, detail edges, wipe sills. Identify the glass type on each window before choosing tools, and set up a ladder correctly for one high window. Your reviewer will observe technique and inspect the glass at an angle for streaks.$$,
$$["Identified glass type on each window before choosing tools (no razor on tempered/tinted)","Squeegee rubber checked for nicks before starting","Solution mixed correctly: small amount of soap, clean water","Full wet wash of each pane before squeegeeing","Straight pulls or fanning done smoothly with wiped blade between passes","All edges and corners detailed with a dry microfiber","Frames wiped before glass; sills wiped after","Ladder set at 4-to-1 on level ground, three points of contact, no overreach","No streaks visible when glass inspected at an angle","Work area left clean; bucket dumped properly; tools packed","Can explain the razor rules and the 4-to-1 rule without notes"]$$::jsonb;
