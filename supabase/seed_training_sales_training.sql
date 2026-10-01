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

-- ============ STEP 2: VISUALS (2 lessons with SVG) ============

with c as (select id as cid from public.training_courses where slug = 'sales-training'),
st as (select step_number, id as sid from public.training_steps where course_id = (select cid from c))
insert into public.training_lessons (course_id, step_id, sort_order, kind, title, body, media_svg)
select (select cid from c), (select sid from st where step_number = 2), 1, 'visual', 'The sales pipeline: from lead to signed contract', 'Every deal moves through the same five stages. Your job is to keep deals moving forward — a deal sitting in one stage too long is a deal dying. Typical conversion: out of 20 leads, about 10 qualify, 6 get walkthroughs, 4 get bids, and 2 sign. That means you need a full pipeline — if you only work 3 leads, you will starve.

Study the pipeline below. Notice the key action at each stage — that action is what pushes the deal forward.', '<svg width="460" height="330" xmlns="http://www.w3.org/2000/svg"><rect x="5" y="5" width="450" height="320" rx="12" fill="#f8fafc" stroke="#cbd5e1"/><text x="230" y="34" text-anchor="middle" font-size="17" font-weight="bold" fill="#0f172a">SALES PIPELINE</text><rect x="60" y="55" width="340" height="40" rx="8" fill="#dbeafe" stroke="#2563eb"/><text x="230" y="80" text-anchor="middle" font-size="14" font-weight="bold" fill="#1e3a8a">1. LEAD — action: make contact</text><polygon points="230,95 218,112 242,112" fill="#64748b"/><rect x="90" y="112" width="280" height="40" rx="8" fill="#e0f2fe" stroke="#0284c7"/><text x="230" y="137" text-anchor="middle" font-size="14" font-weight="bold" fill="#0c4a6e">2. QUALIFIED — action: book walkthrough</text><polygon points="230,152 218,169 242,169" fill="#64748b"/><rect x="120" y="169" width="220" height="40" rx="8" fill="#fef9c3" stroke="#ca8a04"/><text x="230" y="194" text-anchor="middle" font-size="14" font-weight="bold" fill="#713f12">3. WALKTHROUGH — action: send bid in 48 hrs</text><polygon points="230,209 218,226 242,226" fill="#64748b"/><rect x="150" y="226" width="160" height="40" rx="8" fill="#ffedd5" stroke="#ea580c"/><text x="230" y="251" text-anchor="middle" font-size="14" font-weight="bold" fill="#7c2d12">4. BID SENT — action: present &amp; close</text><polygon points="230,266 218,283 242,283" fill="#64748b"/><rect x="180" y="283" width="100" height="34" rx="8" fill="#dcfce7" stroke="#16a34a"/><text x="230" y="305" text-anchor="middle" font-size="14" font-weight="bold" fill="#14532d">5. SIGNED</text></svg>'
union all select (select cid from c), (select sid from st where step_number = 2), 2, 'visual', 'How to measure a room (and handle odd shapes)', 'Square footage is length times width, measured in feet, wall to wall. For odd shapes, split the space into rectangles, measure each, and add them up. A laser measure makes this fast: point at one wall, click, point at the other, click.

The diagram shows an L-shaped waiting area split into two rectangles: Rectangle A is 20 ft by 12 ft = 240 sq ft. Rectangle B is 10 ft by 8 ft = 80 sq ft. Total = 320 sq ft. Always round to the nearest foot — inches do not matter for pricing.', '<svg width="460" height="280" xmlns="http://www.w3.org/2000/svg"><rect x="5" y="5" width="450" height="270" rx="12" fill="#f8fafc" stroke="#cbd5e1"/><text x="230" y="32" text-anchor="middle" font-size="16" font-weight="bold" fill="#0f172a">MEASURING AN L-SHAPED ROOM</text><rect x="70" y="60" width="200" height="120" fill="#dbeafe" stroke="#2563eb" stroke-width="2"/><text x="170" y="115" text-anchor="middle" font-size="14" font-weight="bold" fill="#1e3a8a">A: 20 x 12</text><text x="170" y="138" text-anchor="middle" font-size="14" fill="#1e3a8a">= 240 sq ft</text><rect x="270" y="60" width="120" height="80" fill="#e0f2fe" stroke="#0284c7" stroke-width="2"/><text x="330" y="92" text-anchor="middle" font-size="14" font-weight="bold" fill="#0c4a6e">B: 10 x 8</text><text x="330" y="114" text-anchor="middle" font-size="14" fill="#0c4a6e">= 80 sq ft</text><line x1="70" y1="200" x2="270" y2="200" stroke="#64748b" stroke-width="1" stroke-dasharray="5,4"/><text x="60" y="204" font-size="12" fill="#475569">20 ft</text><line x1="410" y1="60" x2="410" y2="140" stroke="#64748b" stroke-width="1" stroke-dasharray="5,4"/><text x="416" y="105" font-size="12" fill="#475569">8 ft</text><rect x="70" y="225" width="320" height="34" rx="8" fill="#dcfce7" stroke="#16a34a"/><text x="230" y="247" text-anchor="middle" font-size="14" font-weight="bold" fill="#14532d">TOTAL: 240 + 80 = 320 sq ft</text></svg>';

-- ============ STEP 3: WORKED EXAMPLE ============

with c as (select id as cid from public.training_courses where slug = 'sales-training'),
st as (select step_number, id as sid from public.training_steps where course_id = (select cid from c))
insert into public.training_lessons (course_id, step_id, sort_order, kind, title, body, media_svg)
select (select cid from c), (select sid from st where step_number = 3), 1, 'worked_example', 'Full deal walkthrough: a 4,200 sq ft dental office', 'Follow one complete deal from first call to signed contract. This is exactly the workflow you will run in the app.

THE LEAD. Tuesday 9 AM: you are driving past a medical plaza and notice the windows of ''Bright Smile Dental'' are filthy and the small lobby looks dusty through the glass. You walk in, ask for the office manager, and meet Dana. She sighs: ''Our cleaner comes twice a week but the bathrooms are always gross and they never dust.'' Pain identified. You ask your qualifying questions: Dana makes the decision with the dentist-owner. They want to switch soon — ''within the month.'' You book a walkthrough for Thursday at 4 PM, after the last patient.

THE WALKTHROUGH. You arrive early with your laser measure. Dana walks you through. You measure and note each area:
- Reception: 750 sq ft, hard floor, medium soil, scuffed
- Waiting room: 500 sq ft, carpet, light soil
- Operatories (4): 300 sq ft each = 1,200 sq ft, hard floor, need disinfection-level cleaning
- Hallway: 350 sq ft, hard floor
- Restrooms (2): 175 sq ft each = 350 sq ft, tile, heavy soil — grout stained, fixtures dull
- Break room: 250 sq ft, sticky floor noted
- Sterilization room: 200 sq ft, must stay organized, wipe-down only per staff instruction
- Private offices (2): 225 sq ft each = 450 sq ft
- Storage: 150 sq ft
BUILDING TOTAL: 750 + 500 + 1,200 + 350 + 350 + 250 + 200 + 450 + 150 = 4,200 sq ft.

You ask: ''How often?'' Dana says 3x per week after 6 PM. ''What does the current cleaner miss?'' Restrooms and dusting — you write that down word for word. You photograph the grout with permission. You close: ''I will have a detailed bid to you by Monday. Best email?''

IN THE APP. Thursday evening you create the walkthrough: name ''Bright Smile Dental — Medical Plaza'', location set, nine areas each with its square footage, notes including ''restrooms heavy soil — grout stained'' and ''operatories need disinfectant-level cleaning.''

Then you build the bid:
- Client name: Bright Smile Dental (Dana, office manager)
- Title: ''Dental office cleaning — 3x per week''
- Description (the scope): ''SCOPE OF WORK — 3x per week (Mon/Wed/Fri) after 6 PM. ALL AREAS: Empty trash, replace liners. Dust all horizontal surfaces. Spot-clean glass. Vacuum carpets; dust-mop and damp-mop hard floors. OPERATORIES: Clean and disinfect all surfaces with EPA-registered disinfectant; follow 10-minute dwell time. RESTROOMS (2): Clean and disinfect toilets, sinks, counters; clean mirrors; refill dispensers; mop with disinfectant; empty trash. BREAK ROOM: counters, sink, microwave, mop, trash. NOT INCLUDED: carpet extraction, exterior windows, consumable supply (client provides).''
- Pricing mode: you run all three to cross-check.
  PER SQFT: 4,200 x $0.13 (medical rate — higher than standard office because of disinfection) = $546/visit.
  HOURLY: you estimate 7 crew-hours per visit x $45/hr = $315... too low versus sqft? Recheck: disinfection dwell time and two bad restrooms — realistic is 9 hours x $45 = $405/visit. Still below $546. Your sqft rate for medical may be rich, OR your hour estimate is light. You settle at $495/visit — between the two, and justified by the disinfection work.
  LINE ITEMS (sanity check): operatories $160 + restrooms $110 + all other areas $225 = $495/visit. All three methods agree.
- Frequency: 3x per week. Monthly total: $495 x 13 visits = $6,435/month.
- Job type: commercial. Valid-until: 30 days from Monday.
You link the walkthrough to the bid.

PRESENTING. Monday you call Dana and walk through the scope first, then the price: ''$495 a visit, $6,435 a month.'' Dana: ''That is more than we pay now.'' You: ''What are you paying now, and what is it missing?'' She admits the restrooms. You: ''That is exactly what this scope fixes — disinfectant-level restroom cleaning every visit, plus the operatories. If budget is tight, we could do offices twice a week and keep restrooms at three times — that would be $420 a visit. But the restrooms are the complaint, so I would not cut those.'' Dana thinks overnight, calls Tuesday: ''Let us do it.''

THE CONTRACT. You send the agreement Tuesday afternoon: parties and 12-month term with 30-day cancellation notice, scope attached (the bid description), $495/visit, 13 visits/month, $6,435/month, invoiced monthly net 15, Mon/Wed/Fri after 6 PM, you provide equipment and chemicals / client provides consumables, liability insurance noted, key and alarm code documented, both sign. Dana signs Wednesday. Start date: next Monday.

HANDOFF. You forward the signed contract, scope, walkthrough notes (''restrooms heavy soil — hit grout hard first visit''), schedule, and alarm code to your operations lead. The crew''s first clean matches the scope exactly. Dana texts after week one: ''Bathrooms look amazing.'' That text becomes your next referral ask.', null;

-- ============ STEP 4: GUIDED PRACTICE ============

with c as (select id as cid from public.training_courses where slug = 'sales-training'),
st as (select step_number, id as sid from public.training_steps where course_id = (select cid from c))
insert into public.training_lessons (course_id, step_id, sort_order, kind, title, body, media_svg)
select (select cid from c), (select sid from st where step_number = 4), 1, 'guided_practice', 'Practice 1: write a scope of work', 'EXERCISE. A 2,500 sq ft insurance office wants cleaning 2x per week (Tue/Thu) after 5 PM. Areas: lobby 400 sq ft, open office 1,200 sq ft (carpet), 2 private offices 150 sq ft each, 1 restroom 200 sq ft (2 toilets, 2 sinks), break room 200 sq ft, hallway 200 sq ft. Write the scope of work paragraph you would put in the bid''s description field. Include: frequency and days, what happens in ALL areas, restroom specifics, break room specifics, and a NOT INCLUDED section. Write it before looking at the answer.

CHECK YOURSELF — a strong answer looks like this:
''SCOPE OF WORK — 2x per week (Tue/Thu) after 5 PM. ALL AREAS: Empty all trash cans, replace liners. Dust desks, sills, and ledges. Spot-clean interior glass. Vacuum all carpeted areas; dust-mop and damp-mop hard floors. RESTROOM: Clean and disinfect toilets, sinks, and counter. Clean mirror. Refill soap, paper towels, toilet paper. Mop floor with disinfectant. Empty trash. BREAK ROOM: Wipe counters and sink, clean microwave, mop floor, empty trash. NOT INCLUDED: carpet shampooing, exterior windows, wall washing, consumable restocking (quoted separately).''

Did yours name the days? List restroom fixtures work specifically? Include NOT INCLUDED? If yes to all three, you wrote a pro-level scope.'
union all select (select cid from c), (select sid from st where step_number = 4), 2, 'guided_practice', 'Practice 2: price the same job three ways', 'EXERCISE. Use the same 2,500 sq ft insurance office (2x/week). Price it using all three pricing modes, then cross-check. Do the math before reading the answers.

PER SQFT: A standard office rate is $0.10 to $0.15 per sq ft. Pick $0.12. Math: 2,500 x 0.12 = $300/visit.
HOURLY: Estimate crew-hours. A 2,500 sq ft office at this soil level takes about 3.5 to 4 crew-hours. Use 4 hours x $45/hr = $180/visit. Hmm — that is well below $300. Recheck: one restroom, one break room, 2x/week light soil... 4 hours might be generous; but the sqft number might also be rich for a simple office. Split the difference and sanity-check with line items.
LINE ITEMS: restroom $45 + break room $35 + open office $90 + lobby/hall $40 + private offices $40 = $250/visit.

CHECK YOURSELF: The three methods gave $300, $180, and $250. They should roughly agree — when they do not, an input is off. Here the hourly estimate was probably light on detail work (dusting 1,200 sq ft of open office takes real time). A defensible final price: $250 to $275 per visit. Monthly (2x/week = ~8.7 visits, use 8 or 9): $275 x 9 = $2,475/month. Present as ''$275 a visit, about $2,475 a month.'' The lesson: run at least two modes every time. If they disagree by more than 25%, find out why before you send the bid.', null;

-- ============ STEP 5: SIMULATOR ============

with c as (select id as cid from public.training_courses where slug = 'sales-training'),
st as (select step_number, id as sid from public.training_steps where course_id = (select cid from c))
insert into public.training_lessons (course_id, step_id, sort_order, kind, title, body, media_svg)
select (select cid from c), (select sid from st where step_number = 5), 1, 'simulator', 'Simulator: ''Your price is 30% higher than our current cleaner''', 'ROLE-PLAY. You just presented a $495/visit bid to Dana. She says: ''Honestly, that is about 30% higher than what we pay our current cleaner.'' The room is quiet. Three responses run through your head. Read each path and its consequence, then choose.

PATH A — PANIC DISCOUNT. You say: ''Well... I could probably do $380 if that helps.'' Consequence: Dana now knows your first price was padded. She wonders what else is padded. Even if she signs, she will push on every future increase, and your margin is gone on a job with real disinfection work. You also just told her your price was not real. Trust drops. Most ''discount to win'' accounts become your worst accounts — they demand the most and pay the least.

PATH B — GET DEFENSIVE. You say: ''Well, you get what you pay for. Our quality is better.'' Consequence: Dana hears ''you are cheap and wrong.'' Nobody buys from someone who insults their current decision. The conversation turns adversarial. She stops telling you what matters, and you lose the information you need to win.

PATH C — ASK AND TRADE. You say: ''I understand — can I ask what you are paying now, and is the current service covering everything in this scope?'' Dana admits the restrooms are the problem. You say: ''That makes sense. This bid is built around fixing exactly that — disinfectant-level restroom cleaning every visit, plus the operatories, which is why it is higher than a basic trash-and-dash service. If budget is the issue, we have options: I can keep the restrooms at 3x a week and drop the offices to 2x — that brings it to $420 a visit. Or we lock a 12-month term and I can sharpen the per-visit price a bit. Which direction feels better?'' Consequence: you never apologized for your price. You tied the price to the scope she asked for. You offered choices instead of a discount — and both choices protect your margin.

THE RIGHT MOVE IS PATH C, every time. The formula: acknowledge, question, tie price to scope, trade — never just cut. ''I understand'' (acknowledge). ''What are you paying, and what is missing?'' (question). ''This price exists because of X in the scope'' (tie). ''I can adjust scope, frequency, or term'' (trade). Practice saying it out loud three times right now. In the real meeting, it needs to come out smooth.', null;

-- ============ STEP 6: WRITTEN EXAM (8 groups x 3 variants) ============

with c as (select id as cid from public.training_courses where slug = 'sales-training')
insert into public.training_questions (course_id, kind, variant_group, question, choices, correct_index, explanation)
select (select cid from c), 'written', 'lead-sources', 'Which lead source typically closes the fastest for a cleaning company?', '["Cold calling strangers","Referrals from happy existing clients","Billboard advertising","Buying an email list"]'::jsonb, 1, 'A referral arrives with trust already built — the existing client vouched for you — so it closes faster than any cold outreach.'
union all select (select cid from c), 'written', 'lead-sources', 'You drive past a strip mall and see overflowing trash and dirty windows at a real estate office. What is the best move?', '["Ignore it — they already have a cleaner","Walk in during business hours, ask for the office manager, leave a card and flyer","Mail them a 10-page proposal","Call and demand to speak to the owner immediately"]'::jsonb, 1, 'Visible signs of poor cleaning are buying signals. A brief in-person visit with a card and flyer is the highest-payoff move.'
union all select (select cid from c), 'written', 'lead-sources', 'Why should you claim a free Google Business Profile?', '["It is required by law","When people search ''commercial cleaning near me,'' Google shows local businesses first — reviews compound over time","It automatically sends bids","It replaces your website"]'::jsonb, 1, 'Local search is where buyers look. A claimed profile with real photos and reviews captures that demand for free.'
union all select (select cid from c), 'written', 'qualifying', 'On a first call, which question identifies the decision maker?', '["How many square feet is the space?","Who makes the final decision on the cleaning?","What is your budget?","When did you open?"]'::jsonb, 1, 'Never do a full walkthrough for someone who cannot say yes. Find the decision maker first.'
union all select (select cid from c), 'written', 'qualifying', 'A prospect says they are ''just shopping around'' with no timeline. How should you treat this lead?', '["Rush a walkthrough tomorrow","Quote it but keep effort low; add them to a nurture list","Refuse to quote","Offer 50% off to create urgency"]'::jsonb, 1, 'No pain and no timeline means low priority. Still quote — circumstances change — but invest your walkthrough hours in hot leads.'
union all select (select cid from c), 'written', 'qualifying', 'Which of these is the strongest buying signal?', '["They ask for your brochure","They complain their current cleaner misses the restrooms every week","They have a nice lobby","They have been in business 20 years"]'::jsonb, 1, 'Specific pain with the current cleaner means motivation to switch. Pain is the best predictor of a closed deal.'
union all select (select cid from c), 'written', 'followup', 'According to the 5-touch rule, when is Touch 4 and what is it?', '["Day 3 — phone call","Day 14 — a value touch, like useful tips, with no hard sell","Day 21 — the breakup email","Day 1 — the first visit"]'::jsonb, 1, 'Touch 4 on day 14 is a value touch — something useful, no hard sell. It keeps you welcome while staying visible.'
union all select (select cid from c), 'written', 'followup', 'A lead has gone quiet after 4 touches. What is the best Touch 5?', '["Send a 50% off coupon","Call and ask: ''Should I keep you on my list, or is the timing not right?''","Stop calling forever","Show up unannounced at their office"]'::jsonb, 1, 'The direct ''should I close your file'' question forces a yes or no. A clear no beats endless silence.'
union all select (select cid from c), 'written', 'followup', 'Why must you log every follow-up touch with notes?', '["It is required for taxes","Memory lies; notes let you reference their exact words months later","The app forces you to","Clients ask to see your notes"]'::jsonb, 1, 'Calling back in 90 days and referencing their exact complaint (''the lobby floors'') wins trust — and you only remember it if you wrote it down.'
union all select (select cid from c), 'written', 'walkthrough', 'What should you bring to every walkthrough?', '["A vacuum and mop","A tape measure or laser measure, a notepad or phone, and a walkthrough checklist","Cleaning chemicals to demo","A contract already filled out"]'::jsonb, 1, 'Measure, notes, checklist. You are there to inspect and gather facts — not to clean or to pressure-sign.'
union all select (select cid from c), 'written', 'walkthrough', 'In every room, which five things should you check?', '["Walls, ceiling, doors, windows, lights","Floors, trash, restrooms if present, dusting surfaces, and windows/glass","Only the floors","Only what the prospect points at"]'::jsonb, 1, 'The five-point check (floors, trash, restrooms, dusting surfaces, glass) keeps every walkthrough consistent and complete.'
union all select (select cid from c), 'written', 'walkthrough', 'Why do restrooms deserve extra attention during a walkthrough?', '["They are the easiest to clean","They are the number one complaint area and take the most time per square foot","Clients never use them","They photograph well"]'::jsonb, 1, 'Restrooms drive complaints and labor. Count fixtures, check grout and dispensers, note odor — price them carefully.'
union all select (select cid from c), 'written', 'measuring', 'A room is 20 feet long and 15 feet wide. What is its square footage?', '["35 sq ft","300 sq ft","175 sq ft","600 sq ft"]'::jsonb, 0, 'Length times width: 20 x 15 = 300 square feet.'
union all select (select cid from c), 'written', 'measuring', 'How do you measure an L-shaped room?', '["Guess the total","Measure the longest wall only","Split it into rectangles, measure each (length x width), and add them together","Ask the client to guess"]'::jsonb, 2, 'Split odd shapes into rectangles, compute each area, and add. It is simple and accurate.'
union all select (select cid from c), 'written', 'measuring', 'How precise should your measurements be?', '["To the nearest inch","To the nearest foot — ''about 300 sq ft'' is fine","Exact to the centimeter","Precision does not matter at all"]'::jsonb, 1, 'Round to the nearest foot. Inches do not change the price; consistent, honest measurements do.'
union all select (select cid from c), 'written', 'pricing-modes', 'The app has three pricing modes. When is HOURLY the best choice?', '["For standard offices","When the time needed is uncertain — deep cleans, move-outs, construction cleanup","Never","For all residential jobs"]'::jsonb, 1, 'Hourly (hours x rate) fits unpredictable work. Per-sqft fits standard recurring cleaning you can estimate confidently.'
union all select (select cid from c), 'written', 'pricing-modes', 'A job is 4,200 sq ft at $0.13 per sq ft. What is the per-visit price?', '["$420","$546","$650","$380"]'::jsonb, 1, '4,200 x 0.13 = $546 per visit. Always show per-visit AND monthly when presenting.'
union all select (select cid from c), 'written', 'pricing-modes', 'Your three pricing modes give $500, $300, and $480 for the same job. What should you do?', '["Use the highest — more profit","Use the lowest to win the bid","Stop — one of your inputs is wrong. Recheck measurements and hour estimates before sending","Average them without thinking"]'::jsonb, 2, 'The modes should roughly agree. A big spread means bad inputs — find the error before the client sees the bid.'
union all select (select cid from c), 'written', 'scope', 'What is the most important field on the bid, and why?', '["The title — it looks professional","The description field, because it IS the scope of work: exactly what you will do, how often, and what is excluded","The valid-until date","The client name"]'::jsonb, 1, 'The scope in the description field prevents ''I thought that was included'' arguments. Specific scopes prevent disputes.'
union all select (select cid from c), 'written', 'scope', 'Why should every scope include a NOT INCLUDED section?', '["To make the bid longer","To prevent arguments about work the client assumed was included","It is legally required","To upsell later"]'::jsonb, 1, 'Naming exclusions (carpet shampooing, exterior windows) upfront prevents the most common client conflict.'
union all select (select cid from c), 'written', 'scope', 'Which scope line is written correctly?', '["We will clean the office","Clean and disinfect toilets, sinks, and counters; refill dispensers; mop with disinfectant — 3x/week","Make it look nice","Deep clean everything"]'::jsonb, 1, 'Specific verbs, named tasks, and frequency. Vague scopes cause arguments; specific scopes prevent them.'
union all select (select cid from c), 'written', 'closing-contracts', 'When presenting the bid, what should you lead with?', '["The price — get it over with","The scope first, then the price, then be quiet and let them respond","A discount offer","Your company history"]'::jsonb, 1, 'Scope first builds value, then price lands in context. Then silence — let them respond first.'
union all select (select cid from c), 'written', 'closing-contracts', 'A fair contract term for cancellation notice is:', '["No cancellation allowed ever","30 days written notice for either side","Verbal notice anytime","1 year no matter what"]'::jsonb, 1, '30 days written notice is the industry standard — fair to both sides and easy to explain.'
union all select (select cid from c), 'written', 'closing-contracts', 'After the contract is signed, what is the critical final step?', '["Celebrate and move on","Hand off to operations: signed contract, scope, walkthrough notes, schedule, keys/alarm info, client contact","File it and forget it","Raise the price immediately"]'::jsonb, 1, 'The crew''s first clean must match what was sold. A clean handoff protects the account and your referral stream.';

-- ============ STEP 7: SCENARIO EXAM (5 groups x 2 variants) ============

with c as (select id as cid from public.training_courses where slug = 'sales-training')
insert into public.training_questions (course_id, kind, variant_group, question, choices, correct_index, explanation)
select (select cid from c), 'scenario', 'price-objection', 'You present a $495/visit bid. The prospect says: ''That is 30% higher than our current cleaner.'' What is your best response?', '["Offer $350 on the spot to save the deal","Say ''you get what you pay for'' and defend your quality","Acknowledge, ask what they pay and what is missing, tie your price to the scope, and offer a trade (scope, frequency, or term) — never just cut","Tell them the price is final and walk out"]'::jsonb, 2, 'Path C: acknowledge, question, tie price to scope, trade — never just cut. Discounting on the spot destroys trust and margin.'
union all select (select cid from c), 'scenario', 'price-objection', 'The prospect says: ''Your competitor quoted $380 for the same building.'' You believe your scope is stronger. What do you do?', '["Match $380 immediately","Ask what is in their scope versus yours, then walk through the differences line by line","Say the competitor must be cutting corners","Refuse to discuss it"]'::jsonb, 1, 'Compare scopes, not prices. If your scope includes disinfection-level restroom cleaning and theirs does not, the prices are not for the same job.'
union all select (select cid from c), 'scenario', 'walkthrough-surprise', 'Mid-walkthrough you find a restroom with badly stained grout and dull fixtures the prospect did not mention. What do you do?', '["Say nothing — price it as a normal restroom","Note it, photograph it with permission, and account for extra time in your bid","Tell the prospect their building is disgusting","Skip that restroom in the scope"]'::jsonb, 1, 'Document it, photo with permission, price the reality. Surprises you ignore become losses you eat.'
union all select (select cid from c), 'scenario', 'walkthrough-surprise', 'The prospect says ''just give me a ballpark over the phone, no need to visit.'' What is the best response?', '["Give a low ballpark to get the job","Explain that accurate pricing needs measurements: ''I can give you a rough range, but a 20-minute walkthrough gets you an exact price with no surprises''","Refuse to talk to them","Quote double to be safe"]'::jsonb, 1, 'Phone ballparks become anchors you cannot escape. Sell the walkthrough as the path to an exact, no-surprise price.'
union all select (select cid from c), 'scenario', 'followup-dilemma', 'You sent a bid 10 days ago. Two follow-ups, no reply. What now?', '["Give up — they are not interested","Send a 20% discount","One more touch with a clear question: ''Should I keep this bid open, or has the timing changed?''","Call every day until they answer"]'::jsonb, 2, 'A direct, polite ''should I close your file'' question forces a decision. Silence usually means busy, not no.'
union all select (select cid from c), 'scenario', 'followup-dilemma', 'A prospect loved the walkthrough but says ''I need to think about it.'' How do you leave it?', '["Say ''take your time'' and leave","Ask: ''What needs to happen on your end to decide, and when should I follow up?'' — then schedule that follow-up","Offer a discount for deciding today","Ask them to decide right now"]'::jsonb, 1, 'Never leave without a next step and a date. ''Think about it'' with no follow-up date is a polite no.'
union all select (select cid from c), 'scenario', 'scope-dispute', 'Two months in, the client says: ''I thought window cleaning was included.'' Your scope''s NOT INCLUDED section lists exterior windows. What do you do?', '["Do the windows free to keep them happy","Point to the signed scope calmly, explain it was excluded, and offer to add it for a quoted price","Argue about it","Blame the crew"]'::jsonb, 1, 'This is exactly why the scope exists. Reference it kindly, offer to add the service at a fair price — and you have just upsold.'
union all select (select cid from c), 'scenario', 'scope-dispute', 'A client asks mid-contract for extra work ''since you are already here.'' What is the professional response?', '["Always do it free","Check whether it is in the scope. If not: ''Happy to add that — it would be $X per visit. Want me to update the agreement?''","Refuse outright","Do it free once, then complain"]'::jsonb, 1, 'Scope creep kills margins. Be warm, be clear, price the extra — clients respect boundaries tied to fairness.'
union all select (select cid from c), 'scenario', 'contract-hesitation', 'The prospect likes the bid but hesitates to sign a 12-month term. What is your best move?', '["Insist on 12 months or walk away","Offer month-to-month at a slightly higher per-visit price, with the 12-month rate as the reward for commitment","Drop the contract entirely","Offer 12 months at the month-to-month price"]'::jsonb, 1, 'Trade term for price: commitment earns the better rate. Both options protect you; the client chooses.'
union all select (select cid from c), 'scenario', 'contract-hesitation', 'The prospect asks you to start cleaning before signing ''to try it out.'' What do you do?', '["Start right away — show them what you can do","Politely decline: ''Our insurance and scheduling need a signed agreement first — I can have it ready today and we can start Monday''","Start without telling the office","Ask for cash upfront instead"]'::jsonb, 1, 'No signature, no start date. A trial without an agreement means no scope, no price protection, and no recourse. Hold the line kindly.';

-- ============ STEP 8: PRACTICAL FINAL ============

with c as (select id as cid from public.training_courses where slug = 'sales-training')
insert into public.training_practicals (course_id, title, instructions, checklist)
select (select cid from c), 'Practical: complete a mock sales cycle',
'Run the entire sales cycle on a practice business (a friend''s office, a family business, or a real prospect with their permission). Do every step for real: find the lead, qualify, walk the space, measure, enter the walkthrough in the app, build the bid with a written scope, present it, and draft the contract terms. Submit screenshots of your walkthrough and bid from the app plus a photo of your handwritten measurements as evidence.',
'["Identified a practice business and recorded how the lead was found","Qualified the lead: decision maker, need, timeline, and fit confirmed","Completed a room-by-room walkthrough inspection (floors, trash, restrooms, dusting, glass)","Measured every area (length x width) and calculated total square footage","Created the walkthrough in the app with name, location, areas + square footage, and notes","Wrote a complete scope of work in the bid description, including a NOT INCLUDED section","Priced the job using at least two pricing modes and cross-checked the math","Set frequency, job type, and a valid-until date on the bid","Linked the walkthrough to the bid in the app","Presented the bid scope-first and handled at least one objection using ask-and-trade","Drafted contract terms covering scope, price, schedule, term, cancellation, and payment","Submitted evidence: app screenshots of walkthrough + bid and a photo of measurements"]'::jsonb;
