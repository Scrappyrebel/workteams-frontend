-- Seed: Operations & Scheduling Management (operations-management)
-- Run AFTER 021_training_academy.sql in the WorkTeams Supabase project.
-- Idempotent: safe to re-run.

delete from public.training_questions where course_id = (select id from public.training_courses where slug = 'operations-management');
delete from public.training_lessons where course_id = (select id from public.training_courses where slug = 'operations-management');
delete from public.training_practicals where course_id = (select id from public.training_courses where slug = 'operations-management');
delete from public.training_steps where course_id = (select id from public.training_courses where slug = 'operations-management');
delete from public.training_courses where slug = 'operations-management';

insert into public.training_courses (slug, title, description, category, department, sort_order, estimated_hours, recert_months)
values ('operations-management', 'Operations & Scheduling Management',
'Running the daily operation: scheduling crews, time clock, locations, supplies, and handling no-shows.',
'business', 'Operations', 5, 3, 12);

with c as (select id as cid from public.training_courses where slug = 'operations-management')
insert into public.training_steps (course_id, step_number, step_key, title, description)
select cid, 1, 'reading', 'Reading: running the daily operation', 'Scheduling, time clock discipline, locations, supplies, and the manager routine.' from c
union all select cid, 2, 'visual', 'Visual guide: the weekly schedule', 'How a well-built week looks on the schedule.' from c
union all select cid, 3, 'worked_example', 'Worked example: a Monday from hell, handled', 'Call-offs, a new hire, and a client complaint — one day, solved.' from c
union all select cid, 4, 'guided_practice', 'Guided practice: build a week', 'Schedule a sample week with constraints, then check your work.' from c
union all select cid, 5, 'simulator', 'Simulator: the 5 PM call-off', 'Your cleaner calls off 2 hours before the shift. What do you do?' from c
union all select cid, 6, 'written_exam', 'Written exam', 'Randomized questions. 80% to pass.' from c
union all select cid, 7, 'scenario_exam', 'Scenario exam', 'What would you do? 80% to pass.' from c
union all select cid, 8, 'practical_final', 'Practical final: run a supervised week', 'Run one week of scheduling under supervision.' from c
union all select cid, 9, 'evidence', 'Evidence submission', 'Upload proof of your supervised week.' from c
union all select cid, 10, 'approval', 'Manager approval', 'A manager reviews and approves.' from c
union all select cid, 11, 'recertification', 'Recertification', 'Stay current. Renew before expiry.' from c;

-- ============ STEP 1: READING (3 lessons) ============

with c as (select id as cid from public.training_courses where slug = 'operations-management'),
st as (select step_number, id as sid from public.training_steps where course_id = (select cid from c))
insert into public.training_lessons (course_id, step_id, sort_order, kind, title, body, media_svg)
select (select cid from c), (select sid from st where step_number = 1), 1, 'reading', 'Lesson 1: Scheduling crews that actually show up', 'The schedule is the heartbeat of a cleaning company. Every missed shift is a broken promise to a client. Good scheduling is not just filling slots — it is matching the right people to the right buildings at the right times, with backup plans.

KNOW YOUR PEOPLE. Before you schedule anyone, know three things about each cleaner: availability (which days and hours they can work), capability (can they do floors, handle a large building alone, train others?), and reliability (do they show up?). New hires start on easy, supervised accounts — never alone on your biggest client in week one.

BUILD AROUND THE CLIENT FIRST. Each location in the app has its service days and time windows — those come from the contract. Schedule the client''s needs first, then assign people. A client paying for Mon/Wed/Fri after 6 PM gets Mon/Wed/Fri after 6 PM. Everything else bends around that.

THE RULES OF A GOOD SCHEDULE:
1. Post the schedule at least 7 days ahead. People plan their lives around it. Late schedules cause call-offs.
2. Never schedule someone more hours than they agreed to. ''Can you pick up Saturday?'' is a question, not a command.
3. Pair new hires with experienced cleaners for their first 2 to 4 weeks. Shadowing is how standards transfer.
4. Watch drive time. Back-to-back buildings 40 minutes apart with a 30-minute gap is a late arrival waiting to happen.
5. Keep a bench. You need 10 to 15% more staffed hours than the schedule requires, because people get sick, cars break down, and life happens. No bench = you cleaning at midnight.
6. Confirm the week. A quick message Sunday — ''Your week: Mon/Wed/Fri, Plaza building, 6-10 PM'' — cuts no-shows dramatically.

IN THE APP: every shift lives on the Schedule page with the location, date, time, and assigned cleaner. When you assign a shift, the cleaner sees it on their schedule and can clock in against it. If a shift has no assigned cleaner, it is your problem to solve before the day arrives — not during.

OVERTIME AND FAIRNESS. Track hours through the week, not just per day. Rotate the undesirable shifts (weekends, far buildings) fairly — the same person always getting the bad shifts quits. The same person always getting the easy shifts causes resentment. Fair feels fair; keep a mental ledger.', null
union all select (select cid from c), (select sid from st where step_number = 1), 2, 'reading', 'Lesson 2: Time clock discipline, GPS, and honest hours', 'The time clock is where money meets trust. Cleaners get paid for hours worked; clients get billed for service delivered. Sloppy timekeeping steals from one side or the other. Your job as an operations manager is to make clocking in correctly the easiest thing to do — and to catch problems early.

HOW IT SHOULD WORK. The cleaner arrives at the building, opens the app, and clocks in — the app records the time and the GPS location. They clean. They clock out when finished. That is it. Two taps. If clocking in feels hard, people will not do it, so make sure every cleaner has practiced it during onboarding, on their own phone, at a real building.

GPS IS A TOOL, NOT A WEAPON. The location attached to a clock-in tells you the cleaner was at the building. Use it to verify, not to spy. Tell the team upfront: ''The app logs where you clock in so we can prove to clients the work was done.'' Transparency kills resentment. Never use GPS data to punish without a conversation first.

THE DAILY CHECK (5 minutes each morning):
1. Open yesterday''s time entries. Does every scheduled shift have a matching clock-in?
2. Flag gaps: scheduled but no clock-in = possible no-show or forgotten punch. Clock-in but no schedule = extra work or a mistake.
3. Check times against the schedule. A 6 PM to 10 PM shift with a 6:47 PM clock-in is a late arrival — note it, do not ignore it.
4. Look at total hours per person for the week. Anyone approaching overtime needs a plan before it happens, not after.

MISSED PUNCHES. They happen — dead phones, bad signal, honest forgetfulness. Have a simple correction process: the cleaner reports it the same day, the manager verifies against the schedule (and GPS if available), and the correction is logged with a note. Never ''fix'' hours silently, and never let corrections pile up until payday. Same-day corrections are honest; payday corrections look suspicious.

LATE ARRIVALS AND PATTERNS. One late arrival is life. Three in two weeks is a pattern. Address patterns privately and quickly: ''I have noticed three late clock-ins in two weeks. What is going on?'' Listen first — sometimes the schedule is the problem (impossible drive time), not the person. Fix the schedule if it is the schedule. Coach the person if it is the person. Document every conversation.

PAYROLL-READY MEANS REVIEWED. Before hours go to payroll, the manager reviews and approves the week: every shift accounted for, corrections logged, overtime flagged. Payroll based on unreviewed hours is how overpayments — and underpayments — happen. Underpaying a cleaner once destroys trust for a year.', null
union all select (select cid from c), (select sid from st where step_number = 1), 3, 'reading', 'Lesson 3: Locations, supplies, call-offs, and the manager routine', 'LOCATIONS. Every building you service should be a Location in the app with the full address, the client contact, access info (key code, alarm code — stored securely, never in a group chat), the service schedule, and any site-specific notes (''use the side entrance after 7 PM,'' ''the freight elevator needs a key''). When a cleaner covers a building for the first time, they should be able to open the location and know everything. If they have to call you for the alarm code at 9 PM, your location record failed.

SUPPLIES. Running out of trash liners mid-shift is an operations failure, not bad luck. Keep it simple:
- Each cleaner or crew carries a standard kit: all-purpose cleaner, disinfectant, glass cleaner, trash liners, microfiber cloths, mop supplies. Restock from a central supply, not from memory.
- Set par levels: ''when the liners hit this mark, reorder.'' Reorder BEFORE you run out.
- Track what each building uses. A 4-restroom medical building burns through disinfectant; a small office does not. Adjust.
- Never let cleaners buy supplies with their own money and ''expense it later.'' That is how you lose receipts and goodwill.

CALL-OFFS AND NO-SHOWS. They will happen. The difference between a pro operation and chaos is the response plan:
1. The rule: call off at least 4 hours before the shift, by phone call (not text), to the manager on duty. Texts get missed; calls do not.
2. The bench: check your backup list first — who is available, who owes hours, who wants extra.
3. The swap: reassign in the app so the schedule reflects reality. The record must match what actually happened.
4. The client: if coverage will be late or short, tell the client BEFORE the service window, not after. ''We had a call-off; your building will be serviced by 9 PM instead of 7 PM'' beats silence every time.
5. The follow-up: document every call-off and no-show. Patterns get coached; repeated no-shows get exited. Protect the reliable people from carrying the unreliable ones — nothing kills morale faster.

THE MANAGER''S DAILY AND WEEKLY ROUTINE.
Daily (15 min): review yesterday''s time entries, check today''s schedule for gaps, confirm tomorrow''s coverage.
Weekly (1 hr): post next week''s schedule 7+ days out, review hours vs. budget, check supply levels, follow up on any client issues, touch base with each cleaner (''how is the Plaza building going?'').
Monthly (2 hrs): review no-show/late patterns, audit a few location records, walk one building unannounced to see the real quality, review profitability per client — are any accounts losing money on labor?

The routine is the job. Operations is not firefighting — it is preventing fires with boring, repeated habits.', null;

-- ============ STEP 2: VISUAL ============

with c as (select id as cid from public.training_courses where slug = 'operations-management'),
st as (select step_number, id as sid from public.training_steps where course_id = (select cid from c))
insert into public.training_lessons (course_id, step_id, sort_order, kind, title, body, media_svg)
select (select cid from c), (select sid from st where step_number = 2), 1, 'visual', 'What a healthy week looks like on the schedule', 'A good week has four visible qualities: every shift is assigned (no gaps), nobody is over their agreed hours, drive time between buildings is realistic, and at least one backup person is unscheduled but available. Study the sample week below — then compare it to your own company''s schedule and spot the differences.', '<svg width="460" height="300" xmlns="http://www.w3.org/2000/svg"><rect x="5" y="5" width="450" height="290" rx="12" fill="#f8fafc" stroke="#cbd5e1"/><text x="230" y="32" text-anchor="middle" font-size="16" font-weight="bold" fill="#0f172a">SAMPLE WEEK — ALL SHIFTS COVERED</text><text x="30" y="62" font-size="12" font-weight="bold" fill="#475569">Cleaner</text><text x="130" y="62" font-size="12" font-weight="bold" fill="#475569">Mon</text><text x="200" y="62" font-size="12" font-weight="bold" fill="#475569">Tue</text><text x="270" y="62" font-size="12" font-weight="bold" fill="#475569">Wed</text><text x="340" y="62" font-size="12" font-weight="bold" fill="#475569">Thu</text><text x="410" y="62" font-size="12" font-weight="bold" fill="#475569">Fri</text><text x="30" y="92" font-size="12" fill="#0f172a">Maria</text><rect x="120" y="78" width="55" height="24" rx="5" fill="#dbeafe" stroke="#2563eb"/><text x="147" y="94" text-anchor="middle" font-size="10" fill="#1e3a8a">Plaza 6-10</text><rect x="260" y="78" width="55" height="24" rx="5" fill="#dbeafe" stroke="#2563eb"/><text x="287" y="94" text-anchor="middle" font-size="10" fill="#1e3a8a">Plaza 6-10</text><rect x="400" y="78" width="55" height="24" rx="5" fill="#dbeafe" stroke="#2563eb"/><text x="427" y="94" text-anchor="middle" font-size="10" fill="#1e3a8a">Plaza 6-10</text><text x="30" y="126" font-size="12" fill="#0f172a">James</text><rect x="120" y="112" width="55" height="24" rx="5" fill="#e0f2fe" stroke="#0284c7"/><text x="147" y="128" text-anchor="middle" font-size="10" fill="#0c4a6e">Dental 5-9</text><rect x="190" y="112" width="55" height="24" rx="5" fill="#e0f2fe" stroke="#0284c7"/><text x="217" y="128" text-anchor="middle" font-size="10" fill="#0c4a6e">Dental 5-9</text><rect x="330" y="112" width="55" height="24" rx="5" fill="#e0f2fe" stroke="#0284c7"/><text x="357" y="128" text-anchor="middle" font-size="10" fill="#0c4a6e">Dental 5-9</text><text x="30" y="160" font-size="12" fill="#0f172a">Priya</text><rect x="190" y="146" width="55" height="24" rx="5" fill="#fef9c3" stroke="#ca8a04"/><text x="217" y="162" text-anchor="middle" font-size="10" fill="#713f12">Bank 7-11</text><rect x="330" y="146" width="55" height="24" rx="5" fill="#fef9c3" stroke="#ca8a04"/><text x="357" y="162" text-anchor="middle" font-size="10" fill="#713f12">Bank 7-11</text><text x="30" y="194" font-size="12" fill="#0f172a">Sam (backup)</text><rect x="120" y="180" width="335" height="24" rx="5" fill="#f1f5f9" stroke="#94a3b8" stroke-dasharray="5,3"/><text x="287" y="196" text-anchor="middle" font-size="10" fill="#64748b">ON CALL — available for coverage</text><rect x="30" y="220" width="400" height="60" rx="8" fill="#dcfce7" stroke="#16a34a"/><text x="230" y="242" text-anchor="middle" font-size="12" font-weight="bold" fill="#14532d">CHECKLIST: every shift assigned • hours within limits</text><text x="230" y="262" text-anchor="middle" font-size="12" fill="#14532d">realistic drive gaps • backup person unscheduled</text></svg>';

-- ============ STEP 3: WORKED EXAMPLE ============

with c as (select id as cid from public.training_courses where slug = 'operations-management'),
st as (select step_number, id as sid from public.training_steps where course_id = (select cid from c))
insert into public.training_lessons (course_id, step_id, sort_order, kind, title, body, media_svg)
select (select cid from c), (select sid from st where step_number = 3), 1, 'worked_example', 'A Monday from hell — handled step by step', 'MONDAY 3:00 PM. You are the operations manager. Three things hit at once:

1. James texts: ''My car broke down, I can''t make the Dental building tonight 5-9.''
2. Priya, your new hire (week 2), is scheduled solo at the Bank building Tue/Thu — and you realize she has never done a bank solo.
3. A client emails: ''The lobby trash was overflowing this morning at the Plaza.''

Here is the professional response, in order:

3:05 PM — TRIAGE. The tonight shift is the fire; the rest can wait an hour. James''s text came 2 hours before the shift — inside your 4-hour rule, but a dead car is a dead car. You note the late notice but focus on coverage first, conversation later.

3:10 PM — COVERAGE. You check the bench: Sam is on call this week and unscheduled tonight. You call Sam (call, not text): ''James is down — can you cover Dental 5-9 tonight?'' Sam says yes. You reassign the shift in the app immediately so the record matches reality, and you text James: ''Thanks for letting me know. Sam has it. We will talk tomorrow about the notice — hope the car is okay.''

3:20 PM — CLIENT COMMUNICATION. The Plaza trash complaint is from this morning — the client already saw it. You call (do not email bad news): ''I saw your note about the lobby trash. You are right, that should never happen. I have talked to the crew, and I will personally check the lobby tomorrow morning.'' Then you actually check tomorrow morning. One personal check is worth ten apologies.

4:00 PM — FIX THE RISK. Priya solo at the Bank tomorrow is a risk you created. You move Maria (experienced, nearby) to overlap Priya''s first hour Tuesday: ''Maria, can you start at the Bank with Priya for an hour tomorrow to show her the routine?'' You adjust both shifts in the app. New hires do not go solo until they have shadowed — that rule exists because of days like this.

TUESDAY 9:00 AM — CLOSE THE LOOPS. You verify in the app: Sam clocked in at Dental at 5:02 PM with GPS at the building, clocked out at 9:05 PM. Coverage worked. You check the Plaza lobby yourself — clean, trash empty. You text the client a photo: ''Checked this morning — all good.'' You talk to James: ''I get that the car died. Next time, call me the second you know — 2 hours put us in a tight spot.'' Documented, private, respectful.

THE LESSONS: (1) The bench is not optional — Sam existing is why the client never knew there was a problem. (2) Reassign in the app the moment plans change. (3) Call clients with bad news before they call you twice. (4) New hires shadow — no exceptions. (5) Every incident gets a same-day note; patterns get addressed, not incidents.', null;

-- ============ STEP 4: GUIDED PRACTICE ============

with c as (select id as cid from public.training_courses where slug = 'operations-management'),
st as (select step_number, id as sid from public.training_steps where course_id = (select cid from c))
insert into public.training_lessons (course_id, step_id, sort_order, kind, title, body, media_svg)
select (select cid from c), (select sid from st where step_number = 4), 1, 'guided_practice', 'Practice: build a week with constraints', 'EXERCISE. Build next week''s schedule for 3 cleaners and 4 accounts. Constraints:
- Maria: available Mon–Sat, max 24 hrs/week, experienced, reliable.
- James: available Mon–Thu evenings, max 20 hrs/week, experienced, car is unreliable.
- Priya: new hire (week 2), available Mon–Sat, max 20 hrs/week, must shadow an experienced cleaner on every shift.
- Accounts: Plaza (Mon/Wed/Fri 6–10 PM, 4 hrs), Dental (Mon–Thu 5–9 PM, 4 hrs), Bank (Tue/Thu 7–11 PM, 4 hrs), Church (Sat 8 AM–12 PM, 4 hrs).

Total account hours: Plaza 12 + Dental 16 + Bank 8 + Church 4 = 40 hrs. Total cleaner capacity: 24 + 20 + 20 = 64 hrs. Feasible, with bench to spare.

Write out who works each shift, then check yourself against these rules:
- Priya must shadow: pair her with Maria or James on every single shift. She never works alone.
- James''s unreliable car: he can work solo, but only where a backup is nearby. Maria works the same evenings at nearby buildings — she is his backup plan.
- Count every hour against each person''s max. Going over is not allowed.

CHECK YOURSELF — one valid solution:
- Mon: Maria + Priya (shadow) at Plaza 6–10 PM; James solo at Dental 5–9 PM.
- Tue: James solo at Dental 5–9 PM; Maria + Priya (shadow) at Bank 7–11 PM.
- Wed: Maria + Priya (shadow) at Plaza 6–10 PM; James solo at Dental 5–9 PM.
- Thu: James solo at Dental 5–9 PM; Maria + Priya (shadow) at Bank 7–11 PM.
- Fri: Maria solo at Plaza 6–10 PM. (Priya takes Friday off.)
- Sat: Maria + Priya (shadow) at Church 8 AM–12 PM.

Now the hour math — this is where schedules break:
- Maria: Mon 4 + Tue 4 + Wed 4 + Thu 4 + Fri 4 + Sat 4 = 24 hrs. Exactly her max. Legal.
- James: Mon–Thu Dental = 16 hrs. Under his 20 max. Legal.
- Priya: Mon–Thu shadow (16 hrs) + Sat shadow (4 hrs) = 20 hrs. Exactly her max. Legal.

Every shift covered. Priya always shadowed. Nobody over their limit. James is solo at Dental but Maria works nearby each evening as backup. That is the discipline scheduling requires: match people to constraints on paper before the week starts — count every hour, honor every limit, and never assign a shift you cannot cover.', null;

-- ============ STEP 5: SIMULATOR ============

with c as (select id as cid from public.training_courses where slug = 'operations-management'),
st as (select step_number, id as sid from public.training_steps where course_id = (select cid from c))
insert into public.training_lessons (course_id, step_id, sort_order, kind, title, body, media_svg)
select (select cid from c), (select sid from st where step_number = 5), 1, 'simulator', 'Simulator: the 5 PM call-off', 'ROLE-PLAY. It is 5:00 PM. Your cleaner texts: ''sorry cant make it tonight car trouble.'' Their shift: the Medical Plaza, 6–10 PM, a $6,400/month account, service window in the contract is 6 PM–12 AM. You have one hour. Three paths:

PATH A — PANIC AND HOPE. You text back ''ok feel better'' and hope the client does not notice. Consequence: the building does not get cleaned. The client discovers it at 7 AM. You get the angry call having done nothing. The contract''s service window was violated with zero communication. This is how accounts are lost in a single night.

PATH B — YOU GO YOURSELF, SILENTLY. You drive over and clean it yourself, telling no one. Consequence: the client is covered tonight — but you have now set the precedent that call-offs get absorbed by the manager with no documentation. The cleaner learns there is no consequence. Next month it happens again, and you cannot be in two buildings at once. Also, your 5 AM self will hate your 5 PM self.

PATH C — WORK THE PLAN. (1) Call your bench — who is on call this week? Call them, voice call: ''Can you cover Medical Plaza 6–10 tonight?'' (2) Reassign the shift in the app the moment someone says yes. (3) Text the client BEFORE 6 PM: ''Quick heads-up — we had a call-off tonight, but coverage is confirmed and your building will be serviced in the normal window.'' (4) Document the call-off. (5) Tomorrow, private conversation with the cleaner: ''What happened? Next time I need a call, not a text, and as much notice as you can give me.'' Consequence: the client may never know there was a problem — and if they do, they saw professionalism. The bench system worked. The cleaner knows the standard.

PATH C is the job. Notice the order: coverage first, app updated second, client told third, documentation fourth, coaching fifth. In a real emergency, run that exact sequence. Say it out loud: ''Coverage. App. Client. Document. Coach.''', null;

-- ============ STEP 6: WRITTEN EXAM (8 groups x 3) ============

with c as (select id as cid from public.training_courses where slug = 'operations-management')
insert into public.training_questions (course_id, kind, variant_group, question, choices, correct_index, explanation)
select (select cid from c), 'written', 'scheduling-basics', 'How far ahead should the schedule be posted?', '["The night before","At least 7 days ahead","A month ahead minimum","It does not matter"]'::jsonb, 1, 'Seven days lets people plan their lives. Late schedules cause call-offs.'
union all select (select cid from c), 'written', 'scheduling-basics', 'A new hire''s first 2–4 weeks should be spent:', '["Working solo on the biggest account","Shadowing an experienced cleaner","Doing only supply runs","Training other new hires"]'::jsonb, 1, 'Shadowing transfers standards. New hires never go solo on important accounts in week one.'
union all select (select cid from c), 'written', 'scheduling-basics', 'Why keep 10–15% more staffed hours than the schedule needs?', '["To increase payroll costs","Because people get sick and cars break down — no bench means missed shifts","It is required by law","To impress clients"]'::jsonb, 1, 'The bench is your insurance. Without backup capacity, one call-off becomes a missed client.'
union all select (select cid from c), 'written', 'time-clock', 'What should a cleaner do at the start of every shift?', '["Text the manager","Clock in through the app at the building — the app records time and GPS","Clock in from home before leaving","Just start cleaning"]'::jsonb, 1, 'Clock in at the building via the app: two taps, time plus GPS location recorded.'
union all select (select cid from c), 'written', 'time-clock', 'How should GPS location data be used?', '["To spy on cleaners secretly","To verify presence at the building — communicated openly, never as a surprise punishment","It should be ignored","To track cleaners on days off"]'::jsonb, 1, 'GPS verifies service happened. Tell the team upfront what it is for; use it to verify, not to ambush.'
union all select (select cid from c), 'written', 'time-clock', 'A cleaner forgot to clock in yesterday. What is the right process?', '["Ignore it — it will average out","Same-day report by the cleaner, manager verifies against the schedule, correction logged with a note","Fix it silently at payday","Dock their pay as a lesson"]'::jsonb, 1, 'Same-day corrections with verification and notes are honest. Silent or payday fixes look suspicious.'
union all select (select cid from c), 'written', 'locations-supplies', 'What belongs in a location record in the app?', '["Just the address","Full address, client contact, access info, service schedule, and site-specific notes","Only the client''s phone number","The cleaner''s personal notes"]'::jsonb, 1, 'A complete location record lets any covering cleaner work the building without calling you at 9 PM.'
union all select (select cid from c), 'written', 'locations-supplies', 'What is a par level for supplies?', '["The price of supplies","The reorder point — when stock hits this mark, you reorder BEFORE running out","The maximum you can store","A type of cleaning chemical"]'::jsonb, 1, 'Par levels turn restocking into a habit instead of an emergency. Reorder before you run out.'
union all select (select cid from c), 'written', 'locations-supplies', 'A cleaner runs out of trash liners mid-shift. Whose failure is this?', '["The cleaner''s","Operations — supply levels are a management responsibility, fixed with par levels and a standard kit","The client''s","Nobody''s — it just happens"]'::jsonb, 1, 'Running out mid-shift is a systems failure. Standard kits plus par levels prevent it.'
union all select (select cid from c), 'written', 'calloffs', 'What is the correct call-off rule?', '["Text whenever","At least 4 hours before the shift, by phone call to the manager on duty","No notice needed","Email the day after"]'::jsonb, 1, 'Four hours, phone call, manager on duty. Texts get missed; calls do not.'
union all select (select cid from c), 'written', 'calloffs', 'You secured coverage for a call-off but service will run 2 hours late. What do you tell the client?', '["Nothing — they might not notice","Tell them BEFORE the service window: coverage confirmed, new expected time","Apologize the next day","Blame the cleaner by name"]'::jsonb, 1, 'Proactive honesty before the window beats apologies after. Never blame the individual to the client.'
union all select (select cid from c), 'written', 'calloffs', 'A cleaner has no-showed twice in a month with no real explanation. What now?', '["Ignore it — everyone deserves unlimited chances","Documented pattern: private coaching conversation now; continued no-shows lead to exit","Fire them by text immediately","Give them your best accounts to motivate them"]'::jsonb, 1, 'Document, coach privately, escalate on repeat. Protect reliable staff from carrying unreliable ones.'
union all select (select cid from c), 'written', 'manager-routine', 'What is the manager''s 15-minute daily routine?', '["Answer all emails","Review yesterday''s time entries, check today''s schedule for gaps, confirm tomorrow''s coverage","Deep-clean one building","Post next month''s schedule"]'::jsonb, 1, 'Daily: yesterday''s hours, today''s gaps, tomorrow''s coverage. Boring, repeated, essential.'
union all select (select cid from c), 'written', 'manager-routine', 'Before hours go to payroll, the manager must:', '["Send them immediately","Review and approve the week: every shift accounted for, corrections logged, overtime flagged","Ask cleaners if the hours look right and trust it","Round everything to the nearest hour"]'::jsonb, 1, 'Payroll-ready means reviewed. Unreviewed hours create overpayments and underpayments — and underpaying once destroys trust.'
union all select (select cid from c), 'written', 'manager-routine', 'Why rotate undesirable shifts fairly instead of giving them to the newest person?', '["New people should suffer","The same person always getting bad shifts quits; fairness keeps the team","It does not matter","Clients prefer it"]'::jsonb, 1, 'Perceived unfairness kills morale and retention. Keep a mental ledger and rotate the tough shifts.'
union all select (select cid from c), 'written', 'fairness-docs', 'A cleaner is late 3 times in 2 weeks. What is the right first step?', '["Write them up immediately","Private conversation: ask what is going on — the schedule might be the problem, not the person","Cut their hours as punishment","Tell the client"]'::jsonb, 1, 'Listen first. Impossible drive time is a scheduling failure; only coach the person if the person is the problem.'
union all select (select cid from c), 'written', 'fairness-docs', 'Why document every call-off, late arrival, and coaching conversation?', '["To build a case to fire everyone","Patterns are only visible in writing — documentation makes coaching fair and consistent","It is fun","Clients require it"]'::jsonb, 1, 'Memory is biased. Written records reveal real patterns and keep every conversation fair.'
union all select (select cid from c), 'written', 'fairness-docs', 'When you reassign a shift to cover a call-off, you must:', '["Tell the cleaner verbally only","Update the shift in the app so the record matches reality","Wait until tomorrow","Delete the original shift"]'::jsonb, 1, 'The app record must match what actually happened — that is what payroll, GPS, and accountability all rely on.'
union all select (select cid from c), 'written', 'overtime', 'A cleaner is at 36 hours by Thursday and scheduled 12 more Friday. What do you do?', '["Let it ride — overtime is fine","Check: is overtime approved and budgeted? If not, reassign Friday hours to someone under 40","Cancel Friday''s client","Tell them to clock out early mid-shift"]'::jsonb, 1, 'Overtime needs a plan before it happens. Reassign proactively; never strand a client or surprise the budget.'
union all select (select cid from c), 'written', 'overtime', 'What should you check each morning in yesterday''s time entries?', '["Nothing — trust the system","Every scheduled shift has a matching clock-in; flag gaps and late arrivals","Only total hours","Only GPS locations"]'::jsonb, 1, 'Match shifts to clock-ins daily. Gaps mean no-shows or missed punches — catch them within 24 hours.'
union all select (select cid from c), 'written', 'overtime', 'A shift shows clock-in at 6:47 PM for a 6:00 PM start. You should:', '["Ignore it — 47 minutes is nothing","Note the late arrival; one is life, a pattern gets a private conversation","Immediately remove them from the schedule","Call the client to complain"]'::jsonb, 1, 'Note it, watch for patterns, address privately. Late arrivals are data, not immediate verdicts.'
union all select (select cid from c), 'written', 'client-comms', 'A client emails that the lobby trash was overflowing this morning. Your first move?', '["Email back defending the crew","Call them: acknowledge it, take responsibility, state the fix, then verify in person","Wait to see if they mention it again","Offer a discount immediately"]'::jsonb, 1, 'Call, own it, fix it, verify it yourself. One personal check beats ten apologies.'
union all select (select cid from c), 'written', 'client-comms', 'The best time to tell a client about a coverage problem is:', '["After they discover it","Before the service window, with the solution already in hand","Never","At the monthly meeting"]'::jsonb, 1, 'Proactive + solution-first. ''Coverage confirmed, running 2 hours late'' preserves trust.'
union all select (select cid from c), 'written', 'client-comms', 'After fixing a client complaint, what cements the recovery?', '["A long apology email","Verifying in person and sending proof (e.g., a photo of the clean lobby)","A gift basket","Pretending it never happened"]'::jsonb, 1, 'Show, do not just tell. A photo of the fixed issue proves the system worked.';

-- ============ STEP 7: SCENARIO EXAM (5 groups x 2) ============

with c as (select id as cid from public.training_courses where slug = 'operations-management')
insert into public.training_questions (course_id, kind, variant_group, question, choices, correct_index, explanation)
select (select cid from c), 'scenario', 'calloff-night', 'It is 5 PM. Your cleaner texts that they cannot make the 6–10 PM shift at your biggest account. What is the correct sequence?', '["Text back ''ok'' and hope for the best","Coverage first (call the bench), update the app, tell the client before the window, document, coach tomorrow","Drive over and clean it yourself silently","Cancel the client''s service for tonight"]'::jsonb, 1, 'Coverage. App. Client. Document. Coach. — in that order, every time.'
union all select (select cid from c), 'scenario', 'calloff-night', 'Nobody on the bench answers and the shift starts in 45 minutes. What now?', '["Give up and go home","You cover it or split it — and tell the client proactively that tonight''s service may run late","Pretend it did not happen","Blame the cleaner to the client"]'::jsonb, 1, 'When the bench fails, management covers. Proactive honesty with the client, then fix the bench depth tomorrow.'
union all select (select cid from c), 'scenario', 'new-hire-risk', 'You realize your week-2 hire is scheduled solo tomorrow at a bank — her first solo shift. What do you do?', '["Let her try — sink or swim","Pull an experienced cleaner to overlap her first hour; adjust both shifts in the app","Cancel the bank''s service","Move her to a bigger building instead"]'::jsonb, 1, 'No solo shifts before shadowing is complete. Overlap coverage protects the client and the new hire.'
union all select (select cid from c), 'scenario', 'new-hire-risk', 'A new hire''s shadow shift partner calls off. The new hire says ''I think I can handle it alone.'' What do you do?', '["Let them — confidence is good","No: find another experienced person to shadow, or reschedule coverage. The rule has no exceptions.","Let them try half the building","Reduce the scope for tonight"]'::jsonb, 1, 'The shadowing rule exists for days like this. Eagerness is not readiness — protect the account.'
union all select (select cid from c), 'scenario', 'hours-dispute', 'A cleaner says their paycheck is short 3 hours. The app shows no clock-in for Tuesday. They say they forgot to punch. What do you do?', '["Pay the 3 hours, no questions","Check the schedule and any GPS/data for Tuesday, verify with the location if needed, then log a documented correction — and remind them corrections must be same-day","Refuse — no punch, no pay","Pay it but warn them next time they are fired"]'::jsonb, 1, 'Verify, then correct with documentation. Fair to the cleaner, honest to the business. Same-day rule going forward.'
union all select (select cid from c), 'scenario', 'hours-dispute', 'You notice a cleaner''s clock-outs are consistently 15 minutes after the crew leaves the building. What is the right approach?', '["Ignore it — 15 minutes is small","Private conversation with the data: ask what is happening, listen, then set the expectation clearly","Publicly shame them in the group chat","Delete the extra time silently"]'::jsonb, 1, 'Private, data-based, curious first. Small leaks sink margins — 15 min × 5 days × 50 weeks is real money.'
union all select (select cid from c), 'scenario', 'supply-crisis', 'Thursday 8 PM: a cleaner calls — they are out of disinfectant mid-shift at a medical building. What does this tell you, and what do you do tonight?', '["It tells you nothing — just buy more tomorrow","It is a par-level failure. Tonight: get them product (deliver it or authorize a nearby purchase with receipt). Tomorrow: set par levels and restock the kit.","Tell them to use water instead","Blame the cleaner for not checking"]'::jsonb, 1, 'Solve tonight (medical building cannot skip disinfectant), fix the system tomorrow with par levels. Never improvise on disinfection.'
union all select (select cid from c), 'scenario', 'supply-crisis', 'A cleaner bought $40 of supplies with their own money ''to keep working.'' How do you handle it?', '["Reimburse quietly and move on","Reimburse immediately with thanks — then fix the system so it never happens again: stocked kits, par levels, no out-of-pocket purchasing","Refuse reimbursement — not authorized","Tell them to keep receipts next time"]'::jsonb, 1, 'Reimburse (they saved the shift), then eliminate the cause. Out-of-pocket purchasing is a management failure.'
union all select (select cid from c), 'scenario', 'schedule-conflict', 'Two cleaners both request next Friday off. Friday has 3 critical shifts. What do you do?', '["First come, first served — deny the second","Approve both and figure it out later","Deny both","Check coverage: approve if the bench covers it; if not, explain the constraint honestly and offer alternatives"]'::jsonb, 3, 'Decide on coverage math, not favoritism. Honest ''I can approve one — who asked first / who has better attendance'' beats arbitrary no.'
union all select (select cid from c), 'scenario', 'schedule-conflict', 'A reliable cleaner asks to swap a Saturday shift with a coworker who agrees. What do you do?', '["Forbid swaps — too confusing","Allow it, but the swap must be confirmed in the app so the record matches reality","Allow it verbally, no need to update anything","Only allow swaps with 2 weeks notice"]'::jsonb, 1, 'Swaps are fine — unrecorded swaps are not. The app must reflect who actually works, for payroll and accountability.';

-- ============ STEP 8: PRACTICAL FINAL ============

with c as (select id as cid from public.training_courses where slug = 'operations-management')
insert into public.training_practicals (course_id, title, instructions, checklist)
select (select cid from c), 'Practical: run a supervised week of operations',
'For one full week, you are the acting operations manager under supervision. Post the schedule, run the daily 15-minute checks, handle anything that comes up, and close out the week with reviewed, payroll-ready hours. Your supervising manager observes and debriefs daily.',
'["Posted next week''s schedule at least 7 days ahead with every shift assigned","Verified each cleaner''s hours stayed within their agreed limits","Confirmed realistic drive time between back-to-back buildings","Kept at least one backup person available for coverage","Ran the daily 15-minute check: yesterday''s hours, today''s gaps, tomorrow''s coverage","Handled or simulated handling of one call-off using coverage-app-client-document-coach","Updated the app immediately for any shift change","Reviewed and corrected any missed punches same-day with documentation","Checked supply levels and restocked before anything ran out","Closed the week with reviewed, payroll-ready hours (overtime flagged)","Debriefed with supervising manager on what went well and what to improve","Submitted evidence: screenshots of the posted schedule and the reviewed hours"]'::jsonb;
