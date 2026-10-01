-- Seed: Customer Service Excellence (customer-service)
-- Run AFTER 021_training_academy.sql in the WorkTeams Supabase project.
-- Idempotent: safe to re-run.

delete from public.training_questions where course_id = (select id from public.training_courses where slug = 'customer-service');
delete from public.training_lessons where course_id = (select id from public.training_courses where slug = 'customer-service');
delete from public.training_practicals where course_id = (select id from public.training_courses where slug = 'customer-service');
delete from public.training_steps where course_id = (select id from public.training_courses where slug = 'customer-service');
delete from public.training_courses where slug = 'customer-service';

insert into public.training_courses (slug, title, description, category, department, sort_order, estimated_hours, recert_months)
values ('customer-service', 'Customer Service Excellence', 'Keeping clients happy: communication, complaint handling, service recovery, and reviews.', 'business', 'Customer Service', 3, 3, 12);

with c as (select id as cid from public.training_courses where slug = 'customer-service')
insert into public.training_steps (course_id, step_number, step_key, title, description)
select cid, 1, 'reading', 'Reading: service fundamentals', 'Core knowledge: impressions, communication, complaints, recovery, reviews.' from c
union all select cid, 2, 'visual', 'Visual guide: service tools', 'Diagrams that reinforce the reading.' from c
union all select cid, 3, 'worked_example', 'Worked example: the complaint call', 'A full complaint handled start to finish, with transcript.' from c
union all select cid, 4, 'guided_practice', 'Guided practice', 'Rewrite bad responses and practice scripts.' from c
union all select cid, 5, 'simulator', 'Simulator: the furious client', 'Handle an angry client safely.' from c
union all select cid, 6, 'written_exam', 'Written exam', 'Randomized questions. 80% to pass.' from c
union all select cid, 7, 'scenario_exam', 'Scenario exam', 'What would you do? 80% to pass.' from c
union all select cid, 8, 'practical_final', 'Practical final', 'Role-play a complaint call and write a follow-up.' from c
union all select cid, 9, 'evidence', 'Evidence submission', 'Upload proof of your work.' from c
union all select cid, 10, 'approval', 'Manager approval', 'A manager reviews and approves.' from c
union all select cid, 11, 'recertification', 'Recertification', 'Stay current. Renew before expiry.' from c;

-- ============ STEP 1: READING ============

with c as (select id as cid from public.training_courses where slug = 'customer-service'),
st as (select step_number, id as sid from public.training_steps where course_id = (select cid from c))
insert into public.training_lessons (course_id, step_id, sort_order, kind, title, body, media_svg)
select (select cid from c), (select sid from st where step_number = 1), 1, 'reading', 'First Impressions and Communication Standards',
'Clients decide how they feel about your company in the first 30 days — and they re-decide it every single visit. Great customer service in cleaning is not about grand gestures. It is about being predictably excellent: same quality, same communication, every time.

FIRST IMPRESSIONS. The first clean sets the bar. Walk the site with the client before the first service and write down exactly what "clean" means to them — every client''s definition is slightly different. After the first clean, call or text within 24 hours: "How did everything look?" This one message prevents 80 percent of early misunderstandings, because small issues get fixed before they become complaints.

COMMUNICATION STANDARDS. Set these for your whole team and enforce them:
- Response time: reply to every client message within 2 business hours, even if the answer is "Looking into it, will update you by 5 PM." Silence is what makes clients anxious, not the problem itself.
- Proactive updates: running late? Text before the window passes, not after. "Running 20 minutes behind — still on for today." Clients forgive delays; they do not forgive surprises.
- Professional tone: clean uniform or neat appearance, greet people, no earbuds in during walkthroughs, no smoking on site, vehicles parked neatly.
- One point of contact: the client should know exactly who to call. "Text me directly" beats "call the office and ask around."

CONSISTENCY BEATS BRILLIANCE. A client would rather have a solid B+ clean every single Tuesday than an A+ one week and a C the next. Inconsistency is what triggers "we need to talk" emails. Build checklists per site, initial them, and rotate detail tasks (baseboards one week, blinds the next) so nothing ever looks neglected.

THE LITTLE THINGS THAT READ AS PROFESSIONAL: straightening a crooked rug, lining up trash cans, folding the end of the toilet paper, leaving a small "serviced" card. These take seconds and signal care. Clients notice care more than they notice perfection.

Finally, document everything about the client: gate codes, alarm quirks, the picky conference room, the owner''s name, their preferred contact method. When a new cleaner covers the site, this document is the difference between "seamless" and "who are these people."',
null
union all select (select cid from c), (select sid from st where step_number = 1), 2, 'reading', 'Handling Complaints: Listen, Apologize, Fix, Follow Up',
'Every cleaning company gets complaints. The companies that thrive are not the ones with zero complaints — they are the ones that handle complaints so well the client ends up more loyal than before. Research across service industries keeps proving it: a client whose problem was fixed fast and graciously often becomes a better referrer than a client who never had a problem.

Use the LAFF method on every complaint:

L — LISTEN. Let them finish. Do not interrupt, do not explain, do not defend. Take notes. Most angry clients calm down 50 percent just from being fully heard. Say "I''m listening — tell me everything" and mean it.

A — APOLOGIZE. Apologize for their experience, sincerely, without excuses. "I''m really sorry this happened — that''s not the standard we promise." Note: you are apologizing that it happened, not necessarily admitting fault for everything they claim. Never say "but" after an apology ("I''m sorry, but the trash was overflowing") — "but" deletes the apology.

F — FIX. Ask what a good outcome looks like: "What would make this right for you?" Then fix it fast. Re-clean within 24 hours whenever possible. Speed of the fix matters more than the size of the gesture.

F — FOLLOW UP. Call or visit the next day: "I wanted to make sure yesterday''s re-clean met your expectations." This step is where loyalty is built. Almost nobody follows up, so doing it makes you unforgettable.

WHAT NEVER TO DO: never argue with a client, never blame your employee to the client ("my cleaner messed up" — handle staffing privately), never get defensive, never ignore a complaint hoping it fades. An ignored complaint does not fade; it becomes a cancellation and a bad review.

DE-ESCALATION PHRASES that work: "You''re right to be frustrated." "Help me understand exactly what happened." "Here''s what I''m going to do about it." "I''m going to personally make sure of it." Keep your voice slow and low — calm is contagious, and so is panic.

LOG EVERY COMPLAINT: date, client, issue, what you did, follow-up date. Patterns in the log are gold — three dusting complaints in a month means retrain dusting, not three separate bad luck events.',
null
union all select (select cid from c), (select sid from st where step_number = 1), 3, 'reading', 'Service Recovery, Reviews, and Difficult Clients',
'A complaint handled brilliantly is a marketing opportunity. Here is how to turn problems into loyalty, turn happy clients into reviews, and handle the rare client who is simply not a fit.

SERVICE RECOVERY. After you fix a problem, add one small unexpected extra — not as a bribe, but as proof you care. Examples: detail-clean the break room appliances after a missed-trash complaint, or leave a hand-written note: "Sorry about Tuesday — we re-cleaned the restrooms top to bottom. — [Your name]." The fix solves the problem; the extra creates the story they tell others.

THE REVIEW ASK. The best time to ask for a review is right after a compliment or a successful recovery — never out of the blue. Script: "I''m so glad you''re happy with the service. Would you be willing to leave us a Google review? It really helps a small business like ours. I can text you the link." Make it frictionless: text the direct link. One review per month per happy client compounds fast. Never offer payment for reviews — it violates platform rules and cheapens real praise. If a client had a problem you fixed, wait until the follow-up confirms they are happy, then ask.

RESPONDING TO BAD REVIEWS. Respond publicly, briefly, and graciously: "We''re sorry about your experience. We''d like to make it right — please call us at [number]." Never argue online, never reveal private details. Future clients read your response more than the complaint — they are judging how you handle problems.

DIFFICULT CLIENTS. Most "difficult" clients are just clients with unmet expectations — fix the expectations first. But a small few are truly abusive: yelling at your staff, demanding free work repeatedly, refusing to pay. Your cleaners'' dignity comes first. Script for the line: "We want every client to be happy, and it''s clear we''re not the right fit anymore. We''ll finish out the month so you have time to find a new service." Then actually finish well — your reputation leaves with your last clean.

KNOW YOUR NUMBERS: track client retention rate (what percent renew each year) and the reason for every lost client. If you lose two clients to price in a quarter, your pricing or your value communication needs work — not your cleaning.',
null;

-- ============ STEP 2: VISUAL ============

with c as (select id as cid from public.training_courses where slug = 'customer-service'),
st as (select step_number, id as sid from public.training_steps where course_id = (select cid from c))
insert into public.training_lessons (course_id, step_id, sort_order, kind, title, body, media_svg)
select (select cid from c), (select sid from st where step_number = 2), 1, 'visual', 'The LAFF Complaint Flowchart',
'When a complaint comes in, follow this flowchart in order. Do not skip to "fix" before you listen and apologize — the order is the whole technique.',
'<svg width="460" height="420" xmlns="http://www.w3.org/2000/svg"><rect x="5" y="5" width="450" height="410" rx="12" fill="#f8fafc" stroke="#cbd5e1"/><text x="230" y="36" text-anchor="middle" font-size="19" font-weight="bold" fill="#1e293b">LAFF: Handling a Complaint</text><g font-size="14" fill="#1e293b"><rect x="80" y="55" width="300" height="60" rx="10" fill="#dbeafe" stroke="#2563eb"/><text x="230" y="78" text-anchor="middle" font-weight="bold">L — LISTEN</text><text x="230" y="98" text-anchor="middle" font-size="12" fill="#475569">Let them finish. Take notes. Do not interrupt.</text><polygon points="230,125 222,137 238,137" fill="#64748b"/><rect x="80" y="140" width="300" height="60" rx="10" fill="#fef3c7" stroke="#d97706"/><text x="230" y="163" text-anchor="middle" font-weight="bold">A — APOLOGIZE</text><text x="230" y="183" text-anchor="middle" font-size="12" fill="#475569">Sincere, no excuses. Never add "but".</text><polygon points="230,210 222,222 238,222" fill="#64748b"/><rect x="80" y="225" width="300" height="60" rx="10" fill="#dcfce7" stroke="#16a34a"/><text x="230" y="248" text-anchor="middle" font-weight="bold">F — FIX</text><text x="230" y="268" text-anchor="middle" font-size="12" fill="#475569">"What would make this right?" Fix within 24 hrs.</text><polygon points="230,295 222,307 238,307" fill="#64748b"/><rect x="80" y="310" width="300" height="60" rx="10" fill="#f3e8ff" stroke="#9333ea"/><text x="230" y="333" text-anchor="middle" font-weight="bold">F — FOLLOW UP</text><text x="230" y="353" text-anchor="middle" font-size="12" fill="#475569">Next day: "Did yesterday''s fix meet expectations?"</text></g><text x="230" y="398" text-anchor="middle" font-size="12" fill="#64748b">Log it: date, client, issue, fix, follow-up date.</text></svg>'
union all select (select cid from c), (select sid from st where step_number = 2), 2, 'visual', 'Communication Standards Card',
'Post this where your team will see it. These four standards are non-negotiable.',
'<svg width="460" height="360" xmlns="http://www.w3.org/2000/svg"><rect x="5" y="5" width="450" height="350" rx="12" fill="#f8fafc" stroke="#cbd5e1"/><text x="230" y="36" text-anchor="middle" font-size="19" font-weight="bold" fill="#1e293b">Communication Standards</text><g font-size="14" fill="#1e293b"><rect x="20" y="55" width="420" height="62" rx="8" fill="#ffffff" stroke="#cbd5e1"/><text x="34" y="80" font-weight="bold">⏱ Reply within 2 business hours</text><text x="34" y="100" font-size="12" fill="#64748b">Even if the answer is "looking into it, update by 5 PM".</text><rect x="20" y="125" width="420" height="62" rx="8" fill="#ffffff" stroke="#cbd5e1"/><text x="34" y="150" font-weight="bold">📣 Proactive updates</text><text x="34" y="170" font-size="12" fill="#64748b">Running late? Text BEFORE the window passes, not after.</text><rect x="20" y="195" width="420" height="62" rx="8" fill="#ffffff" stroke="#cbd5e1"/><text x="34" y="220" font-weight="bold">👔 Professional presence</text><text x="34" y="240" font-size="12" fill="#64748b">Neat appearance, greet people, no earbuds on walkthroughs.</text><rect x="20" y="265" width="420" height="62" rx="8" fill="#ffffff" stroke="#cbd5e1"/><text x="34" y="290" font-weight="bold">📇 One point of contact</text><text x="34" y="310" font-size="12" fill="#64748b">The client knows exactly who to call. "Text me directly."</text></g></svg>';

-- ============ STEP 3: WORKED EXAMPLE ============

with c as (select id as cid from public.training_courses where slug = 'customer-service'),
st as (select step_number, id as sid from public.training_steps where course_id = (select cid from c))
insert into public.training_lessons (course_id, step_id, sort_order, kind, title, body, media_svg)
select (select cid from c), (select sid from st where step_number = 3), 1, 'worked_example', 'The Complaint Call: A Full Transcript',
'THE SITUATION. Tuesday, 8:15 AM. You (the manager) get a call from Karen, office manager at a dental practice you clean three nights a week, $850/month. She is upset: Monday night''s clean was bad — trash not emptied in two operatories, the waiting room floor was sticky, and this is the second time in three weeks. Read the call, noticing each LAFF step.

YOU: "Hi Karen, thanks for calling me directly. I''m listening — tell me everything."
(LISTEN — you invited the full story and signaled you will not interrupt.)

KAREN: "Monday night was terrible. Two operatories still had trash, the waiting room floor is sticky under the chairs, and honestly this is the second time. We have patients walking in at 8 AM seeing this."

YOU: [taking notes, letting her finish] "Anything else? I want to make sure I catch all of it."

KAREN: "That''s the main stuff. But we pay for this to be done right."

YOU: "Karen, I''m really sorry. That''s not the standard we promise you, and you''re right to be frustrated — patients should never see that."
(APOLOGIZE — sincere, no excuses, no "but.")

YOU: "Here''s what I''m going to do. I''m sending my lead cleaner back today before your lunch rush to re-clean the operatories and mop the waiting room properly. What would make this right for you beyond that?"
(FIX — fast, specific, and you asked what "right" looks like.)

KAREN: "Honestly, just make sure it doesn''t happen a third time."

YOU: "Fair. I''m going to personally check the site myself tonight after the clean, and I''ll call you tomorrow morning to confirm everything met your expectations. And I''m adding the waiting room floor to our detail rotation so it gets scrubbed, not just mopped."
(FIX continued — a system change, not just a one-time patch.)

WEDNESDAY 9 AM — THE FOLLOW-UP (do not skip this):
YOU: "Hi Karen, it''s [your name]. I checked the site last night myself — trash out, floors done right. Did everything look good this morning?"
KAREN: "Yes, much better. Thank you for handling it."
YOU: "I''m glad. And Karen — I''m really glad you called me instead of just living with it. If anything ever looks off, I want to hear about it."

TWO WEEKS LATER, after three perfect services:
YOU: "Karen, you''ve been with us six months now and I appreciate it. Would you be willing to leave us a Google review? It really helps. I can text you the link."
KAREN: "Of course."

WHAT MADE THIS WORK: you listened fully before speaking, apologized without excuses, fixed it the same day, changed the system (detail rotation), followed up personally, and only then — weeks later — asked for the review. Total cost: one re-clean visit and 10 minutes of follow-up. Result: a client who now trusts you more than before the complaint, and a 5-star review mentioning how you handle problems. That review will win you more business than any ad.',
null;

-- ============ STEP 4: GUIDED PRACTICE ============

with c as (select id as cid from public.training_courses where slug = 'customer-service'),
st as (select step_number, id as sid from public.training_steps where course_id = (select cid from c))
insert into public.training_lessons (course_id, step_id, sort_order, kind, title, body, media_svg)
select (select cid from c), (select sid from st where step_number = 4), 1, 'guided_practice', 'Practice: Rewrite the Bad Responses',
'Each reply below breaks a rule from the reading. Rewrite it, then check yourself.

1. CLIENT: "The lobby windows still have streaks."
   BAD: "We did clean them — maybe it''s the sun hitting them."
   YOUR REWRITE: ___________________________
   CHECK: A good rewrite apologizes and fixes without arguing: "I''m sorry about that — we''ll come back today and re-do the lobby glass properly." Never debate the client''s eyes.

2. CLIENT (text, 9 PM): "Are you coming tomorrow?"
   BAD: (no reply until noon the next day) "Yes."
   YOUR REWRITE: ___________________________
   CHECK: Reply within 2 business hours, even at night: "Yes, we''ll be there 9–11 AM as scheduled. Text me if anything changes." Silence breeds anxiety; a 20-second text prevents it.

3. CLIENT: "This is the second time the restrooms were missed."
   BAD: "I''m sorry, but my cleaner had a family emergency."
   YOUR REWRITE: ___________________________
   CHECK: "I''m sorry" + "but" = no apology. Good version: "I''m really sorry — that''s not acceptable. I''m re-cleaning the restrooms myself today, and I''m putting them on a supervisor check for the next two weeks." Excuses are for internal use only.

4. Write your own review ask for a happy client. Keep it under 40 words.
   YOUR SCRIPT: ___________________________
   CHECK: It should thank them, make the specific ask (Google review), say why it matters, and offer the link. Example: "Thanks so much, Mrs. Lee! Would you leave us a Google review? It really helps our small business. I''ll text you the link — takes 30 seconds."',
null
union all select (select cid from c), (select sid from st where step_number = 4), 2, 'guided_practice', 'Practice: Build a Client Profile Card',
'Great service is mostly great memory. For one real or imaginary client, fill out this profile card. In the real world, keep one per client and share it with anyone who covers the site.

CLIENT PROFILE CARD
- Client / site name: _______________
- Decision-maker + preferred contact (call/text/email): _______________
- Service days and arrival window: _______________
- Access: gate code, alarm code, key location, quirks: _______________
- The picky spots (their definition of clean): _______________
- Off-limits areas or rules: _______________
- Last compliment received: _______________
- Last issue and how it was resolved: _______________

CHECK YOURSELF: if your card has specifics ("alarm: 4410 then *, back door sticks — lift and pull", "Dr. Patel checks the baseboards"), it will save a future shift. If it says "nice office, clean everything," it is useless. Specifics are the product. Now imagine your best cleaner calls in sick and a substitute covers this site tonight — would your card let them succeed? If yes, you just built real customer service infrastructure.',
null;

-- ============ STEP 5: SIMULATOR ============

with c as (select id as cid from public.training_courses where slug = 'customer-service'),
st as (select step_number, id as sid from public.training_steps where course_id = (select cid from c))
insert into public.training_lessons (course_id, step_id, sort_order, kind, title, body, media_svg)
select (select cid from c), (select sid from st where step_number = 5), 1, 'simulator', 'Simulator: The Furious Client',
'THE SITUATION. Thursday, 4:40 PM. Tom, the facility manager of a 12,000 sq ft logistics office ($1,400/month, your biggest account), calls. He is furious. Tomorrow at 9 AM his regional VP is touring the building. Tonight''s clean hasn''t happened yet — but Tom says last night''s crew left the main restroom "disgusting," trash overflowing in the break room, and he sent you photos. He says: "If tomorrow looks like this, we''re done. I''m not kidding."

OPTION A: Defend and explain. "Tom, I''m sure the crew did the restrooms — sometimes the trash fills up during the day. We''ll do our best tonight."
What happens: Tom hears excuses. "Do our best" is not a plan. He spends the evening anxious, arrives at 8 AM to inspect, finds one thing wrong, and cancels. You lose $1,400/month — $16,800 a year — over a conversation.

OPTION B: LAFF, then over-deliver tonight. "Tom, you''re right to be upset — with your VP coming, this matters. I''m sorry. Here''s my plan: I''m going to the site myself tonight with my lead cleaner. We''ll deep-clean the restrooms, detail the break room, and I''ll walk the whole building with your checklist. I''ll text you photos by 9 PM, and I''ll call you at 8 AM tomorrow before the tour to confirm. If anything isn''t perfect, tell me and we fix it on the spot."
What happens: Tom exhales. You took ownership, gave a specific plan with times, and removed his risk. Tonight you deliver. Tomorrow the tour goes fine. Next week Tom tells another facility manager "my cleaning company saved me." The photos you texted become your standard for VIP-visit service.

OPTION C: Offer a discount to calm him down. "I''m sorry — I''ll take 20% off this month."
What happens: Tom is still anxious about tomorrow — money off does not clean a restroom. Worse, you just taught him that complaints earn discounts. Next quarter he complains again, expecting another cut. You bought nothing and discounted your value.

THE RIGHT MOVE: B. Listen fully, apologize without excuses, fix with a specific plan and deadlines, then follow up. Notice what B did NOT do: no blaming the crew to the client (handle that privately tomorrow), no discount bribe, no vague promises. The formula for a high-stakes save: specific plan + your personal presence + proof (photos) + morning confirmation.

YOUR TURN — Tom''s 8 AM confirmation call. Write your first 30 seconds. Good version: "Morning, Tom — I walked the building at 10 PM last night myself. Restrooms detailed, break room done, whole first floor mopped. Everything''s ready for the tour. Anything you want me to double-check before 9?" Compare yours: facts, proof, invitation. If yours opens with an apology rehash, tighten it — he already accepted the apology; now he needs confidence.',
null;

-- ============ STEP 6: WRITTEN EXAM (8 groups x 3 variants = 24) ============

with c as (select id as cid from public.training_courses where slug = 'customer-service')
insert into public.training_questions (course_id, kind, variant_group, question, choices, correct_index, explanation)
select (select cid from c), 'written', 'response-times', 'A client texts you at 3 PM with a question. When should you reply?', '["Within 2 business hours, even if just to say you are looking into it","By the end of the week","Only when you have the full answer","The next morning is fine"]'::jsonb, 0, 'Speed of acknowledgment beats completeness. "Looking into it, update by 5 PM" takes 20 seconds and kills client anxiety.'
union all select (select cid from c), 'written', 'response-times', 'You realize your crew will be 30 minutes late to a client. What do you do?', '["Say nothing — 30 minutes is minor","Text the client BEFORE the arrival window passes","Wait until you arrive and apologize then","Have the crew skip a task to make up time"]'::jsonb, 1, 'Clients forgive delays; they do not forgive surprises. Proactive communication before the window passes keeps trust intact.'
union all select (select cid from c), 'written', 'response-times', 'Why does "looking into it, will update you by 5 PM" work so well?', '["It solves the problem","It shows respect for their time and removes uncertainty","Clients like formal language","It buys you a whole day"]'::jsonb, 1, 'Anxiety comes from silence, not from the problem itself. A fast acknowledgment with a specific update time is professional service.'
union all select (select cid from c), 'written', 'first-impressions', 'What should you do within 24 hours after a new client''s first clean?', '["Send the invoice immediately","Call or text to ask how everything looked","Wait for them to contact you","Offer a discount on the next clean"]'::jsonb, 1, 'One message within 24 hours catches small issues before they become complaints and shows you care about their standards.'
union all select (select cid from c), 'written', 'first-impressions', 'Before the first service at a new site, you should:', '["Just start cleaning — the task list is obvious","Walk the site with the client and write down their exact definition of clean","Send your newest hire alone","Clean only the lobby to impress"]'::jsonb, 1, 'Every client''s definition of clean differs slightly. The walkthrough aligns expectations in writing before misunderstandings can form.'
union all select (select cid from c), 'written', 'first-impressions', 'Which matters more for keeping clients long-term?', '["One spectacular deep clean per quarter","Consistent solid quality on every single visit","The lowest price in town","Fancy uniforms"]'::jsonb, 1, 'Clients would rather have B+ every Tuesday than A+ one week and C the next. Inconsistency is what triggers "we need to talk" emails.'
union all select (select cid from c), 'written', 'complaint-steps', 'What does the first F in LAFF stand for?', '["Forget it and move on","Fix — ask what would make it right and fix it fast","File a report","Find who is to blame"]'::jsonb, 1, 'Fix: ask "What would make this right for you?" and fix within 24 hours when possible. Speed of the fix matters more than the size of the gesture.'
union all select (select cid from c), 'written', 'complaint-steps', 'A client is mid-complaint and you feel defensive. What do you do?', '["Interrupt to correct the facts","Keep listening, take notes, let them finish","Explain your side immediately","Transfer them to someone else"]'::jsonb, 1, 'Listen fully first. Most angry clients calm down significantly just from being heard. Correcting facts mid-vent escalates everything.'
union all select (select cid from c), 'written', 'complaint-steps', 'Why is "I''m sorry, but..." a bad apology?', '["It is too short","The word but erases the apology and turns it into an excuse","Clients prefer written apologies","It admits legal liability"]'::jsonb, 1, 'Everything before "but" gets erased. Apologize for their experience sincerely, with zero excuses attached.'
union all select (select cid from c), 'written', 'de-escalation', 'Which phrase best de-escalates an upset client?', '["Calm down, it is not a big deal","You are right to be frustrated — here is what I am going to do about it","That is not our policy","My employee says otherwise"]'::jsonb, 1, 'Validate their feeling, then pivot to action. "Calm down" inflames; validation plus a plan defuses.'
union all select (select cid from c), 'written', 'de-escalation', 'When a client raises their voice, you should:', '["Raise yours to show authority","Keep your voice slow and low — calm is contagious","Hang up immediately","Put them on hold for 10 minutes"]'::jsonb, 1, 'Slow and low wins. Matching their volume turns a complaint into a fight. Calm is contagious — and so is panic.'
union all select (select cid from c), 'written', 'de-escalation', 'A client blames your cleaner by name. You should:', '["Agree and promise to punish the cleaner","Never blame your employee to the client — handle staffing privately","Give the client the cleaner''s phone number","Fire the cleaner on the spot"]'::jsonb, 1, 'Throwing your team under the bus destroys trust on both sides. Own it as the company, fix it, and address staffing privately.'
union all select (select cid from c), 'written', 'service-recovery', 'After fixing a complaint, what builds the most loyalty?', '["A 20% discount","A small unexpected extra plus a next-day follow-up call","A formal letter","Nothing — the fix is enough"]'::jsonb, 1, 'The fix solves the problem; the extra plus the follow-up creates the story they tell others. Almost nobody follows up — so it is unforgettable.'
union all select (select cid from c), 'written', 'service-recovery', 'What should you log for every complaint?', '["Nothing — move on","Date, client, issue, what you did, and the follow-up date","Only the client''s name","Only complaints that cost money"]'::jsonb, 1, 'The log reveals patterns — three dusting complaints in a month means retrain dusting. Without the log, every complaint feels like isolated bad luck.'
union all select (select cid from c), 'written', 'service-recovery', 'A client whose complaint you fixed brilliantly is likely to:', '["Forget it ever happened","Become more loyal and refer others — sometimes more than a client with no complaints","Demand another discount","Leave a bad review anyway"]'::jsonb, 1, 'Service recovery done well creates stronger loyalty than a flawless record, because the client has seen how you handle problems.'
union all select (select cid from c), 'written', 'reviews', 'When is the best time to ask for a Google review?', '["With the monthly invoice","Right after a compliment or a successful service recovery","On the client''s birthday","During a complaint call"]'::jsonb, 1, 'Strike while the goodwill is fresh. Asking out of the blue feels pushy; asking after a win feels natural.'
union all select (select cid from c), 'written', 'reviews', 'How should you respond to a bad public review?', '["Argue the facts publicly","Briefly, graciously, and offline: apologize and invite them to call you","Ignore it completely","Offer a refund in the reply"]'::jsonb, 1, 'Future clients read your response more than the complaint. A gracious public reply shows how you handle problems; arguing shows the opposite.'
union all select (select cid from c), 'written', 'reviews', 'Which review practice should you avoid?', '["Texting the direct review link","Asking right after a compliment","Offering payment or gifts for reviews","Thanking reviewers"]'::jsonb, 2, 'Paying for reviews violates platform rules and cheapens genuine praise. Make it frictionless with a direct link instead.'
union all select (select cid from c), 'written', 'difficult-clients', 'A client repeatedly yells at your cleaners and demands free re-cleans. You have addressed it twice. What now?', '["Keep absorbing it — revenue is revenue","End the relationship professionally and finish out the term well","Yell back","Double their price as punishment"]'::jsonb, 1, 'Your team''s dignity comes first. Part ways politely, finish well — your reputation leaves with your last clean.'
union all select (select cid from c), 'written', 'difficult-clients', 'Most "difficult" clients are actually:', '["Impossible to please","Clients with unmet expectations — fix the expectations first","Trying to scam you","Not worth the effort"]'::jsonb, 1, 'Before labeling a client difficult, check whether expectations were ever clearly aligned. Most friction is misaligned expectations, not bad people.'
union all select (select cid from c), 'written', 'difficult-clients', 'If you must part ways with a client, you should:', '["Stop showing up immediately","Finish out the agreed term so they have time to find a new service","Tell their neighbors why","Keep their keys"]'::jsonb, 1, 'Professional to the end. Finishing well protects your reputation — the story they tell about you starts with your last clean.'
union all select (select cid from c), 'written', 'follow-up', 'What is the purpose of the follow-up call the day after a re-clean?', '["To sell them more services","To confirm the fix met expectations — this is where loyalty is built","To remind them to pay","It has no real purpose"]'::jsonb, 1, 'The follow-up proves you cared enough to check. It is the step almost nobody takes, which is exactly why it builds loyalty.'
union all select (select cid from c), 'written', 'follow-up', 'You fixed a problem Tuesday. When do you follow up?', '["Next month","Wednesday — the next day","Never, unless they complain again","At the annual review"]'::jsonb, 1, 'Next-day follow-up while it is fresh. Waiting weeks makes the follow-up feel like an afterthought instead of genuine care.'
union all select (select cid from c), 'written', 'follow-up', 'A client profile card should include:', '["Their favorite sports team","Access codes, picky spots, decision-maker, preferred contact method, last issue and resolution","Your profit margin on the account","Other clients'' names"]'::jsonb, 1, 'Specifics — gate codes, alarm quirks, the picky conference room — let any substitute cleaner succeed. "Clean everything" helps nobody.';

-- ============ STEP 7: SCENARIO EXAM (5 groups x 2 variants = 10) ============

with c as (select id as cid from public.training_courses where slug = 'customer-service')
insert into public.training_questions (course_id, kind, variant_group, question, choices, correct_index, explanation)
select (select cid from c), 'scenario', 'angry-call', 'A client calls, furious about a missed clean. They are mid-rant. What do you do first?', '["Explain what happened on your end","Listen fully, take notes, and let them finish before you speak","Offer a discount to calm them down","Ask them to email instead of calling"]'::jsonb, 1, 'Listen first, always. Interrupting with explanations or discounts before they feel heard escalates the situation.'
union all select (select cid from c), 'scenario', 'angry-call', 'During a complaint call the client says something factually wrong about the schedule. You should:', '["Correct them immediately","Let them finish, then address facts gently after apologizing and listening","Agree even though it is wrong","Hang up and call back later"]'::jsonb, 1, 'Facts can wait 60 seconds. Correcting someone mid-vent feels like arguing. Listen, apologize, then clarify kindly.'
union all select (select cid from c), 'scenario', 'recovery-plan', 'A restaurant client found a sticky floor before a health inspection. They are panicking. Your best move:', '["Tell them floors get sticky and it is normal","Go yourself today: deep-clean the floors, text photos when done, call tomorrow to confirm","Send a new cleaner with no instructions","Offer one free month"]'::jsonb, 1, 'High-stakes problems get your personal presence, a specific plan with times, proof via photos, and next-day confirmation.'
union all select (select cid from c), 'scenario', 'recovery-plan', 'You promised a re-clean "tomorrow" but your crew is fully booked. What now?', '["Hope the client forgets","Call the client before the deadline, explain honestly, and offer the earliest specific alternative","Send an untrained temp","Do a rushed 10-minute wipe and call it done"]'::jsonb, 1, 'A broken promise told proactively with a new specific plan preserves trust. A broken promise discovered by the client destroys it.'
union all select (select cid from c), 'scenario', 'review-moment', 'A client just texted: "Tonight''s clean was perfect, thank you!" What is your best next move?', '["Reply with a quick thanks and move on","Thank them warmly and ask for a Google review with a direct link","Ask what was perfect about it","Offer them a discount"]'::jsonb, 1, 'Compliments are review gold. Thank them, make the specific ask, explain it helps your small business, and text the link.'
union all select (select cid from c), 'scenario', 'review-moment', 'A client leaves a 2-star review saying "missed spots twice." Your public reply:', '["We cleaned everything — check your cameras","We are sorry about your experience. We would like to make it right — please call us at [number].","No comment","We fired the cleaner responsible"]'::jsonb, 1, 'Brief, gracious, and moved offline. Future clients judge your response more than the complaint. Never argue or share private details publicly.'
union all select (select cid from c), 'scenario', 'expectation-gap', 'A new client complains the cleaners "didn''t do the windows." Windows were never in the scope. What went wrong?', '["The cleaners were lazy","Expectations were never aligned in writing — no walkthrough defining the scope","The client is unreasonable","Windows should always be included free"]'::jsonb, 1, 'Most "difficult client" situations are expectation gaps. A written walkthrough defining scope prevents this entire category of complaint.'
union all select (select cid from c), 'scenario', 'expectation-gap', 'A client keeps adding tasks verbally ("oh, and the fridge too") and then complains they are not done. You should:', '["Do all of it free to keep them happy","Put the agreed scope in writing, confirm extras in writing with any price change, and have them approve","Refuse all extras","Ignore the verbal requests"]'::jsonb, 1, 'Verbal scope creep is a complaint factory. Written scope plus written confirmation of extras protects both sides.'
union all select (select cid from c), 'scenario', 'firing-client', 'A client has yelled at your cleaners three times. You addressed it twice. Tonight your lead cleaner says she will quit if she has to go back there. You:', '["Tell the cleaner to toughen up","End the client relationship professionally, finish the term well, and protect your team","Raise the client''s price to make it worthwhile","Send a different cleaner as a sacrifice"]'::jsonb, 1, 'No account is worth losing good people. Part ways politely, finish well, and your team learns you have their backs.'
union all select (select cid from c), 'scenario', 'firing-client', 'Which client behavior crosses the line from "difficult" to "must let go"?', '["Asking lots of questions","Repeated verbal abuse of your staff after warnings","Requesting a weekend clean","Wanting a lower price"]'::jsonb, 1, 'Questions, schedule requests, and price talks are normal business. Abuse of your people after clear warnings is the line.';

-- ============ STEP 8: PRACTICAL FINAL ============

with c as (select id as cid from public.training_courses where slug = 'customer-service')
insert into public.training_practicals (course_id, title, instructions, checklist)
select (select cid from c), 'Complaint Call Role-Play and Follow-Up',
'Put your service skills into practice. (1) Role-play a complaint call with a friend or family member: they play an upset client (missed trash two weeks running), you handle it using LAFF. (2) Write the follow-up message you would send the next day, plus a filled-in client profile card for one real site you service. Submit a short write-up of how the role-play went, your follow-up message, and the profile card as evidence (photos are fine).',
'["Role-played the full complaint call using LAFF in order: listened without interrupting","Apologized sincerely with no excuses and no buts","Asked what would make it right and proposed a specific fix with a timeline","Included a next-day follow-up in the plan","Wrote the actual follow-up message (under 60 words, warm and specific)","Filled in a client profile card with specific details (codes, picky spots, contact method)","Kept voice calm and professional throughout the role-play","Did not blame any employee to the client during the role-play","Write-up honestly notes one thing that went well and one thing to improve","All evidence submitted and legible"]'::jsonb;
