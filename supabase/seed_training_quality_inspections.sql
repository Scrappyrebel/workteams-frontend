-- Seed: Quality Control & Inspections (quality-inspections)
-- Run AFTER 021_training_academy.sql in the WorkTeams Supabase project.
-- Idempotent: safe to re-run.

delete from public.training_questions where course_id = (select id from public.training_courses where slug = 'quality-inspections');
delete from public.training_lessons where course_id = (select id from public.training_courses where slug = 'quality-inspections');
delete from public.training_practicals where course_id = (select id from public.training_courses where slug = 'quality-inspections');
delete from public.training_steps where course_id = (select id from public.training_courses where slug = 'quality-inspections');
delete from public.training_courses where slug = 'quality-inspections';

insert into public.training_courses (slug, title, description, category, department, sort_order, estimated_hours, recert_months)
values ('quality-inspections', 'Quality Control & Inspections',
'Inspecting work like a pro: checklists, scoring, photos, and turning findings into fixes.',
'business', 'Quality', 6, 3, 12);

with c as (select id as cid from public.training_courses where slug = 'quality-inspections')
insert into public.training_steps (course_id, step_number, step_key, title, description)
select cid, 1, 'reading', 'Reading: inspecting like a pro', 'What to inspect, how often, and how to score fairly.' from c
union all select cid, 2, 'visual', 'Visual guide: the scoring rubric', 'The 1–5 scale that makes inspections consistent.' from c
union all select cid, 3, 'worked_example', 'Worked example: a full inspection, start to finish', 'One building, one inspection, every step shown.' from c
union all select cid, 4, 'guided_practice', 'Guided practice: score sample findings', 'Grade sample findings against the rubric, then check.' from c
union all select cid, 5, 'simulator', 'Simulator: the defensive cleaner', 'Deliver a bad score without losing the person.' from c
union all select cid, 6, 'written_exam', 'Written exam', 'Randomized questions. 80% to pass.' from c
union all select cid, 7, 'scenario_exam', 'Scenario exam', 'What would you do? 80% to pass.' from c
union all select cid, 8, 'practical_final', 'Practical final: inspect a real building', 'Inspect a real building with a supervisor.' from c
union all select cid, 9, 'evidence', 'Evidence submission', 'Upload your inspection report and photos.' from c
union all select cid, 10, 'approval', 'Manager approval', 'A manager reviews and approves.' from c
union all select cid, 11, 'recertification', 'Recertification', 'Stay current. Renew before expiry.' from c;

-- ============ STEP 1: READING (3 lessons) ============

with c as (select id as cid from public.training_courses where slug = 'quality-inspections'),
st as (select step_number, id as sid from public.training_steps where course_id = (select cid from c))
insert into public.training_lessons (course_id, step_id, sort_order, kind, title, body, media_svg)
select (select cid from c), (select sid from st where step_number = 1), 1, 'reading', 'Lesson 1: What to inspect, how often, and the inspector''s mindset', 'An inspection is not a hunt for mistakes. It is a measurement of whether the client is getting what they pay for. The best inspectors are calm, consistent, and fair — the crew should see an inspection as normal, not as punishment.

WHAT TO INSPECT. Inspect against the scope of work — the same scope the client signed. If the scope says ''disinfect restroom fixtures 3x/week,'' you check fixtures for disinfection-level clean. You do not invent new standards on the spot. Walk every area type:
- Restrooms: fixtures, mirrors, dispensers (full?), floors, odor, grout.
- Offices and work areas: dusting (run a finger on a ledge), trash (all cans?), floors, glass.
- Lobbies and common areas: floors (scuffs?), glass doors (fingerprints?), dusting.
- Break rooms: counters, microwave, sink, floors.
- Hallways and entrances: floors, high dusting, trash.

HOW OFTEN. Match frequency to risk and value:
- New accounts: inspect weekly for the first month. New crews need fast feedback.
- Medical and high-visibility clients: at least monthly, unannounced.
- Standard offices: monthly or quarterly, mix of announced and unannounced.
- After any complaint: inspect within 48 hours, and re-inspect a week later to confirm the fix stuck.
- Random spot checks: 10 minutes, one or two areas. Frequency of presence matters more than length.

THE INSPECTOR''S MINDSET.
1. Inspect the work, not the person. ''The restroom mirror was streaked'' — not ''you are lazy.''
2. Be consistent. Score the same finding the same way every time, for every crew. Inconsistency destroys trust in the whole program.
3. Inspect at different times. Always inspecting Tuesday at 10 AM teaches crews when to be ready. Vary it.
4. Start with what is right. ''Lobby looks great — let''s look at the restrooms'' opens ears. All-criticism inspections close them.
5. You are the client''s eyes. Walk in asking: ''If I paid for this, would I be happy?'' That question calibrates everything.

IN THE APP: inspections live on the Inspections page. Create an inspection for the location, work through the checklist items, score each one, attach photos of findings, and save. The inspection becomes a permanent record — which is exactly what you want when a client asks ''what are you doing about quality?''', null
union all select (select cid from c), (select sid from st where step_number = 1), 2, 'reading', 'Lesson 2: Scoring fairly and taking photos that prove it', 'THE 1–5 RUBRIC. Every inspection item gets a score. The scale must mean the same thing to every inspector, or scores are meaningless:
- 5 = EXCELLENT: better than expected. Noticeably great.
- 4 = GOOD: meets the standard fully. This is the target — most items should be 4s.
- 3 = ACCEPTABLE: minor issue, not worth a callback. Note it, watch it.
- 2 = BELOW STANDARD: clear miss. Needs correction — this goes on the fix list.
- 1 = UNACCEPTABLE: major failure (filthy restroom, trash overflowing everywhere). Immediate correction and a conversation.

Calibrate with examples: a 4 restroom has clean fixtures, full dispensers, no odor. A 2 restroom has a streaked mirror, an empty soap dispenser, and dust on the partitions. When in doubt between two scores, pick the lower one and note why — soft scoring hides problems until the client finds them.

SCORING RULES:
1. Score what you see, not what you assume. Do not score ''probably fine'' for a room you did not enter.
2. One bad item does not sink the whole area. Score each checklist item independently.
3. Weight what matters. Restrooms and lobbies matter more than a storage closet. Note critical misses even if the average looks okay.
4. Track trends, not just snapshots. Three 3s in a row on dusting is a training issue, not three isolated incidents.

PHOTOS THAT PROVE IT. A photo is worth a thousand arguments — but only if it is useful:
- Take a ''wide'' shot showing the area, then a close-up of the specific issue.
- Turn on the light. Dark, blurry photos prove nothing.
- Include a reference when scale matters (a coin or your hand near a stain).
- Photograph GOOD work too. ''This is what a 5 looks like'' trains better than any lecture.
- Get permission before photographing in client spaces with people or sensitive material — and never photograph people without consent.

Photo discipline: every score of 1 or 2 gets at least one photo. No photo, no finding — because without evidence, ''the mirror was streaked'' becomes a debate instead of a fix.', null
union all select (select cid from c), (select sid from st where step_number = 1), 3, 'reading', 'Lesson 3: From findings to fixes — and tying quality to retention', 'An inspection that produces no action is theater. The value of quality control is the loop: inspect, report, fix, verify, prevent. Here is how to close it.

WRITE FINDINGS THAT GET FIXED. ''Restroom needs attention'' gets nothing fixed. A fixable finding has four parts: where, what, the standard, and the deadline.
- Bad: ''Break room is dirty.''
- Good: ''Break room (2nd floor): microwave interior has baked-on food splatter. Standard: microwave cleaned inside and out each visit. Please correct by Thursday''s service and send a photo.''
The formula: LOCATION + SPECIFIC ISSUE + THE STANDARD + DEADLINE + PROOF. Write every finding this way and your fix rate will double.

DELIVER FEEDBACK LIKE A COACH. Share results with the crew within 24 hours — fast feedback changes behavior; week-old feedback feels like an ambush.
- Start with the positives: ''Lobby and offices scored 4s across the board — nice work.''
- Then the fixes, specific and kind: ''Two items need attention: the restroom mirror was streaked (scored 2) and the break room microwave (scored 2). Here are the photos. Can these be corrected by Thursday?''
- Ask, do not accuse: ''Is there something making the restrooms hard — running short on time, or a supply issue?'' Half of ''quality problems'' are actually time or supply problems.
- End with the expectation: ''The standard is 4s. I will re-inspect Thursday.''

RE-INSPECT TO VERIFY. The loop is not closed until you verify the fix. Re-inspect the specific items by the deadline. If fixed: say so, out loud — ''Restrooms are back to 4s. Thank you.'' Recognition of improvement is the most underused management tool in cleaning. If not fixed: escalate — retraining, shadowing, and if the pattern continues, reassignment.

FIND THE ROOT CAUSE. The same finding three times is not three problems — it is one problem you have not solved. Ask why five times:
''Mirror streaked'' → why? ''Cleaner rushes restrooms'' → why? ''30 minutes for 2 restrooms plus break room is not enough'' → why? ''The bid underestimated the time'' → now you are fixing the real problem (adjust the schedule or the scope), not yelling about mirrors.

TIE QUALITY TO RETENTION. Here is the business case: acquiring a new cleaning client costs 5 to 7 times more than keeping one. Clients do not leave over one bad night — they leave when they stop believing you notice. A visible inspection program (''we inspect monthly and I will share the reports'') is a retention tool and a sales tool. Prospects choosing between you and a cheaper competitor will pay for the company that can prove its quality. Your inspection reports are that proof.', null;

-- ============ STEP 2: VISUAL ============

with c as (select id as cid from public.training_courses where slug = 'quality-inspections'),
st as (select step_number, id as sid from public.training_steps where course_id = (select cid from c))
insert into public.training_lessons (course_id, step_id, sort_order, kind, title, body, media_svg)
select (select cid from c), (select sid from st where step_number = 2), 1, 'visual', 'The 1–5 scoring rubric at a glance', 'Print this rubric in your mind — or for real. Every inspector, every crew, every building: same scale, same meaning. The target is 4s. A 3 is a watch item. A 2 goes on the fix list with a photo and a deadline. A 1 means immediate correction and a conversation.', '<svg width="460" height="330" xmlns="http://www.w3.org/2000/svg"><rect x="5" y="5" width="450" height="320" rx="12" fill="#f8fafc" stroke="#cbd5e1"/><text x="230" y="34" text-anchor="middle" font-size="17" font-weight="bold" fill="#0f172a">INSPECTION SCORING RUBRIC</text><rect x="30" y="55" width="400" height="44" rx="8" fill="#dcfce7" stroke="#16a34a"/><text x="55" y="82" font-size="20" font-weight="bold" fill="#14532d">5</text><text x="90" y="74" font-size="13" font-weight="bold" fill="#14532d">EXCELLENT — better than expected</text><text x="90" y="92" font-size="12" fill="#14532d">Noticeably great. Recognize it.</text><rect x="30" y="107" width="400" height="44" rx="8" fill="#dbeafe" stroke="#2563eb"/><text x="55" y="134" font-size="20" font-weight="bold" fill="#1e3a8a">4</text><text x="90" y="126" font-size="13" font-weight="bold" fill="#1e3a8a">GOOD — meets the standard fully (the target)</text><text x="90" y="144" font-size="12" fill="#1e3a8a">Most items should be 4s.</text><rect x="30" y="159" width="400" height="44" rx="8" fill="#fef9c3" stroke="#ca8a04"/><text x="55" y="186" font-size="20" font-weight="bold" fill="#713f12">3</text><text x="90" y="178" font-size="13" font-weight="bold" fill="#713f12">ACCEPTABLE — minor issue, no callback</text><text x="90" y="196" font-size="12" fill="#713f12">Note it. Watch the trend.</text><rect x="30" y="211" width="400" height="44" rx="8" fill="#ffedd5" stroke="#ea580c"/><text x="55" y="238" font-size="20" font-weight="bold" fill="#7c2d12">2</text><text x="90" y="230" font-size="13" font-weight="bold" fill="#7c2d12">BELOW STANDARD — clear miss, goes on fix list</text><text x="90" y="248" font-size="12" fill="#7c2d12">Photo + deadline + re-inspection.</text><rect x="30" y="263" width="400" height="44" rx="8" fill="#fee2e2" stroke="#dc2626"/><text x="55" y="290" font-size="20" font-weight="bold" fill="#7f1d1d">1</text><text x="90" y="282" font-size="13" font-weight="bold" fill="#7f1d1d">UNACCEPTABLE — major failure, act now</text><text x="90" y="300" font-size="12" fill="#7f1d1d">Immediate correction + conversation.</text></svg>';

-- ============ STEP 3: WORKED EXAMPLE ============

with c as (select id as cid from public.training_courses where slug = 'quality-inspections'),
st as (select step_number, id as sid from public.training_steps where course_id = (select cid from c))
insert into public.training_lessons (course_id, step_id, sort_order, kind, title, body, media_svg)
select (select cid from c), (select sid from st where step_number = 3), 1, 'worked_example', 'A full inspection: Riverside Bank, Tuesday 10 AM', 'You arrive unannounced at Riverside Bank (Tue/Thu 7–11 PM service, crew: Maria + Priya shadowing). You have the scope on your phone, the rubric in your head, and your camera ready. You start with what is right.

LOBBY (scope: floors, glass, dusting, trash). Floors: clean, no scuffs — 4. Glass doors: two visible fingerprints at handle height — 3, minor, note it. Reception desk dusting: clean — 4. Trash: all cans empty with fresh liners — 4.

OFFICES (scope: trash, dusting, vacuum, glass). Open office: trash done — 4. Desks: you run a finger along a window sill — light dust — 3. Carpet: vacuum lines visible, clean — 4. Break room: counters wiped — 4; microwave interior has baked-on splatter — 2 (photo: wide shot + close-up, light on). Sink: clean — 4. Floor: sticky near the trash can — 3.

RESTROOMS (scope: disinfect fixtures, mirrors, dispensers, mop, trash). Men''s: fixtures clean — 4; mirror streaked — 2 (photo); soap dispenser full — 4; floor clean, no odor — 4. Women''s: all 4s — fixtures, mirror, dispensers, floor.

HALLWAY: floors — 4; high dusting on a vent — 3.

SCORES: 24 items. Twenty 4s, three 3s (lobby glass, sill dust, break room floor, vent dust — that is four 3s), two 2s (microwave, men''s mirror). Overall: solid 4-level work with two clear misses.

FINDINGS WRITTEN FOR ACTION:
1. ''Break room: microwave interior has baked-on splatter (scored 2). Standard: microwave cleaned inside/out each visit. Correct by Thursday''s service; send a photo.'' [photo attached]
2. ''Men''s restroom: mirror streaked (scored 2). Standard: streak-free mirrors each visit — use the glass cloth, not the restroom cloth. Correct by Thursday.'' [photo attached]
3. Watch items (scored 3, no callback): lobby door fingerprints, window sill dust, sticky spot by break room trash, vent dust in hallway.

DELIVERY (same day, in person): ''Lobby and offices look great — 4s across the board, and the women''s restroom is perfect. Two things need attention by Thursday: the microwave and the men''s mirror — here are the photos. Is anything making those hard — time, supplies?'' Maria: ''The microwave — honestly we have been skipping it when we run long.'' Root cause found: time pressure, not laziness. You: ''Got it. The microwave is in the scope, so let''s protect 5 minutes for it — start the break room 5 minutes earlier. I will re-inspect Thursday.''

THURSDAY RE-INSPECTION: microwave clean — back to 4. Mirror streak-free — 4. You tell Maria on the spot: ''Both fixed. Thank you.'' The loop is closed, the standard is reinforced, and Maria knows inspections are fair — because they were.', null;

-- ============ STEP 4: GUIDED PRACTICE ============

with c as (select id as cid from public.training_courses where slug = 'quality-inspections'),
st as (select step_number, id as sid from public.training_steps where course_id = (select cid from c))
insert into public.training_lessons (course_id, step_id, sort_order, kind, title, body, media_svg)
select (select cid from c), (select sid from st where step_number = 4), 1, 'guided_practice', 'Practice: score these findings', 'EXERCISE. Score each finding 1–5 using the rubric, then check yourself.

1. Restroom: fixtures disinfected and shining, dispensers full, mirror perfect, floor mopped, no odor. Your score?
2. Lobby: floors clean, but the glass entry doors have heavy fingerprints all over both sides. Your score for the glass item?
3. Office: trash emptied, carpet vacuumed, but every desk has a thick layer of dust — clearly not dusted in weeks. Your score for dusting?
4. Break room: everything clean except one small coffee drip on the counter. Your score?
5. Restroom: toilet has visible soil, floor is sticky, trash overflowing, strong odor. Your score?

CHECK YOURSELF:
1. 5 — better than expected across the board. This is excellent; recognize it.
2. 2 — heavy fingerprints on entry glass is a clear, visible miss. Fix list.
3. 1 — weeks of skipped dusting is a major failure of a core task. Immediate correction and a conversation.
4. 4 — one small drip is normal life between visits... or 3? This is the judgment call: a single minor drip with everything else clean is a 4 (meets standard; perfection is not the standard). If the drip was old and sticky, 3. When torn between two scores, note why — that note is what makes you consistent.
5. 1 — multiple major failures at once. Immediate correction, conversation, and re-inspection. This is also a retention risk: if the client saw this, you call them before they call you.', null;

-- ============ STEP 5: SIMULATOR ============

with c as (select id as cid from public.training_courses where slug = 'quality-inspections'),
st as (select step_number, id as sid from public.training_steps where course_id = (select cid from c))
insert into public.training_lessons (course_id, step_id, sort_order, kind, title, body, media_svg)
select (select cid from c), (select sid from st where step_number = 5), 1, 'simulator', 'Simulator: delivering a bad score without losing the person', 'ROLE-PLAY. You just scored James''s restroom work a 2 — streaked mirrors, empty soap dispenser, dust on partitions. James is experienced, proud, and a bit hot-headed. You have to tell him today. Three paths:

PATH A — THE AMBUSH. You say nothing, then bring it up in front of the whole crew at the next meeting: ''Some of us need to learn how to clean a mirror.'' Consequence: James is humiliated. He shuts down, the crew learns inspections are weapons, and nobody tells you about problems anymore. You won the moment and lost the team.

PATH B — SOFT-PEDAL INTO NOTHING. ''Hey, restrooms were mostly fine, just a couple tiny things, no big deal.'' Consequence: James hears ''fine.'' Nothing changes. Next inspection: same 2. Soft feedback is indistinguishable from no feedback — and now you cannot escalate fairly because you never set the standard clearly.

PATH C — PRIVATE, SPECIFIC, CURIOUS. You pull James aside today: ''Got a minute? I inspected the Plaza restrooms this morning. Fixtures looked good — 4. Two things scored 2: the mirror was streaked and the soap dispenser was empty — here are the photos. The standard is streak-free mirrors and full dispensers every visit. Can these be right by Thursday? And honest question — is something making restrooms hard right now? Time, supplies?'' Consequence: James sees the photos — no debate. He admits the crew has been rushing because the new building added 30 minutes with no schedule change. Root cause: your schedule, not his effort. You fix the schedule, James fixes the mirrors, Thursday re-inspection shows 4s, and you say so. James now trusts inspections because they were fair.

PATH C, every time: private, specific (photos), curious about root cause, clear deadline, verified fix, recognized improvement. Practice the opening line out loud: ''Got a minute? I inspected [place] this morning. [What was good]. [What scored low] — here are the photos. The standard is [X]. Can it be right by [day]?'' Smooth, fair, repeatable.', null;

-- ============ STEP 6: WRITTEN EXAM (8 groups x 3) ============

with c as (select id as cid from public.training_courses where slug = 'quality-inspections')
insert into public.training_questions (course_id, kind, variant_group, question, choices, correct_index, explanation)
select (select cid from c), 'written', 'mindset', 'What is the primary purpose of an inspection?', '["To catch cleaners making mistakes","To measure whether the client is getting what the scope promises","To punish low performers","To fill out paperwork"]'::jsonb, 1, 'Inspections measure delivery against the signed scope. They are quality measurement, not punishment.'
union all select (select cid from c), 'written', 'mindset', 'A crew should experience inspections as:', '["A rare surprise punishment","A normal, consistent part of the job","Optional","Something only new hires get"]'::jsonb, 1, 'Normal and consistent. When inspections are routine, they improve work instead of creating fear.'
union all select (select cid from c), 'written', 'mindset', 'Why vary your inspection times instead of always going Tuesday at 10 AM?', '["To catch people off guard for fun","Crews prepare for known inspection times; varying times shows you the real everyday quality","It does not matter","Tuesdays are bad luck"]'::jsonb, 1, 'Predictable inspections measure performance under observation. Varied timing measures the real standard.'
union all select (select cid from c), 'written', 'frequency', 'How often should you inspect a brand-new account?', '["Once a year","Weekly for the first month","Never — trust the crew","Only if the client complains"]'::jsonb, 1, 'New accounts and new crews need fast feedback loops. Weekly for the first month sets the standard early.'
union all select (select cid from c), 'written', 'frequency', 'After a client complaint, when should you inspect?', '["Within 48 hours, then re-inspect a week later to confirm the fix stuck","Next quarter","Immediately fire the cleaner","Wait a month"]'::jsonb, 1, 'Fast inspection shows the client you take it seriously; the re-inspection proves the fix held.'
union all select (select cid from c), 'written', 'frequency', 'What is the value of short random spot checks?', '["There is none","Frequency of presence matters more than length — regular visibility keeps standards up","They annoy the crew","They replace full inspections"]'::jsonb, 1, 'Ten-minute spot checks, done often, keep quality visible and consistent between full inspections.'
union all select (select cid from c), 'written', 'rubric', 'On the 1–5 rubric, what does a 4 mean?', '["Perfect in every way","Good — meets the standard fully. This is the target.","Barely acceptable","Failure"]'::jsonb, 1, '4 = meets the standard fully. Most items should be 4s. Perfection (5) is the exception, not the expectation.'
union all select (select cid from c), 'written', 'rubric', 'A finding scores between two numbers. What should you do?', '["Always pick the higher to be nice","Pick the lower one and note why — soft scoring hides problems until the client finds them","Skip scoring it","Ask the cleaner to pick"]'::jsonb, 1, 'Honest scoring with a written reason keeps you consistent. Soft scores feel kind but let problems grow.'
union all select (select cid from c), 'written', 'rubric', 'One restroom item scores a 1 but everything else is 4s. How do you report it?', '["Average it out and report all-good","Score each item independently and flag the 1 — averages hide critical misses","Ignore the 1","Fail the whole building"]'::jsonb, 1, 'Independent item scoring. A single 1 (filthy restroom) matters even when the average looks fine.'
union all select (select cid from c), 'written', 'photos', 'What makes an inspection photo useful?', '["Artistic angles","A wide shot for context plus a close-up of the issue, with the light on","As dark as possible","Including the cleaner''s face"]'::jsonb, 1, 'Wide + close-up, well lit. And never photograph people without consent.'
union all select (select cid from c), 'written', 'photos', 'Which findings require a photo?', '["None — photos are optional","Every score of 1 or 2 gets at least one photo","Only the good ones","Only if the client asks"]'::jsonb, 1, 'No photo, no finding. Photos turn ''the mirror was streaked'' from a debate into a fix.'
union all select (select cid from c), 'written', 'photos', 'Why photograph GOOD work too?', '["To use up phone storage","''This is what a 5 looks like'' trains better than any lecture","It is required","To show off"]'::jsonb, 1, 'Photo examples of excellent work set a visible standard the whole team can aim for.'
union all select (select cid from c), 'written', 'findings', 'Which finding will actually get fixed?', '["''Restroom needs attention''","''Men''s restroom: mirror streaked (2). Standard: streak-free each visit. Correct by Thursday; send photo.''","''Do better''","''Unacceptable!!!''"]'::jsonb, 1, 'Location + specific issue + the standard + deadline + proof. That formula gets fixes.'
union all select (select cid from c), 'written', 'findings', 'How soon should the crew hear inspection results?', '["Within 24 hours","Next month","At the annual review","Never — just fix it yourself"]'::jsonb, 1, 'Fast feedback changes behavior. Week-old feedback feels like an ambush.'
union all select (select cid from c), 'written', 'findings', 'When delivering fixes, why ask ''is something making this hard?''', '["To be polite","Half of ''quality problems'' are actually time or supply problems — you need the root cause","To delay the conversation","It is not necessary"]'::jsonb, 1, 'Curiosity finds root causes (bad schedule, missing supplies) that blame never would.'
union all select (select cid from c), 'written', 'root-cause', 'The same mirror is streaked three inspections in a row. What is the real move?', '["Yell louder","Ask why repeatedly until you find the root cause — it may be a time, training, or scheduling problem, not a mirror problem","Accept streaked mirrors","Replace the mirror"]'::jsonb, 1, 'Repeat findings signal a systemic cause. Fix the system (schedule, training, supplies), not just the symptom.'
union all select (select cid from c), 'written', 'root-cause', 'Re-inspection after a fix matters because:', '["It shows who is boss","The loop is not closed until the fix is verified — and verified improvement deserves recognition","It is busywork","Clients demand it"]'::jsonb, 1, 'Verify the fix by the deadline. When it is fixed, say so — recognition of improvement is powerful.'
union all select (select cid from c), 'written', 'root-cause', 'A cleaner admits they skip the microwave when running long. The root cause is:', '["Laziness","Time pressure — the schedule does not fit the scope","Bad attitude","The microwave''s fault"]'::jsonb, 1, 'Skipped tasks under time pressure point at the schedule or scope estimate, not character.'
union all select (select cid from c), 'written', 'retention', 'Why is a visible inspection program a sales tool?', '["It is not","Prospects choosing between you and a cheaper competitor will pay for the company that can prove its quality with reports","It scares prospects","It is free advertising"]'::jsonb, 1, 'Inspection reports are proof of quality. Proof beats promises in competitive bids.'
union all select (select cid from c), 'written', 'retention', 'Clients usually leave when:', '["One bad night happens","They stop believing you notice or care — trust erodes before contracts end","Prices are too low","The crew is too friendly"]'::jsonb, 1, 'One bad night is forgiven; perceived indifference is not. Visible quality control protects trust.'
union all select (select cid from c), 'written', 'retention', 'Acquiring a new cleaning client costs roughly how much versus keeping one?', '["The same","5 to 7 times more","Half as much","Nothing"]'::jsonb, 1, 'Retention is the profit engine. Quality control is retention work, which makes it revenue work.'
union all select (select cid from c), 'written', 'app-use', 'In the app, an inspection should be recorded:', '["On paper only","On the Inspections page: location, checklist scores, photos of findings — a permanent record","In a group chat","It does not need recording"]'::jsonb, 1, 'The Inspections page creates the permanent record you need when a client asks about quality.'
union all select (select cid from c), 'written', 'app-use', 'Before inspecting, what should you have open?', '["Nothing","The signed scope of work for that building — you inspect against the scope, not invented standards","The cleaner''s pay stub","Social media"]'::jsonb, 1, 'The scope is the standard. Inspecting against anything else is unfair and inconsistent.'
union all select (select cid from c), 'written', 'app-use', 'A client asks ''what are you doing about quality?'' Your best answer references:', '["Your feelings","Your inspection program: frequency, rubric, reports, and the fix-verification loop","A discount offer","Nothing — change the subject"]'::jsonb, 1, 'A concrete program (monthly inspections, 1–5 rubric, reports, verified fixes) answers with proof, not promises.';

-- ============ STEP 7: SCENARIO EXAM (5 groups x 2) ============

with c as (select id as cid from public.training_courses where slug = 'quality-inspections')
insert into public.training_questions (course_id, kind, variant_group, question, choices, correct_index, explanation)
select (select cid from c), 'scenario', 'bad-news-client', 'You find a restroom in terrible shape (score 1) at 10 AM. The client is on site. What do you do?', '["Say nothing and hope they did not see it","Tell the client proactively: acknowledge it, state the fix and timing — before they discover it themselves","Blame the cleaner to the client","Wait for the client to complain"]'::jsonb, 1, 'Proactive honesty with a fix plan preserves trust. Discovery without warning destroys it.'
union all select (select cid from c), 'scenario', 'bad-news-client', 'A client forwards you a photo of an overflowing trash can from this morning. Your best response?', '["Explain why it happened in detail","Acknowledge, take responsibility, state the fix, verify in person, and follow up with proof","Argue the photo is old","Offer a free month immediately"]'::jsonb, 1, 'Own it, fix it, prove it. Explanations sound like excuses; verified fixes rebuild confidence.'
union all select (select cid from c), 'scenario', 'crew-pushback', 'An experienced cleaner says ''I have done it this way for years'' when you flag a 2. What now?', '["Back down — experience wins","Stay kind but firm: show the photo, restate the standard, set the deadline. Standards do not bend to tenure.","Write them up on the spot","Agree to lower the standard"]'::jsonb, 1, 'Respect experience, hold the standard. Photos and the rubric make it about the work, not a power struggle.'
union all select (select cid from c), 'scenario', 'crew-pushback', 'The whole crew seems nervous every time you arrive to inspect. What is wrong?', '["Nothing — fear improves work","Inspections feel like punishment. Fix it: start with positives, be consistent, recognize improvement publicly","Inspect more often to keep them scared","Stop inspecting"]'::jsonb, 1, 'Fear-based inspections hide problems. Fair, consistent, recognition-rich inspections improve work.'
union all select (select cid from c), 'scenario', 'scope-gap', 'You keep scoring 2s on window sills, but the signed scope never mentions sills. What is the right call?', '["Keep scoring 2s — sills should be clean","Stop: you cannot fail work against a standard the client never bought. Raise it as a scope discussion, not a crew failure.","Fail the crew anyway","Add sills to the scope secretly"]'::jsonb, 1, 'Inspect against the signed scope only. Gaps between your expectations and the scope are sales conversations, not crew failures.'
union all select (select cid from c), 'scenario', 'scope-gap', 'A client''s ''quick tidy'' expectations clearly exceed what the scope (and price) covers. What do you do?', '["Work the crew harder for free","Bring it to the client with options: adjust the scope and price, or align expectations to the current scope","Ignore it","Quietly cut corners elsewhere"]'::jsonb, 1, 'Expectation gaps are resolved with the client via scope and price — never by squeezing the crew silently.'
union all select (select cid from c), 'scenario', 'trend', 'One building scores 3s on dusting four inspections in a row — never bad enough for the fix list, never good. What do you do?', '["Nothing — 3s are acceptable","Treat the trend as the finding: it is a training or time issue. Address it like a 2 with coaching and a deadline.","Wait for a 1","Rotate cleaners randomly"]'::jsonb, 1, 'Trends are findings. Four 3s in a row is a systemic issue wearing an ''acceptable'' disguise.'
union all select (select cid from c), 'scenario', 'trend', 'Building A averages 4.2, Building B averages 3.1, same crew, same scope type. What do you investigate?', '["Nothing — buildings differ","The difference: building-specific factors (soil load, time allotted, access, supplies) — compare conditions before judging the crew","Assume the crew slacks at Building B","Close Building B"]'::jsonb, 1, 'Same crew, different scores means different conditions. Investigate the building variables first.'
union all select (select cid from c), 'scenario', 'new-inspector', 'You are training a new inspector. What is the single most important calibration exercise?', '["Memorizing the app","Scoring the same building independently, then comparing scores item by item and discussing every difference","Reading the handbook","Shadowing once"]'::jsonb, 1, 'Side-by-side scoring with discussion is how two inspectors learn to see the same thing. Consistency is the whole game.'
union all select (select cid from c), 'scenario', 'new-inspector', 'Your new inspector scores everything 4s and 5s ''to be nice.'' What do you tell them?', '["Good — positivity helps","Soft scoring hides problems until the client finds them, and then it is a crisis. Score honestly; kindness is in how you deliver it, not in the number.","Score harder to compensate","Let them keep doing it"]'::jsonb, 1, 'Honest numbers, kind delivery. Inflated scores are a delayed crisis with interest.';

-- ============ STEP 8: PRACTICAL FINAL ============

with c as (select id as cid from public.training_courses where slug = 'quality-inspections')
insert into public.training_practicals (course_id, title, instructions, checklist)
select (select cid from c), 'Practical: inspect a real building with a supervisor',
'Inspect a real client building alongside your supervising manager. Review the signed scope first, work through the inspection in the app, score every item on the 1–5 rubric, photograph all 1s and 2s, write fix-ready findings, deliver the feedback to the crew, and re-inspect by the deadline. Submit your inspection report screenshots and finding photos as evidence.',
'["Reviewed the building''s signed scope of work before arriving","Inspected every area type: restrooms, offices, lobby, break room, hallways","Scored each checklist item independently on the 1–5 rubric","Took wide + close-up photos (lights on) of every 1 and 2","Wrote each finding as location + issue + standard + deadline","Delivered feedback to the crew within 24 hours: positives first, then fixes","Asked about root causes (time, supplies, training) instead of assuming","Set clear correction deadlines for all 2s and immediate action for 1s","Re-inspected by the deadline and verified each fix","Recognized the crew for corrected items","Logged the full inspection in the app''s Inspections page","Submitted evidence: inspection report screenshots and finding photos"]'::jsonb;
