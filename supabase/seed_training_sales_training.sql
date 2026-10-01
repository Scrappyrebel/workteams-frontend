-- Seed: Selling Cleaning Services: From Lead to Signed Contract (sales-training)
-- Run AFTER 021_training_academy.sql in the WorkTeams Supabase project.
-- Idempotent: safe to re-run.

delete from public.training_questions where course_id = (select id from public.training_courses where slug = 'sales-training');
delete from public.training_lessons where course_id = (select id from public.training_courses where slug = 'sales-training');
delete from public.training_practicals where course_id = (select id from public.training_courses where slug = 'sales-training');
delete from public.training_steps where course_id = (select id from public.training_courses where slug = 'sales-training');
delete from public.training_courses where slug = 'sales-training';

insert into public.training_courses (slug, title, description, category, department, sort_order, estimated_hours, recert_months)
values ('sales-training', 'Selling Cleaning Services: From Lead to Signed Contract',
'The complete sales cycle: finding leads, follow-up, walkthroughs, measuring, bids with scope, and contracts.',
'business', 'Sales', 2, 6, 12);

with c as (select id as cid from public.training_courses where slug = 'sales-training')
insert into public.training_steps (course_id, step_number, step_key, title, description)
select cid, 1, 'reading', 'Reading: the sales cycle from lead to contract', 'Core knowledge: leads, qualifying, follow-up, walkthroughs, bids, contracts.' from c
union all select cid, 2, 'visual', 'Visual guide: pipeline and measuring', 'Diagrams: the sales pipeline and how to measure a building.' from c
union all select cid, 3, 'worked_example', 'Worked example: a 4,200 sq ft dental office', 'A complete deal worked start to finish.' from c
union all select cid, 4, 'guided_practice', 'Guided practice: scope and pricing drills', 'Practice writing scopes and pricing jobs, with answers.' from c
union all select cid, 5, 'simulator', 'Simulator: the price objection', 'Handle a tough objection in a safe role-play.' from c
union all select cid, 6, 'written_exam', 'Written exam', 'Randomized questions. 80% to pass.' from c
union all select cid, 7, 'scenario_exam', 'Scenario exam', 'What would you do? 80% to pass.' from c
union all select cid, 8, 'practical_final', 'Practical final: mock sales cycle', 'Run a full mock sales cycle against a checklist.' from c
union all select cid, 9, 'evidence', 'Evidence submission', 'Upload proof of your mock sales cycle.' from c
union all select cid, 10, 'approval', 'Manager approval', 'A manager reviews and approves.' from c
union all select cid, 11, 'recertification', 'Recertification', 'Stay current. Renew before expiry.' from c;

-- ============ STEP 1: READING (5 lessons) ============

with c as (select id as cid from public.training_courses where slug = 'sales-training'),
st as (select step_number, id as sid from public.training_steps where course_id = (select cid from c))
insert into public.training_lessons (course_id, step_id, sort_order, kind, title, body, media_svg)
select (select cid from c), (select sid from st where step_number = 1), 1, 'reading', 'Lesson 1: Finding leads — where commercial cleaning work comes from', 'Commercial cleaning is sold, not bought. Nobody wakes up and Googles ''I want a new cleaning company'' for fun — they do it because something went wrong with their current cleaner, they are opening a new location, or their business grew. Your job is to be visible and easy to contact at exactly those moments. Here are the lead sources that actually work for cleaning companies, in order of payoff.

1. REFERRALS FROM EXISTING CLIENTS. This is the number one source. A happy client telling another business owner ''call my cleaners, they are great'' closes faster than any ad. Ask for referrals directly: after 60 to 90 days of good service, say ''We grow by word of mouth. If you know any other offices that need reliable cleaning, I would appreciate an introduction.'' Offer a small thank-you, like one free month or a gift card, when a referral signs.

2. DRIVING COMMERCIAL AREAS. Get in your car and drive strip malls, office parks, medical plazas, and industrial areas. Look for signs of a bad cleaning job: overflowing trash cans outside, dirty windows, dusty lobbies you can see through the glass. Walk in during business hours, ask for the office manager, and leave a card and a one-page flyer. Ten stops a week beats zero stops a week.

3. GOOGLE BUSINESS PROFILE AND ONLINE LISTINGS. When someone searches ''commercial cleaning near me,'' Google shows local businesses first. Claim your free Google Business Profile, add photos of real work, list your services, and ask every happy client for a review. Also list the company on Yelp, Bing Places, and local directories. This is free and it compounds over time.

4. SOCIAL MEDIA. Join local Facebook community and business groups. Do not spam — answer questions, post before-and-after photos (with permission), and introduce the business once. LinkedIn works for larger offices: connect with office managers and property managers and send a short, polite message.

5. PROPERTY MANAGERS AND REALTORS. One property manager can hand you five buildings. Introduce yourself to every commercial property manager and real estate office in your area. They need reliable cleaners for common areas, move-outs, and new tenants. Bring cards. Follow up.

6. NETWORKING GROUPS. Your local chamber of commerce, BNI-style referral groups, and small-business meetups put you in rooms with decision makers. Go consistently. People refer business to people they know and trust, and trust takes repeated contact.

7. COLD CALLING AND DOOR KNOCKING. Calling or visiting businesses you have never met. It has the lowest hit rate but it costs nothing and it builds pipeline fast. Script: ''Hi, I''m [name] with [company]. We clean offices in this area. Who handles your cleaning?'' If they have someone: ''Great — if that ever changes, here is my card. Can I check back in a few months?'' If they do it themselves or complain: ''What would better look like?'' Then book a walkthrough.

8. WIN-BACKS. Old bids you lost, former clients, quotes that went quiet. Call them every 6 months. Circumstances change — their cheap cleaner got worse, or their new office manager wants a change. A simple ''Just checking in — how is your current cleaning working out?'' reopens doors.

TRACK EVERYTHING. Every lead goes into a simple list with: business name, contact name, phone/email, date contacted, what they said, and next follow-up date. A lead you do not follow up with is not a lead — it is a wasted conversation. Most cleaning deals close on the 3rd to 5th contact, not the first.', null
union all select (select cid from c), (select sid from st where step_number = 1), 2, 'reading', 'Lesson 2: Qualifying leads and following up like a professional', 'Not every lead deserves a walkthrough. A walkthrough costs you one to two hours plus drive time. Qualifying means checking, before you visit, whether this prospect is worth that time. Ask four questions — you can ask these on the first call:

1. DECISION MAKER: ''Who makes the final decision on the cleaning?'' If the person you are talking to cannot say yes, ask ''Can you introduce me to the person who does?'' Do not do a full walkthrough for someone who cannot sign.
2. NEED: ''What is prompting you to look at cleaning right now?'' Listen for pain: missed trash, dirty restrooms, unreliable crew. Pain means motivation. ''Just shopping around'' means low priority — still quote, but do not bend over backwards.
3. TIMELINE: ''When would you want service to start?'' ''Next week'' is hot. ''Sometime next year'' goes on a nurture list.
4. FIT: ''How many square feet is the space, and how many days a week do you need?'' A 400 sq ft office wanting daily service may not be profitable. A 20,000 sq ft building wanting once a month may not be realistic. Know your minimums.

If the answers are good, book the walkthrough on that same call: ''I have Tuesday at 10 or Thursday at 2 — which works better?'' Never end a call without a next step.

THE 5-TOUCH FOLLOW-UP RULE. Most salespeople give up after one or two tries. Do not be most salespeople. After first contact, follow up five times before you archive a lead:
- Touch 1 (day 1): the initial call or visit.
- Touch 2 (day 3): short email — ''Nice meeting you. Here is my card and a one-page overview.''
- Touch 3 (day 7): phone call — ''Did you get a chance to look at the info?''
- Touch 4 (day 14): value touch — send something useful, like ''3 questions to ask any cleaning company before you hire them.'' No hard sell.
- Touch 5 (day 21): the check-in call — ''Should I keep you on my list, or is the timing just not right?'' This question often forces a yes or no.

SPACE IT OUT, THEN NURTURE. After five touches with no answer, move them to a long-term list and check in every 90 days. People change jobs, cleaners get worse, buildings expand. The company that stays in touch wins the timing lottery.

FOLLOW-UP SCRIPTS THAT WORK. Keep every message short and about them, not you.
- Voicemail: ''Hi [name], it is [you] with [company]. You mentioned the restrooms have been an issue — I have an idea that might help. My number is [number]. I will also send a quick email.''
- Email subject lines: ''Quick question about [building name]'' or ''Following up from Tuesday''.
- The breakup email (touch 5 by email): ''I have tried to reach you a few times. I do not want to bother you — should I close your file?'' This gets replies because it gives them permission to say no, and ''no'' is better than silence.

LOG EVERY TOUCH. Date, method, what they said, next step. Memory lies; notes do not. When you call back in 90 days and say ''Last time you mentioned the lobby floors,'' they will be impressed you remembered — because you wrote it down.', null
union all select (select cid from c), (select sid from st where step_number = 1), 3, 'reading', 'Lesson 3: The walkthrough visit — inspecting room by room and measuring', 'The walkthrough is where deals are won. You are doing three things at once: gathering the facts you need to price the job, showing the prospect you are thorough and professional, and building trust. Here is how to run it.

BEFORE YOU ARRIVE. Confirm the day before by text or email. Arrive 5 minutes early. Dress clean and professional — you are selling cleaning, so you must look clean. Bring: a tape measure or laser measure, a notepad or your phone, and a simple walkthrough checklist.

FIRST IMPRESSIONS. Shake hands, smile, thank them for their time. Say: ''I will take about 20 to 30 minutes to look through the space, and I will ask questions as we go. There are no wrong answers — the more I understand, the more accurate my price will be.'' Then let THEM lead the tour. They will show you what bothers them first, which tells you what matters most.

WHAT TO INSPECT, ROOM BY ROOM. In every room, look at five things: floors, trash, restrooms (if present), dusting surfaces, and windows/glass.
- LOBBY/RECEPTION: first impression zone. Check floors for scuffs, glass doors for fingerprints, dust on the reception desk.
- OFFICES: count desks, note clutter level (heavy clutter slows cleaning), check trash can count, look at blinds and baseboards.
- RESTROOMS: the number one complaint area. Count fixtures (toilets, urinals, sinks). Check tile grout, mirrors, dispensers, odor. Restrooms take the most time per square foot — note them carefully.
- BREAK ROOMS/KITCHENS: check the microwave, sink, counters, floors (sticky?), trash volume.
- HALLWAYS AND COMMON AREAS: floor type and condition, high dusting needs.
- CONFERENCE ROOMS: tables, chairs, trash, whiteboards.
- WAREHOUSE/INDUSTRIAL (if any): floor type, dust level, restrooms for staff.

ASK QUESTIONS AS YOU GO. ''How often are you thinking — daily, a few times a week?'' ''What time do you want us here — after hours?'' ''What does your current cleaner miss?'' ''Any areas that are off-limits?'' ''Where is the water source and where can we store supplies?'' Write the answers down.

MEASURING THE BUILDING. You need the square footage of each area to price the job. Here is the method:
1. Measure each room: length times width, in feet. A room 20 feet long and 15 feet wide is 300 square feet. Measure inside wall to inside wall.
2. Odd shapes: split them into rectangles. An L-shaped room is two rectangles — measure each part and add them together.
3. Hallways: measure length times width like any room.
4. Round to the nearest foot. You do not need inches — ''about 300 sq ft'' is fine.
5. Add up all the areas for the building total. Do the math on site or right after, while it is fresh.

A laser measure ($30 to $50) is worth every penny — point, click, done. For very large open spaces, ask the prospect: ''Do you know the total square footage? It might be on your lease.'' Many do.

WHAT TO NOTE FOR THE BID. For each area: name, square footage, floor type, soil level (light/medium/heavy), and anything unusual (''heavy dust — manufacturing next door,'' ''two-stall restroom, grout badly stained''). Take photos of problem areas WITH PERMISSION — ''Mind if I snap a photo of this grout so I can show my team?'' Photos help you remember and help you price accurately.

CLOSE THE VISIT. ''Thank you — this was very helpful. I will have a detailed bid to you by [day]. It will include the full scope of what we will do and the price. What is the best email for it?'' Then leave on time. Do not linger.', null
union all select (select cid from c), (select sid from st where step_number = 1), 4, 'reading', 'Lesson 4: Building the bid in the app — scope, pricing modes, and details', 'After the walkthrough, you build the bid in the WorkTeams app. A bid has these fields — learn them, because this lesson teaches the exact workflow: client name, title, description, location, valid-until date, pricing mode, hours, hourly rate, square footage, rate per sqft, frequency, and job type.

STEP 1: CREATE THE WALKTHROUGH FIRST. In the app, go to Walkthroughs and create a new walkthrough: give it a clear name (''Smith Dental — Main St''), pick the location, then add each area you measured as its own line with its square footage (Reception 750 sq ft, Waiting 500 sq ft, and so on). Write your notes in the notes field — soil levels, problem areas, the prospect''s complaints. This walkthrough is your proof that you were thorough, and it links to the bid.

STEP 2: WRITE THE SCOPE OF WORK. The bid''s description field IS the scope of work — the most important field on the bid. The scope lists exactly what you will do, how often, and what is NOT included. Write it as a task list, grouped by area. Example:

''SCOPE OF WORK — 3x per week (Mon/Wed/Fri), after 6 PM.
ALL AREAS: Empty all trash cans and replace liners. Dust all horizontal surfaces including desks, sills, and ledges. Spot-clean glass doors and partitions. Vacuum all carpeted areas; dust-mop and damp-mop hard floors.
RESTROOMS (2): Clean and disinfect toilets, urinals, sinks, and counters. Clean mirrors. Refill soap, paper towels, and toilet paper. Mop floors with disinfectant. Empty trash.
BREAK ROOM: Clean counters and sink. Clean microwave inside and out. Mop floor. Empty trash.
NOT INCLUDED: Carpet shampooing, window washing above ground floor, consumable restocking beyond dispensers (quoted separately on request).''

Rules for scope writing: be specific (''disinfect'' not ''clean''), name frequencies, and always include a NOT INCLUDED section. Vague scopes cause arguments later. Specific scopes prevent them.

STEP 3: CHOOSE THE PRICING MODE. The app has three pricing modes. Pick the one that fits the job:
- LINE ITEMS: list each service with its own price (Restrooms $120/visit, Offices $150/visit, Floors $90/visit...). Best for: jobs with clearly separable tasks, or when the client wants to see the breakdown. Total = sum of line items.
- HOURLY: hours times rate. Best for: jobs where time is uncertain — deep cleans, move-outs, construction cleanup. Example: 8 hours x $45/hr = $360/visit. Always estimate hours honestly from the walkthrough.
- PER SQFT: square footage times rate. Best for: standard commercial cleaning where you know your cost per square foot. Example: 4,200 sq ft x $0.12 = $504/visit. Fast to quote and easy to explain.

Whichever mode you use, sanity-check against the others. If per-sqft says $500 but hourly says $300, one of your inputs is wrong — recheck your measurements and hour estimate.

STEP 4: FREQUENCY, JOB TYPE, VALID-UNTIL. Set frequency (1x/week, 3x/week, daily, etc.) — price is per visit, and the client needs to see the monthly total too (per-visit price x visits per month). Set the job type: commercial, residential, construction, or moveout. Set a valid-until date — 30 days is standard. ''This bid is valid for 30 days'' creates gentle urgency and protects you from cost changes.

STEP 5: LINK THE WALKTHROUGH TO THE BID. In the app, link the walkthrough you created to the bid. Now the bid tells a complete story: the measurements, your notes, the scope, and the price — all in one place. When the client asks ''how did you get this number?'' you can show them.

BEFORE YOU SEND: re-read the scope out loud. Check the math twice. Make sure the client name and location are right. A bid with a typo in the client''s name tells them you do not pay attention — fatal for a cleaning company.', null
union all select (select cid from c), (select sid from st where step_number = 1), 5, 'reading', 'Lesson 5: Presenting the bid, handling objections, and the contract', 'Sending the bid is not the end — presenting it is where you win or lose. Never just email a price with no context. Call or meet to walk through it.

PRESENTING THE BID. Start with the scope, not the price: ''Here is exactly what we will do, three times a week...'' Then the price: ''That comes to $504 per visit, which is $6,552 a month for 13 visits.'' Always give the per-visit AND monthly numbers. Then be quiet. Let them respond first.

HANDLING ''THAT''S TOO EXPENSIVE.'' Do not panic and do not discount immediately. Discounting on the spot trains them to push harder, and it tells them your first price was fake. Instead, ask questions:
- ''I understand. What were you hoping to be at?'' (Find their number.)
- ''Is it the monthly total, or the per-visit price that feels high?'' (Isolate the real issue.)
- ''If we adjusted the scope — say, restrooms daily but offices twice a week instead of three times — would that work?'' (Trade scope for price, never just cut price.)
- ''What is your current cleaner missing?'' (Remind them why they called you.)

Only offer a discount in exchange for something: a longer contract term, more visits per week, or a reduced scope. ''I can do $460 a visit if we go to a 12-month agreement'' protects your margin and gets commitment.

CLOSING. After answering questions, ask for the business directly: ''Does this scope cover everything you need? If so, I can have the contract over today and we can start next Monday.'' If they need time: ''What needs to happen on your end to decide?'' and ''When should I follow up?'' Never leave without a next step and a date.

THE CONTRACT. When they say yes, send a written service agreement before the first clean. Every cleaning contract needs these elements:
1. PARTIES AND TERM: who, the start date, and the length (month-to-month, 6 months, 12 months). Include how either side cancels — 30 days written notice is standard.
2. SCOPE: attach the exact scope of work from the bid. ''Per attached Scope of Work dated [date].'' This is the shield against ''I thought that was included.''
3. PRICE AND PAYMENT: the per-visit price, visits per month, monthly total, when invoices go out, when payment is due (''net 15'' or ''net 30''), and any late fee.
4. SCHEDULE: which days, what time window, and what happens on holidays.
5. SUPPLIES AND EQUIPMENT: who provides what. Standard: you bring equipment and chemicals; the client provides consumables (toilet paper, hand soap, trash liners) — or you provide them for a fee. Spell it out.
6. INSURANCE AND KEYS: note that you carry liability insurance, and document key/alarm code handling.
7. SIGNATURES AND DATES: both sides sign. No signature, no start date.

Have a local attorney review your contract template once — this is not legal advice, just good business. One review protects every deal you ever sign.

GETTING IT SIGNED. Send the contract the same day they say yes. Momentum dies fast. ''Here is the agreement reflecting everything we discussed — sign where marked and we will lock in your Monday start.'' If they stall, follow up in 48 hours.

HANDOFF TO OPERATIONS. The sale is not done at signature. Hand the job to operations cleanly: forward the signed contract, the scope, the walkthrough notes (areas, square footage, problem spots), the schedule, key/alarm info, and the client''s contact. The crew''s first clean should match exactly what you promised. Nothing kills a new account faster than the crew not knowing what was sold. Your reputation — and your referrals — depend on this handoff.', null;
