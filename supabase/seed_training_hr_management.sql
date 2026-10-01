-- Seed: HR Management for Cleaning Companies (hr-management)
-- Run AFTER 021_training_academy.sql in the WorkTeams Supabase project.
-- Idempotent: safe to re-run.

delete from public.training_questions where course_id = (select id from public.training_courses where slug = 'hr-management');
delete from public.training_lessons where course_id = (select id from public.training_courses where slug = 'hr-management');
delete from public.training_practicals where course_id = (select id from public.training_courses where slug = 'hr-management');
delete from public.training_steps where course_id = (select id from public.training_courses where slug = 'hr-management');
delete from public.training_courses where slug = 'hr-management';

insert into public.training_courses (slug, title, description, category, department, sort_order, estimated_hours, recert_months)
values ('hr-management', 'HR Management for Cleaning Companies', 'Hiring, onboarding, and managing cleaning crews: interviews, expectations, discipline, and retention.', 'business', 'Human Resources', 1, 4, 12);

with c as (select id as cid from public.training_courses where slug = 'hr-management')
insert into public.training_steps (course_id, step_number, step_key, title, description)
select cid, 1, 'reading', 'Reading: HR fundamentals', 'Core knowledge: hiring, interviewing, onboarding, discipline, retention.' from c
union all select cid, 2, 'visual', 'Visual guide: HR tools', 'Diagrams that reinforce the reading.' from c
union all select cid, 3, 'worked_example', 'Worked example: hiring start to finish', 'A complete hire from job post to 30-day check-in.' from c
union all select cid, 4, 'guided_practice', 'Guided practice', 'Practice scoring candidates and writing expectations.' from c
union all select cid, 5, 'simulator', 'Simulator: the no-show dilemma', 'Handle a real attendance problem safely.' from c
union all select cid, 6, 'written_exam', 'Written exam', 'Randomized questions. 80% to pass.' from c
union all select cid, 7, 'scenario_exam', 'Scenario exam', 'What would you do? 80% to pass.' from c
union all select cid, 8, 'practical_final', 'Practical final', 'Run a mock interview and write an onboarding plan.' from c
union all select cid, 9, 'evidence', 'Evidence submission', 'Upload proof of your work.' from c
union all select cid, 10, 'approval', 'Manager approval', 'A manager reviews and approves.' from c
union all select cid, 11, 'recertification', 'Recertification', 'Stay current. Renew before expiry.' from c;

-- ============ STEP 1: READING ============

with c as (select id as cid from public.training_courses where slug = 'hr-management'),
st as (select step_number, id as sid from public.training_steps where course_id = (select cid from c))
insert into public.training_lessons (course_id, step_id, sort_order, kind, title, body, media_svg)
select (select cid from c), (select sid from st where step_number = 1), 1, 'reading', 'Hiring Cleaners Who Stay',
'Hiring is the most important thing you will do as a manager. A great cleaner makes your clients happy, your schedule stable, and your life easy. A bad hire costs you weeks: recruiting again, retraining, fixing client complaints, and covering shifts yourself.

The number one trait to hire for is reliability. Cleaning skill can be taught in a week. Showing up on time, every time, cannot be taught. A reliable cleaner with average skill beats a skilled cleaner who misses shifts.

Here is what to look for, in order:

1. RELIABILITY. Do they have steady work history? Do they speak respectfully about past employers? Do they have a real plan to get to work (car, ride, bus route)? Someone with no transportation plan is a future no-show.

2. ATTITUDE. Do they take pride in work? In the interview, ask what a job well done looks like to them. People who light up talking about doing things right will clean well. People who shrug will cut corners.

3. ATTENTION TO DETAIL. Cleaners notice what others miss. Ask: "Walk me through how you clean a bathroom." Detailed answers (grout, fixtures, mirrors, trash, restock) beat vague ones ("I clean everything").

4. PHYSICAL READINESS. Cleaning is physical: lifting, bending, standing for hours. Be honest about this in the job post. It is kinder to everyone if the person knows what the job demands before day one.

5. SCHEDULE FIT. Night shifts, weekends, early mornings — cleaning runs on odd hours. Confirm they can work the actual schedule for at least six months. "We will see" means no.

6. COMMUNICATION. They must report problems: a broken dispenser, a spill, a client request. Ask how they would tell you about a problem. You want someone who speaks up, not someone who hides it.

Where to find candidates: employee referrals are the best source — offer a $50 to $100 bonus after the new hire completes 90 days. Also try local job boards, community Facebook groups, church bulletins, and a simple "Now Hiring" sign at your current client sites (with client permission).

Red flags: a pattern of very short jobs with no explanation, badmouthing every past boss, no questions for you at all, or reluctance to commit to the schedule. One of these is a caution. Two is a no.

Finally, give a realistic job preview. Tell them plainly: "This is physical work, mostly nights, and clients notice everything." The right people will be more interested, not less. The wrong people will self-select out, which saves you both a painful month.',
null
union all select (select cid from c), (select sid from st where step_number = 1), 2, 'reading', 'The Structured Interview',
'A structured interview means every candidate gets the same core questions, scored the same way. It is fairer than "going with your gut," and it lets you compare candidates side by side instead of relying on memory.

Build your question list before you interview anyone. Aim for 6 to 8 questions. Mix three types:

BEHAVIORAL questions ask about the past because past behavior predicts future behavior. Examples:
- "Tell me about a time you had to finish a job when you were exhausted. What did you do?"
- "Tell me about a time you made a mistake at work. How did you handle it?"
Listen for ownership. "I fixed it and told my boss" beats "It was not my fault."

SITUATIONAL questions describe a cleaning scenario:
- "You are cleaning an office at night and you knock over a plant, breaking the pot. What do you do?"
- "A client employee asks you to clean something that is not on your task list. What do you do?"
Good answers: report the breakage honestly and clean it up; politely explain you will check with your supervisor about the extra task rather than just saying yes or no.

COMMITMENT questions confirm the practical stuff:
- "This shift is Monday through Friday, 6 PM to 10 PM. Can you commit to that schedule for six months?"
- "Do you have reliable transportation to get to [location] by 6 PM?"
Get clear yes answers. Vague answers become attendance problems.

Score each answer 1 to 5 as you go: 1 = poor, 3 = acceptable, 5 = excellent. Add a notes column for exact quotes. Total the scores at the end. The scorecard (see the visual step) keeps you honest — without it, the friendliest talker usually wins, and friendliness is not reliability.

What NOT to ask: keep every question job-related. Do not ask about age, marital status, children or pregnancy, disability or health conditions, religion, or national origin. You can ask "Can you perform the physical tasks of this job, with or without accommodation?" — that is about the job. "Do you have back problems?" is not. Note: this is general guidance, not legal advice. Employment rules vary by state and change, so check your state''s current rules if you are unsure.

Always check two references. Ask: "Would you hire them again?" and "Was their attendance reliable?" Short, factual answers tell you a lot. If a reference hesitates on attendance, believe the hesitation.

Close every interview the same way: explain the next steps and when they will hear from you. Then decide within 48 hours. Good candidates do not wait around.',
null
union all select (select cid from c), (select sid from st where step_number = 1), 3, 'reading', 'Onboarding, Expectations, and Keeping Good People',
'A new hire decides in the first two weeks whether your company is worth staying at. A messy, confusing start tells them the whole operation is messy. A clear, welcoming start tells them you are professional and they made the right choice.

FIRST DAY CHECKLIST. Before they arrive, have ready: uniform or dress code, keys or access codes, the client site rules, and a printed task list for their site. Pair them with your best cleaner for at least two shadow shifts. Never send a new hire alone on day one — that is how client complaints are born.

WRITTEN EXPECTATIONS. Give every new hire a one-page expectations sheet and have them sign it. Cover:
- Attendance: shifts start on time. Call or text at least 2 hours before a shift if you cannot make it. Three no-call-no-shows means termination.
- Quality: the site task list is the standard. Initial each area when done.
- Phone use: phones stay in pockets except for work communication and emergencies.
- Client privacy and property: never open drawers or files, never take anything, report anything broken immediately.
- Communication: report problems the same shift — a broken dispenser, a spill, a client request.

ATTENDANCE POLICY. Put it in writing and enforce it evenly. A common standard: 3 unexcused absences in 90 days triggers a written warning; a no-call-no-show counts double. Enforce it for everyone — nothing kills morale faster than watching the boss''s favorite skip shifts with no consequence.

PROGRESSIVE DISCIPLINE. When expectations are broken, escalate in steps:
1. Verbal warning — a private conversation. Still write it down with the date.
2. Written warning — signed by both of you, stating what happens next.
3. Final warning — one more chance, clearly stated.
4. Termination — when the pattern continues.
Always document with dates and facts ("Late 25 minutes on March 3, no call"), never opinions ("bad attitude"). Documentation protects you and is fair to the employee — they always know where they stand.

RETENTION. Replacing a cleaner costs you roughly $500 to $1,500 in recruiting, training, and covered shifts. Keeping good people is cheaper than finding new ones. The biggest retention levers: pay fairly and always on time, recognize good work specifically ("The restrooms at the clinic looked perfect Tuesday"), give a path up (lead cleaner, trainer, supervisor), and ask twice a year: "What would make this job better for you?" Then act on at least one answer.

When someone does leave, ask why in a short exit conversation. If three people in a row mention the same supervisor or the same schedule, you have found your real problem.',
null;

-- ============ STEP 2: VISUAL ============

with c as (select id as cid from public.training_courses where slug = 'hr-management'),
st as (select step_number, id as sid from public.training_steps where course_id = (select cid from c))
insert into public.training_lessons (course_id, step_id, sort_order, kind, title, body, media_svg)
select (select cid from c), (select sid from st where step_number = 2), 1, 'visual', 'The Interview Scorecard',
'Print one scorecard per candidate. Score each area 1 to 5 during the interview. Total the scores to compare candidates fairly — the numbers keep you honest when one candidate is simply more talkative than another.',
'<svg width="460" height="330" xmlns="http://www.w3.org/2000/svg"><rect x="5" y="5" width="450" height="320" rx="12" fill="#f8fafc" stroke="#cbd5e1"/><text x="230" y="36" text-anchor="middle" font-size="19" font-weight="bold" fill="#1e293b">Interview Scorecard</text><text x="230" y="58" text-anchor="middle" font-size="13" fill="#64748b">Candidate: ______________ Date: ________</text><g font-size="14" fill="#1e293b"><rect x="20" y="75" width="420" height="34" rx="6" fill="#e0f2fe"/><text x="32" y="97">Reliability (history, transport plan)</text><text x="400" y="97" text-anchor="middle">__/5</text><rect x="20" y="114" width="420" height="34" rx="6" fill="#fef3c7"/><text x="32" y="136">Attitude (pride in work)</text><text x="400" y="136" text-anchor="middle">__/5</text><rect x="20" y="153" width="420" height="34" rx="6" fill="#e0f2fe"/><text x="32" y="175">Attention to detail</text><text x="400" y="175" text-anchor="middle">__/5</text><rect x="20" y="192" width="420" height="34" rx="6" fill="#fef3c7"/><text x="32" y="214">Schedule fit (can commit 6 months)</text><text x="400" y="214" text-anchor="middle">__/5</text><rect x="20" y="231" width="420" height="34" rx="6" fill="#e0f2fe"/><text x="32" y="253">Communication (speaks up)</text><text x="400" y="253" text-anchor="middle">__/5</text></g><rect x="20" y="276" width="420" height="36" rx="6" fill="#1e293b"/><text x="230" y="300" text-anchor="middle" font-size="16" font-weight="bold" fill="#ffffff">TOTAL: ______ / 25</text></svg>'
union all select (select cid from c), (select sid from st where step_number = 2), 2, 'visual', 'The Progressive Discipline Ladder',
'Discipline climbs one rung at a time. Every rung is documented with dates and facts. The employee always knows exactly where they stand and what happens next — no surprises on either side.',
'<svg width="460" height="360" xmlns="http://www.w3.org/2000/svg"><rect x="5" y="5" width="450" height="350" rx="12" fill="#f8fafc" stroke="#cbd5e1"/><text x="230" y="36" text-anchor="middle" font-size="19" font-weight="bold" fill="#1e293b">Progressive Discipline Ladder</text><g font-size="14" fill="#1e293b"><rect x="60" y="55" width="340" height="52" rx="8" fill="#fef9c3" stroke="#eab308"/><text x="230" y="76" text-anchor="middle" font-weight="bold">1. Verbal warning</text><text x="230" y="95" text-anchor="middle" font-size="12" fill="#64748b">Private talk — still write it down with the date</text><rect x="60" y="120" width="340" height="52" rx="8" fill="#fed7aa" stroke="#f97316"/><text x="230" y="141" text-anchor="middle" font-weight="bold">2. Written warning</text><text x="230" y="160" text-anchor="middle" font-size="12" fill="#64748b">Signed by both — states what happens next</text><rect x="60" y="185" width="340" height="52" rx="8" fill="#fecaca" stroke="#ef4444"/><text x="230" y="206" text-anchor="middle" font-weight="bold">3. Final warning</text><text x="230" y="225" text-anchor="middle" font-size="12" fill="#64748b">One more chance, clearly stated</text><rect x="60" y="250" width="340" height="52" rx="8" fill="#1e293b"/><text x="230" y="271" text-anchor="middle" font-weight="bold" fill="#ffffff">4. Termination</text><text x="230" y="290" text-anchor="middle" font-size="12" fill="#cbd5e1">Pattern continued — documented throughout</text></g><text x="230" y="330" text-anchor="middle" font-size="12" fill="#64748b">Document facts + dates at every rung. Never skip rungs.</text></svg>';

-- ============ STEP 3: WORKED EXAMPLE ============

with c as (select id as cid from public.training_courses where slug = 'hr-management'),
st as (select step_number, id as sid from public.training_steps where course_id = (select cid from c))
insert into public.training_lessons (course_id, step_id, sort_order, kind, title, body, media_svg)
select (select cid from c), (select sid from st where step_number = 3), 1, 'worked_example', 'Hiring a Night-Shift Cleaner, Start to Finish',
'Follow Rosa, an office manager, as she hires a cleaner for a 6 PM to 10 PM weeknight shift at a 4,000 sq ft insurance office.

THE JOB POST. Rosa writes an honest post:
"Night cleaner needed, Mon–Fri 6 PM–10 PM, $15/hr. Insurance office, 4,000 sq ft: trash, restrooms, dusting, mopping, vacuuming. Must have reliable transportation and be able to commit to this schedule for 6 months. Physical work — on your feet the whole shift. Reply with your availability and any cleaning experience."

Honest posts filter out bad fits before they apply. Twelve people reply. Rosa picks five to interview based on schedule availability and steady work history.

THE INTERVIEWS. Rosa asks all five the same six questions and scores 1–5 on the scorecard. Three stand out:

- DANIELLE (21/25): Two years at a hotel housekeeping job, left because the hotel closed. Detailed bathroom answer. Has a car. "I like seeing a room go from messy to perfect." Asked about growth.
- MARCUS (17/25): Friendly, funny, great talker. Six jobs in two years. "Transportation — I''ll figure it out." Vague on the bathroom question.
- PRIYA (19/25): No professional cleaning experience, but five years at a warehouse with perfect attendance. Thoughtful answers. Takes the bus — the route runs until 11 PM, which covers the shift.

Rosa checks references. Danielle''s hotel manager: "Hire her. Never late once." Priya''s warehouse supervisor: "Reliable, quiet, careful." Marcus''s last reference does not call back.

THE DECISION. Rosa hires Danielle (highest score, verified reliability). She also keeps Priya''s number — strong backup if a second position opens.

WEEK ONE. Day 1: Danielle gets the uniform, the office key code, the client rules sheet (alarm code, which doors stay locked, the "do not touch desks" rule), and the signed expectations sheet. Days 1–2: she shadows Rosa''s best cleaner, Luis, who narrates everything he does. Days 3–5: Danielle works the shift while Luis checks the first hour, then leaves her to finish with a photo check-in at 10 PM.

THE 30-DAY CHECK-IN. Rosa sits down with Danielle for 15 minutes: "What''s going well? What''s hard? What would make the job better?" Danielle says the vacuum is heavy and the cord is frayed. Rosa replaces it that week — a $90 fix that tells Danielle her feedback matters. Danielle stays. The client renews.

Notice what made this work: honest post, same questions, scored answers, reference checks, shadow shifts, and one early act of listening. None of it is complicated. All of it is rare — which is exactly why it wins.',
null;

-- ============ STEP 4: GUIDED PRACTICE ============

with c as (select id as cid from public.training_courses where slug = 'hr-management'),
st as (select step_number, id as sid from public.training_steps where course_id = (select cid from c))
insert into public.training_lessons (course_id, step_id, sort_order, kind, title, body, media_svg)
select (select cid from c), (select sid from st where step_number = 4), 1, 'guided_practice', 'Practice: Score a Candidate',
'Read this interview excerpt, then score the candidate 1–5 on each scorecard area. Answers are at the bottom — cover them while you work.

CANDIDATE: JAMES, applying for Tue/Thu/Sat morning residential route.

Q: "Tell me about your last job."
A: "I worked at a car wash for a year and a half. I left because they cut my hours. My manager there would tell you I was always early."

Q: "Walk me through how you clean a bathroom."
A: "Toilet, sink, mirror, floor. I check the trash and restock the toilet paper. If there''s grout buildup I hit it with the brush."

Q: "This route starts at 8 AM sharp. How will you get there?"
A: "I have my own car. It''s about 20 minutes from my place."

Q: "A client says you missed a room, but you know you cleaned it. What do you do?"
A: "I''d go back and check with them, re-clean it if needed. Arguing never helps."

Q: "Why do you want this job?"
A: "Honestly? I need steady hours and I''m good at this kind of work. I like working alone and seeing the result."

YOUR SCORES (write them down, then check):
- Reliability: __/5
- Attitude: __/5
- Attention to detail: __/5
- Schedule fit: __/5
- Communication: __/5

CHECK YOURSELF:
- Reliability 4: 18 months at one job, "always early," own car. Not a 5 only because one job is a short history.
- Attitude 4: honest, takes pride ("seeing the result"). Not gushing, which is fine.
- Attention to detail 4: specific bathroom sequence including grout. Solid.
- Schedule fit 5: clear yes, own car, 20 minutes away.
- Communication 5: perfect answer on the missed-room question — verify, don''t argue.
Total: 22/25. This is a strong hire. Reference check, then offer.',
null
union all select (select cid from c), (select sid from st where step_number = 4), 2, 'guided_practice', 'Practice: Write Your Attendance Rule',
'Grab a piece of paper or your notes app. Write your company''s attendance rule as one short paragraph a new hire could understand in 30 seconds. It must answer three questions: How much notice? What counts as a no-call-no-show? What happens after repeated problems?

Example of a good one — compare yours to it:

"Shifts start on time. If you cannot make a shift, call or text your supervisor at least 2 hours before start time. Not calling and not showing up counts as a no-call-no-show. Three no-call-no-shows, or five unexcused absences in 90 days, means termination. We enforce this the same for everyone."

CHECK YOURSELF — your paragraph should have:
[ ] A specific notice time (not "as soon as possible")
[ ] A definition of no-call-no-show
[ ] A specific consequence with numbers
[ ] The words "same for everyone" or equivalent

Now write your progressive discipline ladder in four lines, one per rung, using your own words. Then compare: rung 1 private conversation (documented), rung 2 written and signed, rung 3 final warning, rung 4 termination. If yours skips from rung 1 to rung 4, add the middle rungs — skipping rungs is how good employees feel blindsided and bad ones claim unfairness.',
null;

-- ============ STEP 5: SIMULATOR ============

with c as (select id as cid from public.training_courses where slug = 'hr-management'),
st as (select step_number, id as sid from public.training_steps where course_id = (select cid from c))
insert into public.training_lessons (course_id, step_id, sort_order, kind, title, body, media_svg)
select (select cid from c), (select sid from st where step_number = 5), 1, 'simulator', 'Simulator: Two No-Shows in One Week',
'THE SITUATION. Dana has cleaned the downtown medical plaza for you for four months. Her work is excellent — the client complimented her twice. But this week: no-show Monday (no call), then 40 minutes late Wednesday (no call). You had to cover Monday yourself and got home at midnight. It is Thursday morning. Dana is scheduled tonight. What do you do?

OPTION A: Fire her today. Send a text: "Don''t come back."
What happens: You feel better for an hour. Then reality: you must recruit, interview, and train a replacement (2–4 weeks), cover her shifts yourself, and risk the client noticing a dip in quality. You also just taught your team that one bad week — with no conversation — ends a job. Your good people get nervous. Your struggling people learn nothing.

OPTION B: Private sit-down today. "Dana, Monday no-show and Wednesday 40 minutes late with no call — that can''t happen. What''s going on?" Listen. Then: "I value your work, which is why I''m telling you straight: this is a verbal warning, and I''m documenting it. One more no-call-no-show and it becomes a written warning. Can you commit to the schedule going forward?"
What happens: You might learn something fixable — her car broke down, a family emergency, a schedule conflict she was afraid to mention. Either way, Dana now knows exactly where she stands and what happens next. Document the conversation with the date. Most good employees correct course here.

OPTION C: Say nothing and hope it was a fluke.
What happens: The team watches. Luis, who has never been late, notices Dana faced zero consequences. Within a month, two more people test the boundary. You now have a culture problem instead of a Dana problem — much harder to fix.

THE RIGHT MOVE: B. Address it fast, privately, and calmly. Listen first — there may be a solvable cause. State the facts, give the warning, document it, and set the line clearly. Then follow through exactly as promised, good or bad. Consistency is the whole game: the team must see that the rules are real and apply to everyone, including top performers.

YOUR TURN — write out what you would say in the first 60 seconds of the sit-down with Dana. Keep it to facts, no insults, no mind-reading. Example: "Dana, I need to talk about this week. Monday you didn''t show and didn''t call, and Wednesday you were 40 minutes late with no call. Your work has been excellent, which is why this surprised me. What happened?" Compare your version: facts first, acknowledges the good, asks what happened. If yours starts with "You always..." or "You never...", rewrite it — absolutes start fights, facts start conversations.',
null;

-- ============ STEP 6: WRITTEN EXAM (8 groups x 3 variants = 24) ============

with c as (select id as cid from public.training_courses where slug = 'hr-management')
insert into public.training_questions (course_id, kind, variant_group, question, choices, correct_index, explanation)
select (select cid from c), 'written', 'hiring-traits', 'What is the single most important trait to hire for in a cleaner?', '["Cleaning speed","Reliability — showing up on time, every time","Years of experience","Owning professional equipment"]'::jsonb, 1, 'Cleaning skill can be taught in a week. Showing up reliably cannot be taught, and one unreliable cleaner breaks your whole schedule.'
union all select (select cid from c), 'written', 'hiring-traits', 'A candidate has amazing cleaning skills but a history of missing shifts. What should you do?', '["Hire them — skill is rare","Hire them on a trial basis with no attendance rule","Pass — reliability matters more than skill","Hire them only for backup shifts"]'::jsonb, 2, 'A skilled no-show still leaves shifts uncovered and forces you to cover. Reliability comes first; skill can be trained.'
union all select (select cid from c), 'written', 'hiring-traits', 'Why should you ask candidates about their transportation plan?', '["To judge their income level","Because no transportation plan is a future no-show","It is required by law","To decide their pay rate"]'::jsonb, 1, 'If they cannot reliably get to the site, they cannot reliably work the shift. A vague answer ("I will figure it out") is a red flag.'
union all select (select cid from c), 'written', 'interview-structure', 'What makes an interview "structured"?', '["Asking tough trick questions","Asking every candidate the same core questions and scoring them the same way","Letting the conversation flow naturally","Interviewing with two managers present"]'::jsonb, 1, 'Same questions plus a scorecard lets you compare candidates fairly instead of relying on memory or gut feeling.'
union all select (select cid from c), 'written', 'interview-structure', 'What is the main purpose of the 1-to-5 interview scorecard?', '["To impress the candidate","To keep scoring honest so the best talker does not automatically win","To satisfy insurance requirements","To decide the starting pay"]'::jsonb, 1, 'Without scores, the friendliest talker usually wins — and friendliness is not reliability. Numbers keep you objective.'
union all select (select cid from c), 'written', 'interview-structure', 'Which question best tests attention to detail?', '["Do you consider yourself detail-oriented?","Walk me through how you clean a bathroom.","Are you a hard worker?","Do you like cleaning?"]'::jsonb, 1, 'Yes/no questions get yes answers. "Walk me through" forces specifics — grout, fixtures, restocking — which reveal real attention to detail.'
union all select (select cid from c), 'written', 'interview-legal', 'Which interview question should you AVOID?', '["Can you work Monday to Friday, 6 PM to 10 PM?","Do you have reliable transportation to the site?","Do you have children who might affect your schedule?","Can you perform the physical tasks of this job?"]'::jsonb, 2, 'Keep questions job-related. Family status questions are off-limits. Ask about schedule commitment and job tasks instead.'
union all select (select cid from c), 'written', 'interview-legal', 'A candidate mentions they have a disability. What can you ask?', '["What is your diagnosis?","Can you perform the physical tasks of this job, with or without accommodation?","Will this make you miss work?","How severe is it?"]'::jsonb, 1, 'Ask only about ability to do the job''s tasks. Medical details are never your business. (General guidance, not legal advice.)'
union all select (select cid from c), 'written', 'interview-legal', 'Why ask the same questions to every candidate?', '["It saves time","It is fairer and lets you compare candidates side by side","Candidates prefer it","It is required for small businesses"]'::jsonb, 1, 'Consistency is fairness. Different questions for different people opens the door to bias and makes comparison impossible.'
union all select (select cid from c), 'written', 'onboarding', 'What should happen on a new hire''s FIRST day?', '["Send them to the site alone to prove themselves","Pair them with your best cleaner for shadow shifts","Have them watch training videos at home","Give them the hardest site first"]'::jsonb, 1, 'Never send a new hire alone on day one. Shadow shifts with your best cleaner transfer your standards directly.'
union all select (select cid from c), 'written', 'onboarding', 'What should every new hire receive in writing on day one?', '["The client''s alarm code only","A one-page expectations sheet covering attendance, quality, phone use, and property rules","A list of all other employees'' pay rates","The company''s financial statements"]'::jsonb, 1, 'Written, signed expectations remove all "nobody told me" arguments later. Cover attendance, quality standard, phones, and client property.'
union all select (select cid from c), 'written', 'onboarding', 'When should the 30-day check-in happen?', '["Never — it shows weakness","Around 30 days in: ask what is going well, what is hard, what would help","Only if there are problems","After 6 months"]'::jsonb, 1, 'A short 15-minute check-in shows you listen and catches small problems (bad equipment, schedule friction) before they become resignations.'
union all select (select cid from c), 'written', 'attendance', 'What is a "no-call-no-show"?', '["Calling in sick with a doctor''s note","Not showing up and not contacting the supervisor at all","Arriving 5 minutes late","Swapping a shift with approval"]'::jsonb, 1, 'No call plus no show is the most serious attendance violation — the shift goes uncovered with zero warning.'
union all select (select cid from c), 'written', 'attendance', 'Your attendance policy should be enforced:', '["Strictly for new hires, loosely for veterans","The same for everyone","Only when clients complain","Only for night shifts"]'::jsonb, 1, 'Nothing kills morale faster than watching the favorite skip shifts with no consequence. Even enforcement is the whole point.'
union all select (select cid from c), 'written', 'attendance', 'A good attendance rule tells new hires:', '["How much notice to give, what counts as a no-call-no-show, and the specific consequences","To try their best","That attendance is important","To call whenever convenient"]'::jsonb, 0, 'Vague rules get vague compliance. Specifics — 2 hours notice, 3 no-call-no-shows means termination — leave no room for argument.'
union all select (select cid from c), 'written', 'discipline', 'What is the correct order of progressive discipline?', '["Written warning, verbal warning, final warning, termination","Verbal warning, written warning, final warning, termination","Termination, then warnings","Final warning, verbal warning, written warning"]'::jsonb, 1, 'Climb one rung at a time: private conversation, then written and signed, then final warning, then termination. No surprises.'
union all select (select cid from c), 'written', 'discipline', 'Should you document a verbal warning?', '["No — verbal means off the record","Yes — write it down with the date even though the conversation was verbal","Only if the employee asks","Only for serious issues"]'::jsonb, 1, 'Every rung gets documented with dates and facts. If it is not written down, it did not happen — for fairness and protection.'
union all select (select cid from c), 'written', 'discipline', 'An employee is late for the first time in a year. What is the right first step?', '["Written warning","A private conversation about what happened","Final warning","Termination"]'::jsonb, 1, 'Start at rung one for a first issue from a good employee. Skipping rungs makes good people feel blindsided.'
union all select (select cid from c), 'written', 'documentation', 'When documenting discipline, you should record:', '["Your opinions about their attitude","Dates and facts, such as the exact date, minutes late, and whether they called","What other employees said about them","Your best guess at their motives"]'::jsonb, 1, 'Facts and dates are fair and defensible. Opinions ("bad attitude") start fights and prove nothing.'
union all select (select cid from c), 'written', 'documentation', 'Why does documentation matter most?', '["It fills filing cabinets","It protects both sides: the employee always knows where they stand, and you can show a pattern","It scares employees","Insurance requires it"]'::jsonb, 1, 'Documentation is fairness in writing — no surprises for the employee, and a clear record of the pattern if it continues.'
union all select (select cid from c), 'written', 'documentation', 'A written warning should be:', '["Kept secret from the employee","Signed by both you and the employee, stating what happens next","Only verbal","Emailed to the client"]'::jsonb, 1, 'Both signatures prove the employee saw it, and stating the next step removes all surprise about consequences.'
union all select (select cid from c), 'written', 'retention', 'Replacing a cleaner typically costs:', '["Nothing — hiring is free","Roughly $500 to $1,500 in recruiting, training, and covered shifts","About $50","Only the job ad fee"]'::jsonb, 1, 'Turnover is expensive: ads, interviews, training hours, your own time covering shifts, and client risk. Retention is cheaper.'
union all select (select cid from c), 'written', 'retention', 'Which is the strongest retention lever?', '["Free pizza once a year","Pay fairly and on time, recognize good work specifically, offer a path up","Strict rules","Longer shifts"]'::jsonb, 1, 'Fair on-time pay, specific recognition ("the restrooms looked perfect Tuesday"), and a path to lead cleaner keep people.'
union all select (select cid from c), 'written', 'retention', 'When an employee quits, you should:', '["Walk them out immediately with no discussion","Hold a short exit conversation to learn why","Ask them to stay no matter what","Blame their supervisor"]'::jsonb, 1, 'If three departing people name the same supervisor or schedule, you have found your real problem. Exits are free consulting.';

-- ============ STEP 7: SCENARIO EXAM (5 groups x 2 variants = 10) ============

with c as (select id as cid from public.training_courses where slug = 'hr-management')
insert into public.training_questions (course_id, kind, variant_group, question, choices, correct_index, explanation)
select (select cid from c), 'scenario', 'no-show-response', 'Your best cleaner, Ana, no-shows on Monday with no call. It is her first attendance issue in 6 months. What do you do Tuesday?', '["Fire her immediately to set an example","Have a private sit-down: state the facts, listen, give a verbal warning, document it","Say nothing — she is your best cleaner","Cut her hours as punishment without discussion"]'::jsonb, 1, 'First issue from a good employee starts at rung one: private conversation, facts, verbal warning, documentation. Firing skips every rung.'
union all select (select cid from c), 'scenario', 'no-show-response', 'An employee is 45 minutes late for the third time this month, no call each time. You already gave a verbal warning last month. What is next?', '["Another verbal warning","A written warning, signed by both of you, stating what happens next","Fire them on the spot","Ignore it — they are short-staffed"]'::jsonb, 1, 'The ladder climbs one rung at a time. Verbal was given, pattern continued, so rung two is the written warning — signed, with the next consequence stated.'
union all select (select cid from c), 'scenario', 'interview-eval', 'A candidate gives vague answers ("I clean everything") and cannot commit to your night schedule. But they seem very friendly. You should:', '["Hire them — friendliness wins clients","Pass — vague answers plus schedule uncertainty are two red flags","Hire them for days instead","Ask them to try one shift unpaid"]'::jsonb, 1, 'One red flag is caution, two is a no. Vague detail answers predict corner-cutting, and schedule uncertainty predicts no-shows. Never use unpaid trial shifts.'
union all select (select cid from c), 'scenario', 'interview-eval', 'Two candidates: one scores 22/25 with verified references, the other scores 15/25 but interviewed with more charisma. Who do you hire?', '["The charismatic one — clients like personality","The 22/25 scorer — the scorecard exists to beat gut feeling","Neither — keep looking for a perfect 25","Whoever can start tomorrow"]'::jsonb, 1, 'Trust the system you built. The scorecard plus reference checks beat charisma, and "whoever can start tomorrow" is how bad hires happen.'
union all select (select cid from c), 'scenario', 'employee-complaint', 'A client reports that your cleaner was rude to their receptionist. The cleaner denies it. What do you do first?', '["Fire the cleaner — the client is always right","Tell the client the cleaner denied it and close the case","Investigate calmly: get details from the client, speak privately with the cleaner, then decide","Move the cleaner to a different site with no discussion"]'::jsonb, 2, 'Get facts from both sides before deciding. Reacting on one side''s story alone is unfair and teaches the team you do not have their back.'
union all select (select cid from c), 'scenario', 'employee-complaint', 'Two employees argue loudly at a client site. The client emails you about it. What is the right response?', '["Ignore it — they will work it out","Address both privately the same day, document it, remind them client sites are professional zones","Fire both immediately","Tell the client it will never happen again and promise a discount"]'::jsonb, 1, 'Same-day private conversations with both, documented. Client sites are workplaces — professionalism there is non-negotiable, but one incident deserves a warning, not termination.'
union all select (select cid from c), 'scenario', 'raise-request', 'A solid cleaner of 8 months asks for a $1/hour raise. Your margin is tight. What do you do?', '["Say no — raises are annual only","Hear them out, check their record, and decide: a raise tied to taking a harder site or lead duties","Give $2 to be safe","Promise to think about it and never follow up"]'::jsonb, 1, 'Listen, verify their record, and be honest. If yes, tie it to value (harder site, training others). If no, say when you will revisit it. Silence is the worst answer.'
union all select (select cid from c), 'scenario', 'raise-request', 'Your top performer hints they are interviewing elsewhere for $1.50/hour more. Counter-offer on the spot?', '["Yes — match it immediately, no questions","Have a real conversation first: what matters to them besides pay? Then decide what you can sustain","Let them go — nobody is irreplaceable","Offer a title with no raise"]'::jsonb, 1, 'Understand before you react — schedule, respect, and growth often matter as much as pay. Only counter with what your margins can actually sustain long-term.'
union all select (select cid from c), 'scenario', 'termination', 'An employee has had a verbal warning, written warning, and final warning for attendance. They no-show again today. What now?', '["Give one more chance — firing is hard","Terminate, following your documented process","Suspend them for a month","Move them to a different shift"]'::jsonb, 1, 'The ladder was climbed fairly with documentation at every rung. Following through protects your credibility with the whole team. Not following through teaches that warnings are empty.'
union all select (select cid from c), 'scenario', 'termination', 'During a termination meeting, the employee gets angry and raises their voice. You should:', '["Argue back to show authority","Stay calm, keep it brief and factual, have a witness present, end the meeting if you feel unsafe","Cancel the termination","Call the client"]'::jsonb, 1, 'Brief, factual, calm — with a witness. Never match their volume. Safety first: end the meeting if it escalates.';

-- ============ STEP 8: PRACTICAL FINAL ============

with c as (select id as cid from public.training_courses where slug = 'hr-management')
insert into public.training_practicals (course_id, title, instructions, checklist)
select (select cid from c), 'Mock Interview and Onboarding Plan',
'Put your hiring skills into practice. (1) Interview a friend or family member using your 6 to 8 structured questions and the scorecard — treat it like a real interview. (2) Write a one-page onboarding plan for a new night-shift cleaner: first-day checklist, shadow schedule, and your attendance rule. Submit the scored scorecard and the onboarding plan as evidence (photos of the pages are fine).',
'["Wrote 6 to 8 interview questions before the mock interview (mix of behavioral, situational, commitment)","Used the 1-to-5 scorecard during the interview and totaled the score","Asked at least one behavioral question (past behavior) and one situational question","Confirmed schedule commitment and transportation with clear yes/no answers","Asked zero non-job-related questions (no age, family, health, religion, origin)","Onboarding plan includes a first-day checklist (uniform, keys/codes, site rules, task list)","Onboarding plan schedules at least two shadow shifts before solo work","Onboarding plan includes a written attendance rule with notice time and consequences","Onboarding plan includes a 30-day check-in","All pages are legible and submitted as evidence"]'::jsonb;
