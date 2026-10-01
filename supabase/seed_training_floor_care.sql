-- Seed: Floor Stripping & Waxing (floor-care)
-- Run AFTER 021_training_academy.sql in the WorkTeams Supabase project.
-- Note: prose strings use $$ dollar-quoting so apostrophes need no escaping.

delete from public.training_questions where course_id = (select id from public.training_courses where slug = 'floor-care');
delete from public.training_lessons where course_id = (select id from public.training_courses where slug = 'floor-care');
delete from public.training_practicals where course_id = (select id from public.training_courses where slug = 'floor-care');
delete from public.training_steps where course_id = (select id from public.training_courses where slug = 'floor-care');
delete from public.training_courses where slug = 'floor-care';

insert into public.training_courses (slug, title, description, category, department, sort_order, estimated_hours, recert_months)
values ('floor-care', 'Floor Stripping & Waxing', 'VCT strip and wax from start to finish: chemicals, machines, coats, and curing.', 'cleaning', 'Floor Care', 6, 5, 12);

with c as (select id as cid from public.training_courses where slug = 'floor-care')
insert into public.training_steps (course_id, step_number, step_key, title, description)
select cid, 1, 'reading', $$Reading: VCT and floor finish fundamentals$$, $$Core knowledge: what VCT is, what finish does, key terms.$$ from c
union all select cid, 2, 'visual', $$Visual guide: machine passes and finish layers$$, $$Diagrams that reinforce the reading.$$ from c
union all select cid, 3, 'worked_example', $$Worked example: 1,200 sq ft strip and wax$$, $$A complete break-room job with dilution math and timing.$$ from c
union all select cid, 4, 'guided_practice', $$Guided practice: dilution math and machine setup$$, $$Practice with coaching and checkpoints.$$ from c
union all select cid, 5, 'simulator', $$Simulator: the stripper is drying$$, $$Make the call when the job goes sideways.$$ from c
union all select cid, 6, 'written_exam', $$Written exam$$, $$Randomized questions. 80% to pass.$$ from c
union all select cid, 7, 'scenario_exam', $$Scenario exam$$, $$What would you do? 80% to pass.$$ from c
union all select cid, 8, 'practical_final', $$Practical final$$, $$Demonstrate a strip and wax against a checklist.$$ from c
union all select cid, 9, 'evidence', $$Evidence submission$$, $$Upload photo proof of your work.$$ from c
union all select cid, 10, 'approval', $$Manager approval$$, $$A manager reviews and approves.$$ from c
union all select cid, 11, 'recertification', $$Recertification$$, $$Stay current. Renew before expiry.$$ from c;

-- ============ STEP 1: READING (3 lessons) ============

with c as (select id as cid from public.training_courses where slug = 'floor-care'),
st as (select step_number, id as sid from public.training_steps where course_id = (select cid from c))
insert into public.training_lessons (course_id, step_id, sort_order, kind, title, body, media_svg)
select (select cid from c), (select sid from st where step_number = 1), 1, 'reading', $$VCT and floor finish: what you are working with$$,
$$Most of the strip-and-wax work you will do is on VCT, which stands for vinyl composition tile. It is the speckled 12-inch square tile you see in schools, offices, grocery stores, and break rooms. VCT is tough, but its surface is porous. Dirt grinds into it, and it scuffs easily. That is why it gets coated with floor finish.

Floor finish is often called wax, but modern finish is acrylic, not wax. Think of it as a clear, sacrificial shield. It takes the scratches, scuffs, and dirt so the tile does not have to. When the finish gets worn and dull, you strip it off and lay down fresh coats. That cycle, strip and recoat, is the core of this course.

KEY TERMS:
- Strip: chemically removing all old finish down to bare tile, using an alkaline stripper and a floor machine.
- Neutral cleaner: a pH-neutral daily cleaner that cleans without attacking the finish. This is what you mop with between wax jobs.
- Sealer: an optional base coat that fills the tile pores so the finish bonds evenly. Many jobs skip it, but it helps on old or porous tile.
- Finish: the acrylic top coats. Usually 3 to 5 thin coats.
- Burnish: polishing the cured finish with a high-speed machine and a soft pad to bring up gloss. Not every job needs it.
- Cure time: the hours the finish needs to harden fully. About 24 hours before heavy furniture or heavy traffic.
- Mil: a thousandth of an inch. Finish thickness is talked about in mils, but on the job you just think in coats: thin, even coats.

WHY THIN COATS: finish levels itself as it dries, but only if it is thin. Thick coats puddle, trap bubbles, dry cloudy, and peel later. Four thin coats beat two thick coats every single time. This is the single most important technique in the whole course.

THE ENEMY LIST: stripper left to dry on the tile, finish applied over a dirty or damp floor, coats laid too thick, furniture dragged back before curing, and the wrong cleaner (anything harsh or highly alkaline) used for daily mopping. Every ruined floor you will ever hear about comes from this list.$$, null
union all select (select cid from c), (select sid from st where step_number = 1), 2, 'reading', $$Chemicals, machines, and tools$$,
$$THE CHEMICALS. Learn these three and what each one does.

ALKALINE STRIPPER. This is the heavy hitter. It is caustic, meaning it can burn skin and eyes. It dissolves old acrylic finish so the machine can scrub it off. You will dilute it per the label, commonly around 16 ounces per gallon of water (a 1-to-8 ratio), but ALWAYS read your product's label. PPE is mandatory: chemical-resistant gloves, goggles, and long sleeves. If stripper splashes on skin, rinse with water immediately. Never let stripper dry on the floor. Dried stripper re-bonds to the tile, can discolor it, and becomes much harder to remove.

NEUTRAL CLEANER. pH around 7. This is the everyday floor cleaner. It lifts soil without stripping the finish. Dilution is usually light, about 1 to 2 ounces per gallon. This is also what you use to rinse the floor after stripping, because it neutralizes any stripper residue left behind.

ACRYLIC FLOOR FINISH. Milky white in the bucket, dries clear. Apply in thin coats with a clean finish mop or applicator. Do not shake the container (bubbles). Pour, do not dip a dirty mop. Keep the bucket covered between coats so the finish does not skin over.

THE MACHINES.
- Low-speed floor machine (often called a buffer or swing machine), around 175 RPM, with a pad driver. This is your stripping machine. You will run it with a black stripping pad.
- Wet vacuum (wet-dry vac) for picking up the stripper slurry. Never use a regular dry vacuum for liquids.
- Optional: a high-speed burnisher for the final gloss, only after the finish has cured.

THE REST OF THE KIT: black stripping pads, red or white pads for light scrubbing, a dedicated finish mop (never used with stripper), mop buckets and wringers, wet-floor signs, a measuring cup for dilution, painter's tape and plastic for protecting baseboards, and a fan to help dry time.

MACHINE SAFETY BASICS: keep the power cord BEHIND you at all times so the machine never runs over it. Start the machine with the handle locked at waist height. Keep hands, feet, and the cord clear of the spinning pad. Unplug before changing pads. If the machine grabs and pulls, let go of the handle lock and it stops. You will practice this before ever touching a client's floor.$$, null
union all select (select cid from c), (select sid from st where step_number = 1), 3, 'reading', $$The strip and wax process, start to finish$$,
$$Here is the full sequence. Every strip-and-wax job follows these steps in this order. Memorize the order before you memorize anything else.

1. PREP THE AREA. Move furniture or plan around it. Put up wet-floor signs at every entrance. Tape plastic along baseboards if they are not already protected. Dust-mop the entire area to remove loose soil. If you strip over grit, the machine grinds it into the tile.

2. MIX THE STRIPPER. Read the label. A common dilution is 16 ounces per gallon. Mix only what you need for the section you are working. Put on gloves, goggles, and sleeves BEFORE you open the container.

3. APPLY IN SECTIONS. Work in sections of about 200 to 400 square feet. Mop the stripper solution onto the floor evenly. Let it dwell 5 to 10 minutes. Dwell time is when the chemical does the work. Do not let it dry. If a section starts drying, re-wet it with fresh solution.

4. AGITATE WITH THE MACHINE. Run the floor machine with a black pad over the section, overlapping passes. Keep the cord behind you. The finish should turn into a milky slurry.

5. PICK UP THE SLURRY. Wet-vacuum the section immediately. Do not let slurry sit. Follow with a clean-water rinse mop, then wet-vac again. Some crews do a neutral-cleaner rinse pass to neutralize residue.

6. LET IT DRY COMPLETELY. The bare tile must be fully dry before finish goes down. Use fans. Touch-test: the floor should feel dry and look uniform, with no dull or sticky patches. Finish applied over damp tile turns cloudy.

7. APPLY FINISH IN THIN COATS. Pour finish into a clean bucket or tray. Using a clean finish mop, lay a thin, even coat. Work from the farthest corner toward your exit so you never walk on wet finish. Let each coat dry 30 to 45 minutes (follow the label). Apply 3 to 5 coats. Four is the standard.

8. CURE. Keep traffic off as long as possible, ideally 24 hours before heavy furniture and full traffic. Light foot traffic is usually fine after a few hours, but chairs, desks, and equipment wait a full day.

BETWEEN COATS CHECKLIST: is the previous coat dry to the touch? Is the new coat thin with no puddles along edges and corners? Did you feather the edges so there is no hard line? If a coat goes down wrong, let it dry fully, then fix it on the next coat. Never try to fix wet finish by re-mopping it. You will make it worse.

COMMON ROOKIE MISTAKES: letting stripper dry. Running the cord under the machine. Applying finish over a damp floor. Laying coats too thick. Skipping the rinse so stripper residue kills the new finish's bond. Dragging furniture back the same night. Every one of these shows up in the finished floor, and the fix is always to strip and start over.$$, null;

-- ============ STEP 2: VISUAL (2 lessons with SVG) ============

with c as (select id as cid from public.training_courses where slug = 'floor-care'),
st as (select step_number, id as sid from public.training_steps where course_id = (select cid from c))
insert into public.training_lessons (course_id, step_id, sort_order, kind, title, body, media_svg)
select (select cid from c), (select sid from st where step_number = 2), 1, 'visual', $$Diagram: overlapping machine passes$$,
$$This is the pass pattern for stripping with the floor machine, seen from above. Each pass overlaps the previous one by about 2 inches so no strip of finish gets missed. Work in straight lanes from one wall to the other, then step sideways and come back. Keep the cord behind you at all times.

Rushing with wide, non-overlapping passes leaves stripes of old finish that show through the new coats. Slow, overlapping lanes are what make the floor uniform.$$,
'<svg width="640" height="300" xmlns="http://www.w3.org/2000/svg" font-family="sans-serif"><rect x="5" y="5" width="630" height="290" rx="12" fill="#f8fafc" stroke="#cbd5e1"/><text x="320" y="35" text-anchor="middle" font-size="16" font-weight="bold" fill="#0f172a">STRIPPING PASSES: OVERLAP EVERY LANE</text><rect x="120" y="60" width="400" height="180" fill="#e2e8f0" stroke="#94a3b8" stroke-width="2"/><rect x="130" y="70" width="90" height="160" fill="#bfdbfe" opacity="0.8"/><rect x="210" y="70" width="90" height="160" fill="#93c5fd" opacity="0.8"/><rect x="290" y="70" width="90" height="160" fill="#bfdbfe" opacity="0.8"/><rect x="370" y="70" width="90" height="160" fill="#93c5fd" opacity="0.8"/><text x="175" y="150" text-anchor="middle" font-size="13" font-weight="bold" fill="#1e3a8a">Lane 1</text><text x="255" y="150" text-anchor="middle" font-size="13" font-weight="bold" fill="#1e3a8a">Lane 2</text><text x="335" y="150" text-anchor="middle" font-size="13" font-weight="bold" fill="#1e3a8a">Lane 3</text><text x="415" y="150" text-anchor="middle" font-size="13" font-weight="bold" fill="#1e3a8a">Lane 4</text><rect x="200" y="70" width="20" height="160" fill="#f59e0b" opacity="0.55"/><rect x="280" y="70" width="20" height="160" fill="#f59e0b" opacity="0.55"/><rect x="360" y="70" width="20" height="160" fill="#f59e0b" opacity="0.55"/><text x="320" y="262" text-anchor="middle" font-size="13" fill="#92400e" font-weight="bold">Orange bands = 2-inch overlap. No gaps, no stripes.</text><text x="545" y="150" font-size="13" fill="#b91c1c" font-weight="bold">Cord stays</text><text x="545" y="168" font-size="13" fill="#b91c1c" font-weight="bold">BEHIND you</text><text x="545" y="186" font-size="13" fill="#b91c1c" font-weight="bold">&#8592; machine</text></svg>'
union all select (select cid from c), (select sid from st where step_number = 2), 2, 'visual', $$Diagram: finish layers done right$$,
$$The left side shows the correct build: bare tile, an optional sealer coat, then four THIN finish coats. The right side shows the classic rookie mistake: two THICK coats that puddle at the edges, trap bubbles, and dry cloudy.

Thin coats level themselves. Thick coats fight you. If your finish looks milky or bubbly while wet, you laid it too thick. Let it dry, then go thinner on the next coat.$$,
'<svg width="640" height="300" xmlns="http://www.w3.org/2000/svg" font-family="sans-serif"><rect x="5" y="5" width="630" height="290" rx="12" fill="#f8fafc" stroke="#cbd5e1"/><text x="170" y="35" text-anchor="middle" font-size="15" font-weight="bold" fill="#14532d">RIGHT: 4 THIN COATS</text><text x="470" y="35" text-anchor="middle" font-size="15" font-weight="bold" fill="#b91c1c">WRONG: 2 THICK COATS</text><rect x="60" y="240" width="220" height="30" fill="#94a3b8"/><text x="170" y="260" text-anchor="middle" font-size="12" fill="#fff">Bare VCT tile</text><rect x="60" y="228" width="220" height="12" fill="#cbd5e1"/><text x="170" y="222" text-anchor="middle" font-size="11" fill="#475569">Sealer (optional)</text><rect x="60" y="216" width="220" height="12" fill="#bae6fd"/><rect x="60" y="204" width="220" height="12" fill="#bae6fd"/><rect x="60" y="192" width="220" height="12" fill="#bae6fd"/><rect x="60" y="180" width="220" height="12" fill="#bae6fd"/><text x="300" y="208" font-size="12" fill="#0369a1">4 thin, even coats &#8592;</text><rect x="360" y="240" width="220" height="30" fill="#94a3b8"/><text x="470" y="260" text-anchor="middle" font-size="12" fill="#fff">Bare VCT tile</text><rect x="360" y="200" width="220" height="40" fill="#7dd3fc"/><ellipse cx="400" cy="212" rx="14" ry="8" fill="#e0f2fe" stroke="#0369a1"/><ellipse cx="450" cy="225" rx="10" ry="6" fill="#e0f2fe" stroke="#0369a1"/><ellipse cx="520" cy="210" rx="16" ry="9" fill="#e0f2fe" stroke="#0369a1"/><text x="470" y="190" text-anchor="middle" font-size="12" fill="#b91c1c">Bubbles trapped!</text><rect x="360" y="200" width="220" height="40" fill="none" stroke="#b91c1c" stroke-width="2" stroke-dasharray="6,4"/><text x="470" y="292" text-anchor="middle" font-size="12" fill="#64748b">Puddles at edges. Dries cloudy. Peels later.</text></svg>';

-- ============ STEP 3: WORKED EXAMPLE ============

with c as (select id as cid from public.training_courses where slug = 'floor-care'),
st as (select step_number, id as sid from public.training_steps where course_id = (select cid from c))
insert into public.training_lessons (course_id, step_id, sort_order, kind, title, body, media_svg)
select (select cid from c), (select sid from st where step_number = 3), 1, 'worked_example', $$Worked example: 1,200 sq ft break room strip and wax$$,
$$THE JOB: a 1,200 square foot office break room and hallway, VCT tile, last waxed 14 months ago. The finish is yellowed and scuffed. The client wants a full strip and 4 fresh coats, done overnight so staff return to a finished floor in the morning. Your crew: you and one partner. Start time: 6:00 PM.

THE MATH FIRST (do this before you mix anything):
- Stripper: label says 16 oz per gallon (1 to 8). You will apply about 1 gallon of solution per 400 sq ft, so 1,200 sq ft needs 3 gallons of solution. 3 gallons x 16 oz = 48 oz of stripper concentrate. Mix 3 gallons.
- Finish: one gallon covers about 2,000 sq ft per thin coat. 1,200 sq ft x 4 coats = 4,800 sq ft of coverage needed. 4,800 / 2,000 = 2.4 gallons. Bring 3 gallons so you do not run short.

6:00 PM - PREP (30 min). Wet-floor signs at both entrances and the hallway ends. Move tables and chairs to one half of the room. Dust-mop everything. Tape plastic along the baseboards. PPE on: gloves, goggles, sleeves.

6:30 PM - STRIP SECTION 1 (60 min). Mop stripper solution onto a 400 sq ft section. Dwell 8 minutes. Machine with black pad, overlapping lanes. Wet-vac the slurry immediately. Rinse-mop with clean water, wet-vac again. Move to section 2 while section 1 starts drying. Repeat for all three sections.

8:30 PM - DETAIL AND DRY (45 min). Hand-scrub edges and corners the machine missed, using a doodle pad. Final neutral-cleaner rinse pass over everything, wet-vac again. Set up fans. The floor must be bone dry before finish. Touch-test every section.

9:15 PM - FINISH COATS (about 3 hours). Pour finish into a clean tray. Partner A cuts in the edges with the finish mop while Partner B lays the field in straight, thin lanes, working toward the exit door. Coat 1 down by 9:45. Dry 40 minutes. Coat 2 at 10:25. Dry 40 minutes. Coat 3 at 11:05. Dry 40 minutes. Coat 4 at 11:45. Each coat: check for puddles along the baseboards and thin them out immediately.

12:30 AM - WRAP. Pick up signs (leave two at the entrances until morning). Move furniture back ONLY if the client approved same-night return; otherwise stage it just outside the room. Leave a note: no heavy equipment for 24 hours. Text the supervisor photos and the completion time.

THE RESULT: 4 thin coats, glass-smooth, no puddles, no cloudy spots. In the morning the staff walks into a floor that looks brand new. That is a $1,500 job done right in one night, and the reason clients sign annual floor-care contracts.$$, null;

-- ============ STEP 4: GUIDED PRACTICE (2 lessons) ============

with c as (select id as cid from public.training_courses where slug = 'floor-care'),
st as (select step_number, id as sid from public.training_steps where course_id = (select cid from c))
insert into public.training_lessons (course_id, step_id, sort_order, kind, title, body, media_svg)
select (select cid from c), (select sid from st where step_number = 4), 1, 'guided_practice', $$Practice: dilution math$$,
$$You will mix chemicals on every floor job. Getting the dilution wrong wastes product or damages floors. Work these three problems on paper, then check the answers.

PROBLEM 1: The stripper label says 16 oz per gallon. You need 2.5 gallons of solution. How much concentrate do you pour?
ANSWER: 2.5 x 16 = 40 oz. (That is 1 quart plus 8 oz.)

PROBLEM 2: The neutral cleaner label says 2 oz per gallon. Your mop bucket holds 4 gallons. How much cleaner?
ANSWER: 4 x 2 = 8 oz.

PROBLEM 3: One gallon of finish covers 2,000 sq ft per coat. The job is 900 sq ft and needs 4 coats. How many gallons do you bring?
ANSWER: 900 x 4 = 3,600 sq ft of coverage. 3,600 / 2,000 = 1.8 gallons. Bring 2 full gallons so you do not run short mid-coat. Running out of finish halfway through a coat leaves a visible line where the new pour starts.

THE RULE: always round UP on finish. A half-empty final coat is a disaster; a leftover half gallon is just inventory. And always read the label first. Ratios change between products, and the label is the law.$$, null
union all select (select cid from c), (select sid from st where step_number = 4), 2, 'guided_practice', $$Practice: machine setup in order$$,
$$Below are the steps to set up the floor machine for stripping, scrambled. Put them in order, then check the key.

A. Plug in, keeping the cord behind you
B. Attach the black stripping pad to the pad driver
C. Unplug the machine
D. Lock the handle at waist height
E. Test on a small area with the handle lock engaged

ANSWER KEY: C, B, D, A, E.

WHY THIS ORDER: Unplug FIRST (C) so the machine cannot start while your hands are under it. Then the pad (B). Then the handle height (D), because a wrong-height handle makes the machine pull. Then plug in with the cord routed behind you (A). Then a test patch (E) before you commit to the whole floor.

Say this order out loud three times. On a real job, your supervisor will watch your setup before they let you near the client's tile. A tech who sets up in the right order without being reminded is a tech who can be trusted alone in a building.$$, null;

-- ============ STEP 5: SIMULATOR ============

with c as (select id as cid from public.training_courses where slug = 'floor-care'),
st as (select step_number, id as sid from public.training_steps where course_id = (select cid from c))
insert into public.training_lessons (course_id, step_id, sort_order, kind, title, body, media_svg)
select (select cid from c), (select sid from st where step_number = 5), 1, 'simulator', $$Simulator: the stripper is drying$$,
$$Read the situation, pick what you would do, then read what happens with each choice.

SITUATION: You mixed stripper and mopped it onto a 600 sq ft section, bigger than you should have. Your partner called you to help move a stuck table. Ten minutes pass. When you come back, the stripper at the far end of the section is drying and turning white and crusty.

OPTION A: Leave the dried part alone. The machine will scrub it up anyway.
WHAT HAPPENS: Dried stripper re-bonds to the tile and can discolor it. The machine skips over the crust, and the finish in that area never bonds right. Weeks later the new finish peels in exactly that spot, and the client calls back. Bad outcome.

OPTION B: Mop plain water over the dried area to re-wet it, then keep going.
WHAT HAPPENS: Water alone does not reactivate dried stripper well. You get a patchy strip: some areas clean, some still holding old finish. The new coats go down uneven and the floor looks striped. Bad outcome.

OPTION C: Flood the dried area with FRESH stripper solution, give it a short dwell, and agitate immediately with the machine while it is wet. Then pick up the slurry right away.
WHAT HAPPENS: Fresh solution re-dissolves the dried residue. The machine scrubs it up cleanly. The section strips evenly like the rest. You also learn the real lesson: work in 200 to 400 sq ft sections you can finish before anything dries. Good outcome.

THE CORRECT PATH IS C. The principles: never let stripper dry, work in sections you can complete, and fix a mistake with fresh chemical and immediate agitation, not wishful thinking.

NOW YOU TRY ONE: You are halfway through laying coat 2 and notice the finish is puddling along the baseboards. Choices: 1) Keep going; it will level out. 2) Stop, spread the puddles thin with the mop right now, then continue thinner. 3) Pour extra finish on the puddles to even them out. The right answer is 2. Puddles do not level out, they dry cloudy and peel. Spread them immediately and lighten your touch.$$, null;

-- ============ STEP 6: WRITTEN EXAM (24 questions, 8 groups x 3) ============

with c as (select id as cid from public.training_courses where slug = 'floor-care')
insert into public.training_questions (course_id, kind, variant_group, question, choices, correct_index, explanation)
select (select cid from c), 'written', 'stripper-safety-1', $$Alkaline stripper splashes on your forearm. What do you do first?$$, '["Wipe it off with a dry rag and keep working","Rinse with water immediately","Apply floor finish over it","Wait until break to wash it"]'::jsonb, 1, $$Stripper is caustic and burns skin. Rinse with water immediately, then tell your supervisor.$$
union all select (select cid from c), 'written', 'stripper-safety-1', $$Which PPE is required when mixing and applying stripper?$$, '["Sunglasses and shorts","Chemical-resistant gloves, goggles, and long sleeves","A hard hat only","No PPE once you are experienced"]'::jsonb, 1, $$Stripper can burn skin and eyes. Gloves, goggles, and covered skin are mandatory every time.$$
union all select (select cid from c), 'written', 'stripper-safety-1', $$Why must you NEVER let stripper dry on the floor?$$, '["It wastes product","Dried stripper re-bonds to the tile, can discolor it, and is much harder to remove","It makes the floor slippery forever","It voids the machine warranty"]'::jsonb, 1, $$Dried stripper bonds back onto the tile and can discolor it. Work in sections you can finish while wet.$$
union all select (select cid from c), 'written', 'dilution-1', $$The label says 16 oz of stripper per gallon. You need 3 gallons of solution. How much concentrate?$$, '["16 oz","32 oz","48 oz","64 oz"]'::jsonb, 2, $$3 gallons x 16 oz = 48 oz of concentrate. Always do the math before you pour.$$
union all select (select cid from c), 'written', 'dilution-1', $$Neutral cleaner calls for 2 oz per gallon. Your bucket holds 5 gallons. How much cleaner?$$, '["2 oz","5 oz","10 oz","12 oz"]'::jsonb, 2, $$5 gallons x 2 oz = 10 oz. Stronger is not better; it leaves residue.$$
union all select (select cid from c), 'written', 'dilution-1', $$One gallon of finish covers 2,000 sq ft per coat. A 1,000 sq ft job needs 4 coats. How much finish do you bring?$$, '["1 gallon","2 gallons","3 gallons","4 gallons"]'::jsonb, 2, $$1,000 x 4 = 4,000 sq ft of coverage; 4,000 / 2,000 = 2 gallons exactly, so bring 3 to be safe. Always round up on finish.$$
union all select (select cid from c), 'written', 'machine-safety-1', $$Where must the power cord be while you run the floor machine?$$, '["Coiled on the handle","Behind you at all times","In front so you can see it","It does not matter"]'::jsonb, 1, $$The cord stays behind you so the spinning pad never runs over it. A cut cord is a shock and trip hazard.$$
union all select (select cid from c), 'written', 'machine-safety-1', $$What is the first step when changing a pad on the floor machine?$$, '["Tilt the machine back while plugged in","Unplug the machine","Spray the pad with stripper","Ask the client for help"]'::jsonb, 1, $$Unplug first so the machine cannot start while your hands are under it. Then change the pad.$$
union all select (select cid from c), 'written', 'machine-safety-1', $$The machine grabs and starts pulling hard to one side. What do you do?$$, '["Hold on tighter and muscle through it","Release the handle lock; the machine stops","Unplug it while it is running","Lift it off the floor while running"]'::jsonb, 1, $$Releasing the handle lock stops the machine. Fighting a grabbing machine causes injury and floor damage.$$
union all select (select cid from c), 'written', 'coats-thin-1', $$How many thin coats of finish are standard, and why thin?$$, '["2 thick coats; faster","4 thin coats; thin coats level, dry clear, and bond","1 heavy coat; less labor","6 coats no matter what"]'::jsonb, 1, $$Four thin coats is the standard. Thin coats self-level and dry clear; thick coats puddle, bubble, and peel.$$
union all select (select cid from c), 'written', 'coats-thin-1', $$You notice the wet finish looks milky with tiny bubbles. What went wrong?$$, '["The coat was laid too thick","The room is too clean","You used too little finish","The tile is too new"]'::jsonb, 0, $$Milky, bubbly wet finish means too thick. Let it dry and go thinner on the next coat.$$
union all select (select cid from c), 'written', 'coats-thin-1', $$Finish is puddling along the baseboards as you mop it on. What should you do?$$, '["Keep going; puddles level out on their own","Spread the puddles thin immediately and lighten your touch","Pour more finish on the puddles","Stop and strip the whole floor"]'::jsonb, 1, $$Puddles dry cloudy and peel later. Spread them thin right away and use less finish per pass.$$
union all select (select cid from c), 'written', 'dry-time-1', $$How long should you wait between finish coats?$$, '["5 minutes","30 to 45 minutes, per the label","2 hours minimum","Until the next day"]'::jsonb, 1, $$Each coat needs 30 to 45 minutes to dry (check the label). Rushing traps moisture and clouds the finish.$$
union all select (select cid from c), 'written', 'dry-time-1', $$How do you know the stripped tile is dry enough for the first finish coat?$$, '["It looks dry from the door","Touch-test: it feels dry and looks uniform, no dull or sticky patches","Wait exactly 10 minutes","Blow on it"]'::jsonb, 1, $$Touch and look closely. Finish over damp tile turns cloudy and bonds poorly.$$
union all select (select cid from c), 'written', 'dry-time-1', $$What helps the floor dry between coats on a humid night?$$, '["Closing all doors to keep heat in","Air movement from fans and open ventilation","Mopping water over it","Turning off all lights"]'::jsonb, 1, $$Moving air speeds drying. Fans and ventilation help each coat cure on schedule.$$
union all select (select cid from c), 'written', 'wet-signs-1', $$When must wet-floor signs be up during a strip and wax?$$, '["Only when the client is present","At every entrance whenever floors are wet or slippery","Only during the stripping step","Signs are optional at night"]'::jsonb, 1, $$Signs go up at every entrance any time the floor is wet. A slip without signs is the company's liability.$$
union all select (select cid from c), 'written', 'wet-signs-1', $$A building occupant walks toward your wet section. What do you do?$$, '["Wave them through quickly","Stop them, point to the signs, and redirect them around","Ignore them; the signs are enough","Mop faster"]'::jsonb, 1, $$Actively redirect people around wet floors. Signs plus a spoken warning prevent falls.$$
union all select (select cid from c), 'written', 'wet-signs-1', $$The job is done but the final coat is still tacky near the exit. What do you do?$$, '["Pull all the signs; the job is over","Leave signs at the entrances until the floor is safe","Tell the client to watch their step and leave","Cover the tacky spot with a rug"]'::jsonb, 1, $$Signs stay until the floor is safe to walk on. The job is not done until the floor is safe.$$
union all select (select cid from c), 'written', 'rinse-1', $$After wet-vacuuming the stripper slurry, what rinse step protects the new finish?$$, '["No rinse needed; the vac got it all","A clean-water or neutral-cleaner rinse pass, then wet-vac again","A bleach rinse","A second stripper application"]'::jsonb, 1, $$Stripper residue left in the tile attacks the new finish's bond. Rinse with clean water or neutral cleaner and vac it up.$$
union all select (select cid from c), 'written', 'rinse-1', $$Why do you change mop water often when rinsing after stripping?$$, '["To use up the water","Dirty rinse water spreads stripper residue back onto the tile","It makes the job take longer","The label requires exactly 3 changes"]'::jsonb, 1, $$Rinsing with dirty water just redistributes residue. Fresh water actually removes it.$$
union all select (select cid from c), 'written', 'rinse-1', $$The stripped floor has dull, sticky patches after drying. What likely happened?$$, '["The tile is defective","Stripper residue was left behind; it needs another rinse","The room is too cold","The finish dried too fast"]'::jsonb, 1, $$Dull sticky patches mean residue. Re-rinse with clean water or neutral cleaner and let it dry fully.$$
union all select (select cid from c), 'written', 'cure-1', $$How long before heavy furniture and equipment go back on a new finish?$$, '["As soon as it looks dry","About 24 hours","One week","Furniture can go back immediately"]'::jsonb, 1, $$Finish needs about 24 hours to cure hard. Early heavy loads dent and scar the fresh coats.$$
union all select (select cid from c), 'written', 'cure-1', $$The client wants desks back 4 hours after the last coat. What do you tell them?$$, '["Fine; it feels dry","Light foot traffic may be okay, but heavy furniture should wait about 24 hours to cure","Put felt pads on and drag them in","No one may enter for a week"]'::jsonb, 1, $$Be honest: light traffic after a few hours is usually fine, but heavy furniture needs the full cure time or the finish gets damaged.$$
union all select (select cid from c), 'written', 'cure-1', $$Why does dragging a desk across a one-day-old finish leave marks?$$, '["The finish was bad quality","The finish had not fully cured and hardened yet","Desks are too heavy for VCT","The coats were too thin"]'::jsonb, 1, $$Fresh finish is still soft until it cures. Heavy dragging before 24 hours scars coats that would otherwise last months.$$;

-- ============ STEP 7: SCENARIO EXAM (10 questions, 5 groups x 2) ============

with c as (select id as cid from public.training_courses where slug = 'floor-care')
insert into public.training_questions (course_id, kind, variant_group, question, choices, correct_index, explanation)
select (select cid from c), 'scenario', 'stripper-drying-1', $$You return to your section and the stripper is drying white and crusty at the far end. What do you do?$$, '["Leave it; the machine will scrub it up","Re-wet with plain water and continue","Flood the area with fresh stripper solution, let it dwell briefly, agitate immediately while wet, and pick up the slurry","Scrape the crust off with a razor"]'::jsonb, 2, $$Fresh solution re-dissolves dried stripper. Water alone will not reactivate it, and leaving it risks discoloration and peeling later.$$
union all select (select cid from c), 'scenario', 'stripper-drying-1', $$You mixed too much stripper and have a full bucket left at the end of the job. What is correct?$$, '["Pour it down the client''s landscaping drain","Save it for tomorrow in a labeled, sealed container per the label, or dispose of per label and supervisor instructions","Dump it in the parking lot","Mix it with floor finish to use it up"]'::jsonb, 1, $$Never dump chemicals outside or mix them into other products. Store labeled per the label or dispose of as instructed.$$
union all select (select cid from c), 'scenario', 'slippery-public-1', $$You are stripping a grocery aisle during open hours and a shopper heads toward your wet section. What do you do?$$, '["Keep working; your signs are up","Stop the machine, warn them verbally, and redirect them around the wet area","Work faster to finish the aisle","Offer them a discount"]'::jsonb, 1, $$Signs plus a direct verbal warning is the standard. Never let the public walk through a wet work zone.$$
union all select (select cid from c), 'scenario', 'slippery-public-1', $$A coworker slips on the wet tile but says they are fine. What must happen?$$, '["Nothing; they said they are fine","Report the incident to your supervisor right away, even if they feel okay","Tell them to be more careful","Move the signs closer"]'::jsonb, 1, $$All slips get reported immediately. Injuries can appear later, and the report protects everyone.$$
union all select (select cid from c), 'scenario', 'finish-puddles-1', $$Halfway through coat 3 you see the finish pooling in the low spots of the tile. What is the fix?$$, '["Leave the pools; extra finish means extra protection","Spread the pools thin right now with the finish mop and continue with thinner passes","Add more finish to even it out","Stop the job and strip everything"]'::jsonb, 1, $$Pools dry cloudy, trap bubbles, and peel. Spread them thin immediately and lighten each pass.$$
union all select (select cid from c), 'scenario', 'finish-puddles-1', $$Coat 2 dried with visible lap marks where your passes overlapped. What do you do?$$, '["Try to buff the marks out of the dry coat","Apply the next coat thinner with smoother, overlapping passes; the new coat will even the appearance","Strip and start over immediately","Ignore it; the client will not look closely"]'::jsonb, 1, $$Never rework dry finish. A properly applied next thin coat evens out minor lap marks.$$
union all select (select cid from c), 'scenario', 'chemical-mix-1', $$You are almost out of neutral cleaner for the rinse pass. A coworker suggests adding stripper to make it stronger. What do you do?$$, '["It is just the rinse; a little stripper is fine","Refuse. Never mix chemicals; rinse with clean water and tell your supervisor you are short","Mix them; stronger cleans better","Use bleach instead"]'::jsonb, 1, $$Never mix chemicals, ever. Residue from stripper in the rinse would attack the new finish. Clean water works.$$
union all select (select cid from c), 'scenario', 'chemical-mix-1', $$Stripper splashed into your eye despite your goggles slipping. What is the immediate response?$$, '["Rub the eye and keep working","Flush with clean water for at least 15 minutes and get medical help; tell your supervisor","Put eye drops in and continue","Cover the eye with a rag"]'::jsonb, 1, $$Caustic in the eye is an emergency. Flush with water for 15 minutes and get medical attention immediately.$$
union all select (select cid from c), 'scenario', 'equipment-failure-1', $$Mid-strip, the wet vacuum stops picking up and the slurry is spreading. What do you do?$$, '["Keep stripping; you will vac it all at the end","Stop the machine, check the vac: empty the tank, check the hose for clogs, reseat the lid","Push the slurry into the corner","Leave the slurry and start laying finish"]'::jsonb, 1, $$Stop and fix the vac first. Slurry left sitting re-deposits finish residue, and finish can never go over wet slurry.$$
union all select (select cid from c), 'scenario', 'equipment-failure-1', $$The floor machine's pad driver is wobbling and making a grinding noise. What is the safe move?$$, '["Keep running it; noise is normal","Stop, unplug, and inspect: the pad may be worn through or the driver damaged; tell your supervisor","Run it faster to get past the bad spot","Spray lubricant into the motor"]'::jsonb, 1, $$A wobbling driver can gouge the tile. Stop, unplug, inspect, and report. Never run damaged equipment on a client's floor.$$;

-- ============ STEP 8: PRACTICAL ============

with c as (select id as cid from public.training_courses where slug = 'floor-care')
insert into public.training_practicals (course_id, title, instructions, checklist)
select (select cid from c), $$Practical: strip and wax a small room$$,
$$Strip and apply finish to a 200 sq ft test room or training area: full strip, rinse, and 3 thin finish coats. Work in sections, keep the cord behind you, and follow the label dilutions. Your reviewer will observe the full process and inspect the cured floor the next day.$$,
$$["PPE on before opening chemicals: gloves, goggles, long sleeves","Wet-floor signs at every entrance before starting","Stripper mixed per label; math shown to reviewer","Worked in sections; stripper never allowed to dry","Machine passes overlapped; cord kept behind operator at all times","Slurry picked up immediately with wet vac; edges hand-detailed","Rinse pass done with clean water or neutral cleaner; floor dried fully","Finish applied in thin, even coats with no puddles at edges","Coats dried 30-45 minutes between applications","Work area left clean; leftover chemicals stored or disposed of per label","Next-day inspection: finish clear, smooth, no peeling or cloudiness","Can explain the full 8-step process in order without notes"]$$::jsonb;
