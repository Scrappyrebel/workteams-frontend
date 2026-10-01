-- Seed: Accounting Basics for Cleaning Companies (accounting-training)
-- Run AFTER 021_training_academy.sql in the WorkTeams Supabase project.
-- Idempotent: safe to re-run.
-- NOTE: general business education, not tax or legal advice.

delete from public.training_questions where course_id = (select id from public.training_courses where slug = 'accounting-training');
delete from public.training_lessons where course_id = (select id from public.training_courses where slug = 'accounting-training');
delete from public.training_practicals where course_id = (select id from public.training_courses where slug = 'accounting-training');
delete from public.training_steps where course_id = (select id from public.training_courses where slug = 'accounting-training');
delete from public.training_courses where slug = 'accounting-training';

insert into public.training_courses (slug, title, description, category, department, sort_order, estimated_hours, recert_months)
values ('accounting-training', 'Accounting Basics for Cleaning Companies', 'The money side: job costing, pricing for profit, invoices, payroll basics, and reading a P&L.', 'business', 'Accounting & Finance', 4, 4, 12);

with c as (select id as cid from public.training_courses where slug = 'accounting-training')
insert into public.training_steps (course_id, step_number, step_key, title, description)
select cid, 1, 'reading', 'Reading: money fundamentals', 'Core knowledge: job costing, pricing, invoicing, payroll, P&L.' from c
union all select cid, 2, 'visual', 'Visual guide: where the money goes', 'Diagrams that reinforce the reading.' from c
union all select cid, 3, 'worked_example', 'Worked example: pricing a 5,000 sq ft office', 'Full bid math start to finish.' from c
union all select cid, 4, 'guided_practice', 'Guided practice', 'Practice the pricing formulas yourself.' from c
union all select cid, 5, 'simulator', 'Simulator: the discount demand', 'A client wants 20% off. Decide safely.' from c
union all select cid, 6, 'written_exam', 'Written exam', 'Randomized questions. 80% to pass.' from c
union all select cid, 7, 'scenario_exam', 'Scenario exam', 'What would you do? 80% to pass.' from c
union all select cid, 8, 'practical_final', 'Practical final', 'Cost out a real job and build a quote.' from c
union all select cid, 9, 'evidence', 'Evidence submission', 'Upload proof of your work.' from c
union all select cid, 10, 'approval', 'Manager approval', 'A manager reviews and approves.' from c
union all select cid, 11, 'recertification', 'Recertification', 'Stay current. Renew before expiry.' from c;

-- ============ STEP 1: READING ============

with c as (select id as cid from public.training_courses where slug = 'accounting-training'),
st as (select step_number, id as sid from public.training_steps where course_id = (select cid from c))
insert into public.training_lessons (course_id, step_id, sort_order, kind, title, body, media_svg)
select (select cid from c), (select sid from st where step_number = 1), 1, 'reading', 'Job Costing: Know What Every Job Really Costs',
'Most cleaning companies that fail do not fail because they clean badly. They fail because they do not know what each job actually costs — so they price too low, work hard, and slowly go broke. Job costing fixes that. It answers one question: for this specific job, what do we spend?

Every job has three cost buckets:

1. DIRECT LABOR. Wages for the hours on that job, PLUS payroll taxes and workers'' comp — the "labor burden." A $15/hour wage really costs about $18 to $19/hour once you add roughly 10% payroll taxes and workers'' comp (rates vary by state — check yours). Never cost a job at the wage alone.

2. SUPPLIES. Chemicals, trash bags, paper products if you provide them, mop heads, microfiber. Track per job for a month and you will be shocked — supplies run 3% to 8% of the job price. Estimate a flat amount per visit once you know your average.

3. OVERHEAD. Everything that keeps the company running: insurance, vehicle costs, phone, uniforms, scheduling software, office, your own salary for managing. Overhead is not "free" — every job must carry its share. The simple method: add up monthly overhead, divide by total monthly labor hours. If overhead is $3,000/month and your crews work 400 hours/month, every labor hour carries $7.50 of overhead.

FULLY-LOADED HOURLY COST = (wage + labor burden) + (supplies per hour) + (overhead per hour).

Example: $15 wage + $3 burden + $1.50 supplies + $7.50 overhead = $27/hour true cost. If you charge $30/hour, you are making $3/hour — a 10% margin that one broken vacuum erases. Know this number for your company. It is the most important number in your business.

Track costs per job monthly in a simple spreadsheet: job name, hours, labor cost, supplies, overhead share, total cost, price, profit. Jobs that consistently lose money get repriced or dropped. No sentimentality — a job that loses $100/month costs you $1,200 a year.',
null
union all select (select cid from c), (select sid from st where step_number = 1), 2, 'reading', 'Pricing for Profit: The Math That Matters',
'Once you know your true cost, pricing is math, not guessing. Two concepts run the whole game: markup and margin. Confusing them is the most expensive mistake in this course.

MARKUP is what you add to cost. MARGIN is what you keep from price.
- Markup = (Price − Cost) ÷ Cost
- Margin = (Price − Cost) ÷ Price

Example: a job costs you $800/month. You price it at $1,000.
- Markup = (1000 − 800) ÷ 800 = 25%
- Margin = (1000 − 800) ÷ 1000 = 20%
Same dollars, different percentages. When someone says "I want 30% profit," ask: markup or margin? They usually mean margin — and pricing at 30% markup ($1,040) when you wanted 30% margin ($1,143) leaves real money on the table.

TARGETS for cleaning companies: aim for 40% to 50% gross margin on labor (price minus direct labor and supplies, divided by price), and 15% to 25% net margin after overhead. If your net margin is under 10%, one bad month — a client cancels, a machine breaks — puts you in the red.

THE PRICING FORMULA:
1. Estimate labor hours per visit × fully-loaded hourly cost = labor cost.
2. Add supplies per visit.
3. Add overhead share per visit.
4. Total = your true cost per visit.
5. Price = True cost ÷ (1 − target margin). For 40% margin: Price = Cost ÷ 0.60.

Example: true cost $68/visit, target 40% margin → $68 ÷ 0.60 = $113.33 → price $115/visit.

NEVER price by copying competitors. You do not know their costs, their quality, or whether they are profitable — many are not. Price from YOUR costs up, then sell the value: reliability, communication, consistency.

Raise prices annually, 3% to 5%, like every other business. Clients expect it. The ones who leave over 4% were going to leave anyway — and the math says keeping them at old prices was costing you more.',
null
union all select (select cid from c), (select sid from st where step_number = 1), 3, 'reading', 'Invoices, Payroll, and Reading a P&L',
'Profit on paper means nothing until the cash arrives. This lesson covers getting paid, paying your team, and reading the one report that tells you the truth.

INVOICING AND GETTING PAID. Invoice on the 1st for the month ahead or immediately after service — never "when you get around to it." Set clear terms: "Net 15" (due in 15 days) is standard for commercial cleaning. Every late invoice is an interest-free loan you gave the client. System: send invoice day 1, friendly reminder day 16, firm reminder day 30, phone call day 35, pause service at day 45 with written notice. Most clients pay at the reminder stage if your system is consistent. Accept ACH/bank transfer — it is cheaper than cards and faster than checks. Track accounts receivable (money owed to you) weekly; if it climbs past 45 days of revenue, you have a collections problem, not a sales problem.

PAYROLL BASICS. Pay on time, every time — late pay destroys trust faster than anything. Know the difference: employees (you withhold taxes, control their schedule) vs. contractors (they control how they work). Misclassifying is a common, expensive mistake — when in doubt, ask your accountant. Budget payroll taxes on top of wages (roughly 10%+ for employer share) and workers'' comp. Keep payroll records for years.

READING A PROFIT AND LOSS (P&L). The P&L is one page that tells you if the business works:
- REVENUE: total billed.
- COST OF GOODS SOLD (direct costs): cleaner wages, payroll taxes on those wages, job supplies. Revenue minus this = GROSS PROFIT.
- OPERATING EXPENSES (overhead): insurance, vehicles, phones, software, marketing, your management salary, office.
- NET PROFIT: what is left. Net margin = net profit ÷ revenue.

Read it monthly. Ask three questions: Is revenue growing? Is gross margin holding (40%+)? Is net margin 15%+? If gross margin slips, your pricing or labor efficiency slipped — fix it before it becomes a net loss.

CASH FLOW VS. PROFIT. You can be profitable and still run out of cash — if clients pay in 60 days but payroll hits every Friday. Keep a cash cushion of 4 to 6 weeks of expenses. That cushion is what lets you sleep at night.

One line, seriously: this is general business education, not tax or legal advice. Tax rules change and vary — check with your accountant for tax specifics before making tax decisions.',
null;

-- ============ STEP 2: VISUAL ============

with c as (select id as cid from public.training_courses where slug = 'accounting-training'),
st as (select step_number, id as sid from public.training_steps where course_id = (select cid from c))
insert into public.training_lessons (course_id, step_id, sort_order, kind, title, body, media_svg)
select (select cid from c), (select sid from st where step_number = 2), 1, 'visual', 'Where Each Dollar Goes: Job Cost Breakdown',
'This is a $115 service visit broken into its cost buckets. Labor is always the giant slice — which is why labor efficiency (hours per visit) matters more than saving pennies on chemicals.',
'<svg width="460" height="380" xmlns="http://www.w3.org/2000/svg"><rect x="5" y="5" width="450" height="370" rx="12" fill="#f8fafc" stroke="#cbd5e1"/><text x="230" y="36" text-anchor="middle" font-size="19" font-weight="bold" fill="#1e293b">Where a $115 Visit Goes</text><g font-size="13" fill="#1e293b"><rect x="60" y="60" width="252" height="44" rx="6" fill="#2563eb"/><text x="70" y="87" fill="#ffffff" font-weight="bold">Direct labor $63 (55%)</text><rect x="60" y="110" width="45" height="44" rx="6" fill="#f59e0b"/><text x="70" y="137" fill="#ffffff" font-weight="bold">Supplies $8</text><rect x="60" y="160" width="68" height="44" rx="6" fill="#8b5cf6"/><text x="70" y="187" fill="#ffffff" font-weight="bold">Overhead $12</text><rect x="60" y="210" width="45" height="44" rx="6" fill="#06b6d4"/><text x="70" y="237" fill="#ffffff" font-weight="bold">Tax/burden $9</text><rect x="60" y="260" width="92" height="44" rx="6" fill="#16a34a"/><text x="70" y="287" fill="#ffffff" font-weight="bold">Profit $23 (20%)</text></g><text x="60" y="330" font-size="13" fill="#475569">True cost = $92. Price = $92 ÷ (1 − 0.20) = $115.</text><text x="60" y="352" font-size="13" fill="#475569">Shrink labor hours and profit grows fastest.</text></svg>'
union all select (select cid from c), (select sid from st where step_number = 2), 2, 'visual', 'Anatomy of a P&L',
'Read top to bottom. Each line answers one question about your business.',
'<svg width="460" height="400" xmlns="http://www.w3.org/2000/svg"><rect x="5" y="5" width="450" height="390" rx="12" fill="#f8fafc" stroke="#cbd5e1"/><text x="230" y="36" text-anchor="middle" font-size="19" font-weight="bold" fill="#1e293b">Reading a P&amp;L</text><g font-size="14" fill="#1e293b"><rect x="20" y="55" width="420" height="50" rx="8" fill="#dbeafe" stroke="#2563eb"/><text x="34" y="76" font-weight="bold">REVENUE $24,000</text><text x="34" y="95" font-size="12" fill="#475569">Total billed this month</text><rect x="20" y="112" width="420" height="50" rx="8" fill="#fef3c7" stroke="#d97706"/><text x="34" y="133" font-weight="bold">− Direct costs $13,200</text><text x="34" y="152" font-size="12" fill="#475569">Wages + payroll tax + job supplies</text><rect x="20" y="169" width="420" height="50" rx="8" fill="#dcfce7" stroke="#16a34a"/><text x="34" y="190" font-weight="bold">= GROSS PROFIT $10,800 (45%)</text><text x="34" y="209" font-size="12" fill="#475569">Revenue minus direct costs — pricing health</text><rect x="20" y="226" width="420" height="50" rx="8" fill="#fee2e2" stroke="#ef4444"/><text x="34" y="247" font-weight="bold">− Overhead $6,000</text><text x="34" y="266" font-size="12" fill="#475569">Insurance, vehicles, phones, software, your salary</text><rect x="20" y="283" width="420" height="50" rx="8" fill="#1e293b"/><text x="34" y="304" font-weight="bold" fill="#ffffff">= NET PROFIT $4,800 (20%)</text><text x="34" y="323" font-size="12" fill="#cbd5e1">What the business actually earned</text></g><text x="230" y="365" text-anchor="middle" font-size="12" fill="#64748b">Ask monthly: revenue growing? gross margin 40%+? net 15%+?</text></svg>';

-- ============ STEP 3: WORKED EXAMPLE ============

with c as (select id as cid from public.training_courses where slug = 'accounting-training'),
st as (select step_number, id as sid from public.training_steps where course_id = (select cid from c))
insert into public.training_lessons (course_id, step_id, sort_order, kind, title, body, media_svg)
select (select cid from c), (select sid from st where step_number = 3), 1, 'worked_example', 'Pricing a 5,000 Sq Ft Office, Start to Finish',
'THE JOB. A 5,000 sq ft insurance office wants cleaning 3 nights a week (Mon/Wed/Fri). Scope: trash, restrooms (2), dusting, vacuum, mop hard floors. Follow the math exactly — this is how every bid should be built.

STEP 1 — ESTIMATE LABOR HOURS. Walk the site with a stopwatch mindset. Industry rule of thumb for general office: one cleaner covers 2,500 to 3,500 sq ft per hour depending on density and restrooms. This office is medium density with 2 restrooms: estimate 2 hours per visit. (New sites: add 15% for the first month while the cleaner learns the layout.)

STEP 2 — FULLY-LOADED HOURLY COST.
- Wage: $16.00/hr
- Labor burden (payroll taxes + workers'' comp, ~12%): $1.92 → round $2.00
- Supplies per labor hour: $1.50
- Overhead per labor hour: $3,200 monthly overhead ÷ 420 crew hours = $7.62 → round $7.60
Fully-loaded cost = $16.00 + $2.00 + $1.50 + $7.60 = $27.10/hr

STEP 3 — COST PER VISIT AND PER MONTH.
- Per visit: 2 hrs × $27.10 = $54.20 true cost (labor, burden, supplies, and overhead share are all inside that hourly number).
- Per month: 3 visits/week × 4.33 weeks = 13 visits → 13 × $54.20 = $704.60 true monthly cost.

STEP 4 — PRICE FOR 40% MARGIN.
Price = Cost ÷ (1 − 0.40) = $704.60 ÷ 0.60 = $1,174.33 → quote $1,175/month.

CHECK THE MARGIN: ($1,175 − $704.60) ÷ $1,175 = 40.0%. 

WHAT THE CLIENT SEES on the proposal: "General office cleaning, 3x weekly — $1,175/month. Includes trash, restrooms, dusting, vacuum, mopping. Supplies included." They never see your cost math — that stays internal.

SANITY CHECKS before you send it:
- Per-visit price: $1,175 ÷ 13 = $90/visit for 2 hours = $45/hr billed. Reasonable for commercial.
- Per sq ft: $1,175 ÷ 5,000 = $0.235/sq ft/month. Typical office range is $0.15–$0.35. We are in range.
- If the cleaner finishes in 1.5 hours instead of 2, margin rises to ~50%. Efficiency is pure profit — which is why training cleaners on method matters.

WHAT NOT TO DO: the competitor down the street bid $850. At our $704.60 cost, $850 gives a 17% margin — one sick week wipes it out. Their price is their problem. Our price comes from our math.',
null;

-- ============ STEP 4: GUIDED PRACTICE ============

with c as (select id as cid from public.training_courses where slug = 'accounting-training'),
st as (select step_number, id as sid from public.training_steps where course_id = (select cid from c))
insert into public.training_lessons (course_id, step_id, sort_order, kind, title, body, media_svg)
select (select cid from c), (select sid from st where step_number = 4), 1, 'guided_practice', 'Practice: Your Fully-Loaded Hourly Cost',
'Do this with YOUR numbers. Write each line.

1. Average cleaner wage: $______
2. Labor burden: wage × 0.12 = $______ (adjust to your state''s real rate)
3. Supplies per labor hour: $______ (total monthly supplies ÷ monthly crew hours)
4. Overhead per labor hour: $______ (total monthly overhead ÷ monthly crew hours)
5. FULLY-LOADED COST (1+2+3+4): $______

CHECK YOURSELF with the example: 16 + 1.92 + 1.50 + 7.62 = $27.04. If your number is under $22, double-check that you included overhead — most people who think their cost is $18/hr forgot the $7+/hr of overhead hiding in the background.

Now price a job: a 3,000 sq ft retail store, 2x/week, 1.5 hrs/visit, target 40% margin, using YOUR hourly cost.
- Per visit cost: 1.5 × $______ = $______
- Monthly cost: × 8.67 visits = $______
- Price: ÷ 0.60 = $______
Example answers with $27.10/hr: $40.65/visit → $352.44/month → $587.40 → quote $590/month. If your quote came out under $400, recheck — you probably forgot burden or overhead.',
null
union all select (select cid from c), (select sid from st where step_number = 4), 2, 'guided_practice', 'Practice: Markup vs. Margin',
'Answer, then check. This distinction is worth real money.

1. A job costs $500/month. You want 30% MARGIN. What is the price?
   YOUR ANSWER: $______
   CHECK: Price = 500 ÷ (1 − 0.30) = 500 ÷ 0.70 = $714.29 → $715.

2. Same $500 cost. You price it at $650. What are the markup and the margin?
   YOUR ANSWER: markup ____%, margin ____%
   CHECK: Markup = (650−500)÷500 = 30%. Margin = (650−500)÷650 = 23.1%. See the gap? "30% markup" sounds like "30% profit" but it is only 23% margin.

3. Your competitor brags about "50% markup on every job." What is their actual margin?
   YOUR ANSWER: ____%
   CHECK: Price = 1.5 × cost. Margin = 0.5 ÷ 1.5 = 33.3%. Good — but notice: 50% markup ≠ 50% margin. When anyone says a percentage about profit, always ask: markup or margin?

4. True or false: "If my gross margin is 45%, my business is definitely profitable."
   YOUR ANSWER: ______
   CHECK: False. Gross margin ignores overhead. You can have 45% gross margin and still lose money if overhead eats 50%. Net margin is the final answer.',
null;

-- ============ STEP 5: SIMULATOR ============

with c as (select id as cid from public.training_courses where slug = 'accounting-training'),
st as (select step_number, id as sid from public.training_steps where course_id = (select cid from c))
insert into public.training_lessons (course_id, step_id, sort_order, kind, title, body, media_svg)
select (select cid from c), (select sid from st where step_number = 5), 1, 'simulator', 'Simulator: The 20% Discount Demand',
'THE SITUATION. You quoted $1,175/month for the insurance office (true cost $704.60, 40% margin). The decision-maker, Greg, says: "We like you best, but the other bid is $950. Can you do $940? That''s 20% off. We''d sign today for a year."

OPTION A: Say yes to win the contract. $940/month, signed today.
What happens: Margin = (940 − 704.60) ÷ 940 = 25%. Looks okay — until month two, when your cleaner needs a raise, or supplies jump. At 25% margin you have no cushion: one extra hour per week of labor ($27.10 × 4.33 = $117/month) drops you to 15%. You just locked in a year of fragile, stressful work. And Greg now knows your price was flexible — expect another discount ask at renewal.

OPTION B: Hold firm, sell the value. "Greg, I understand — $940 is tempting. Here''s the thing: my price comes from what it actually costs to do the job right, with the same trained cleaner every visit and a supervisor checking monthly. At $940 I''d have to cut corners somewhere, and I won''t do that to you. I can do $1,120 for a 12-month agreement — that''s my best. You''re choosing between the cheapest bid and the one you liked best for a reason."
What happens: Sometimes Greg signs at $1,120 (margin 37%). Sometimes he goes with $950 — and calls you back in 4 months when the cheap company''s quality collapses (this happens constantly). Either way you kept a profitable book of business. A company of profitable clients beats a company of big, cheap clients every time.

OPTION C: Split the difference at $1,050 and hope.
What happens: Margin = 33%. Better than A, worse than B — and you still taught Greg that pushing gets a discount. "Splitting the difference" feels fair but it is just discounted-by-negotiation. Your costs did not change because Greg asked.

THE RIGHT MOVE: B. Price comes from math, not from the client''s ask. Small, pre-planned flexibility (like the $1,120 annual-agreement price) is fine — it was YOUR decision, tied to commitment. Reactive discounting trains clients to haggle and hollows your margin.

YOUR TURN — Greg says "Okay, $1,120, but throw in the windows quarterly." The windows take 1 hour quarterly (4x/year) at your $27.10 cost = $108.40/year = $9/month cost. Write your reply. Good version: "I can add quarterly window cleaning for $35/visit — that covers the extra labor and supplies." Compare: you priced the extra from cost instead of giving it free. If yours gave it free "to close the deal," redo it — free extras are margin leaks dressed as salesmanship.',
null;

-- ============ STEP 6: WRITTEN EXAM (8 groups x 3 variants = 24) ============

with c as (select id as cid from public.training_courses where slug = 'accounting-training')
insert into public.training_questions (course_id, kind, variant_group, question, choices, correct_index, explanation)
select (select cid from c), 'written', 'job-costing', 'What are the three cost buckets of every cleaning job?', '["Labor, marketing, and vehicles","Direct labor, supplies, and overhead","Rent, utilities, and insurance","Wages, bonuses, and commissions"]'::jsonb, 1, 'Every job costs direct labor (wages + burden), supplies, and its share of overhead. Miss any bucket and your price is fiction.'
union all select (select cid from c), 'written', 'job-costing', 'A cleaner earns $15/hr. What does that hour REALLY cost you?', '["$15.00 — the wage is the cost","About $18–$19 once payroll taxes and workers comp are added, before supplies and overhead","$25 no matter what","$12 after tax deductions"]'::jsonb, 1, 'Labor burden (payroll taxes + workers comp) adds roughly 10%+. Costing at the wage alone guarantees underpricing.'
union all select (select cid from c), 'written', 'job-costing', 'How do you assign overhead (insurance, phones, vehicles) to a specific job?', '["You cannot — overhead is free","Divide total monthly overhead by total monthly crew hours to get overhead per labor hour","Split it evenly across clients","Add 5% to every bid as a guess"]'::jsonb, 1, 'Overhead per labor hour = monthly overhead ÷ monthly crew hours. Every job carries its share through the hours it uses.'
union all select (select cid from c), 'written', 'overhead', 'Your monthly overhead is $3,000 and crews work 400 hours/month. Overhead per labor hour is:', '["$3,000","$7.50","$12.00","$0.75"]'::jsonb, 1, '3000 ÷ 400 = $7.50. Every labor hour on every job must carry $7.50 of overhead or the company bleeds.'
union all select (select cid from c), 'written', 'overhead', 'Which of these is an OVERHEAD cost?', '["The wages for the cleaner on the Elm Street job","Trash bags used at the Elm Street job","Your business insurance premium","Overtime for a specific Saturday clean"]'::jsonb, 2, 'Overhead keeps the whole company running regardless of any single job: insurance, vehicles, phones, software, office.'
union all select (select cid from c), 'written', 'overhead', 'Your fully-loaded hourly cost is $27. A job takes 2 hours. Its true cost is:', '["$27","$54","$108","Cannot tell without the price"]'::jsonb, 1, '2 × $27 = $54. The fully-loaded rate already includes wage, burden, supplies, and overhead — just multiply by hours.'
union all select (select cid from c), 'written', 'markup-margin', 'A job costs $800 and you price it at $1,000. What is the MARGIN?', '["25%","20%","80%","$200"]'::jsonb, 1, 'Margin = (1000−800) ÷ 1000 = 20%. Markup would be (1000−800) ÷ 800 = 25%. Same dollars, different percentages.'
union all select (select cid from c), 'written', 'markup-margin', 'A job costs $500. You want 30% margin. What is the price?', '["$650","$715","$600","$800"]'::jsonb, 1, 'Price = Cost ÷ (1 − margin) = 500 ÷ 0.70 = $714.29 → $715. Pricing at "30% markup" ($650) would only yield 23% margin.'
union all select (select cid from c), 'written', 'markup-margin', 'A competitor brags about 50% markup on every job. Their actual margin is:', '["50%","33.3%","25%","75%"]'::jsonb, 1, 'Price = 1.5 × cost, so margin = 0.5 ÷ 1.5 = 33.3%. Markup and margin are never the same number — always ask which one.'
union all select (select cid from c), 'written', 'hourly-rate', 'True cost is $68/visit and you target 40% margin. The price is:', '["$95","$113","$108","$95"]'::jsonb, 1, 'Price = 68 ÷ (1 − 0.40) = 68 ÷ 0.60 = $113.33 → $113. Check: (113−68) ÷ 113 = 39.8% margin.'
union all select (select cid from c), 'written', 'hourly-rate', 'Why should you NEVER price by copying a competitor?', '["It is illegal","You do not know their costs, quality, or whether they are even profitable","Competitors never share prices","It takes too long"]'::jsonb, 1, 'Many competitors are unprofitable and do not know it. Price from YOUR costs upward, then sell your value.'
union all select (select cid from c), 'written', 'hourly-rate', 'Healthy targets for a cleaning company are roughly:', '["10% gross margin, 5% net","40–50% gross margin on labor, 15–25% net margin after overhead","90% margin on everything","Margins do not matter if revenue grows"]'::jsonb, 1, 'Under 10% net margin, one bad month — a cancellation, a breakdown — puts you in the red. Margin is your shock absorber.'
union all select (select cid from c), 'written', 'invoicing', 'What are standard commercial cleaning payment terms?', '["Net 90","Net 15 — due in 15 days","Whenever the client feels like it","Cash only"]'::jsonb, 1, 'Net 15 is standard. Every late invoice is an interest-free loan you gave the client — have a reminder system.'
union all select (select cid from c), 'written', 'invoicing', 'A client is 35 days past due. What do you do?', '["Wait patiently","Firm reminder now, phone call at 35 days, pause service at 45 with written notice","Sue immediately","Offer a discount for late payment"]'::jsonb, 1, 'Escalate on a schedule: reminder day 16, firm reminder day 30, call day 35, pause service day 45. Consistency gets you paid.'
union all select (select cid from c), 'written', 'invoicing', 'Your accounts receivable keeps climbing past 45 days of revenue. This means:', '["You are growing fast","You have a collections problem, not a sales problem","Clients love you","Raise prices"]'::jsonb, 1, 'Profit on paper means nothing until cash arrives. Track receivables weekly — late payers quietly strangle cash flow.'
union all select (select cid from c), 'written', 'payroll', 'Why must you budget MORE than the wage for payroll?', '["You do not — the wage is the full cost","Employer payroll taxes and workers comp add roughly 10%+ on top of wages","Tips are required","Overtime is guaranteed"]'::jsonb, 1, 'The employer share of payroll taxes plus workers comp rides on top of every wage dollar. Budget it or every job is undercosted.'
union all select (select cid from c), 'written', 'payroll', 'An employee vs. contractor classification mistake can be expensive because:', '["Contractors cost more","Misclassifying workers can trigger back taxes and penalties — ask your accountant when unsure","Employees cannot be fired","Contractors need benefits"]'::jsonb, 1, 'Worker classification has real tax consequences. This is general education, not legal advice — check with your accountant for specifics.'
union all select (select cid from c), 'written', 'payroll', 'What destroys employee trust fastest?', '["Strict quality standards","Late paychecks","Early morning shifts","Wearing uniforms"]'::jsonb, 1, 'Pay on time, every time. Nothing else in this course matters if the team cannot trust payday.'
union all select (select cid from c), 'written', 'pl-cashflow', 'On a P&L, gross profit is:', '["Revenue minus overhead","Revenue minus direct costs (wages, payroll tax, job supplies)","Revenue minus taxes","The owner''s salary"]'::jsonb, 1, 'Gross profit = revenue − direct costs. It measures pricing health before overhead. Target 40%+.'
union all select (select cid from c), 'written', 'pl-cashflow', 'Your P&L shows a profit but you cannot make payroll Friday. What is happening?', '["The P&L is wrong","A cash flow timing gap — clients pay in 60 days but payroll hits weekly","You are bankrupt","Payroll is too high"]'::jsonb, 1, 'Profit and cash are different. Profitable companies still die from timing gaps — keep 4 to 6 weeks of expenses as a cash cushion.'
union all select (select cid from c), 'written', 'pl-cashflow', 'A job has 45% gross margin but the company''s net margin is 5%. The likely problem:', '["Pricing is too low","Overhead is eating the profit — too much fixed cost for the revenue","Labor is too cheap","Supplies cost too much"]'::jsonb, 1, 'Strong gross margin with weak net margin means overhead bloat. Either grow revenue to spread overhead or trim fixed costs.'
union all select (select cid from c), 'written', 'raising-prices', 'Your costs rose 6% this year and you have not raised prices in 2 years. Best move?', '["Absorb it forever to keep clients","Annual 3–5% increase with 30 days notice and a brief note about rising costs","Double prices to catch up all at once","Only raise prices on brand-new clients"]'::jsonb, 1, 'Small annual increases are expected by business clients. Catch-up doubling shocks people; steady 3–5% is normal business.'
union all select (select cid from c), 'written', 'raising-prices', 'A long-time client threatens to leave over a 4% increase ($40 on $1,000/month). You should:', '["Cancel the increase just for them","Hold firm politely — keeping them below market costs more than losing them","Beg them to stay","Offer two free deep cleans instead"]'::jsonb, 1, 'Caving teaches haggling and preserves a below-market account. Most threats over small increases evaporate when you hold firm kindly.'
union all select (select cid from c), 'written', 'raising-prices', 'How often should a cleaning company raise prices?', '["Never — clients hate it","Every month","Annually, around 3% to 5%, like every other business","Only when a client complains about quality"]'::jsonb, 2, 'Annual 3–5% increases are standard business practice. Clients expect it; the ones who leave over 4% were going to leave anyway.';

-- ============ STEP 7: SCENARIO EXAM (5 groups x 2 variants = 10) ============

with c as (select id as cid from public.training_courses where slug = 'accounting-training')
insert into public.training_questions (course_id, kind, variant_group, question, choices, correct_index, explanation)
select (select cid from c), 'scenario', 'underpriced-job', 'You discover a $900/month client actually costs you $950/month to service. It has been 6 months. What do you do?', '["Keep it — firing clients looks bad","Reprice with 30 days notice, explaining rising costs, or drop the account — a losing job costs $600/year","Quietly cut their services to make it profitable","Hope costs go down"]'::jsonb, 1, 'No sentimentality: losing jobs get repriced or dropped. $50/month lost is $600/year — real money that funds nothing.'
union all select (select cid from c), 'scenario', 'underpriced-job', 'Your job-cost spreadsheet shows one site at 8% net margin while others are at 22%. First step?', '["Drop the site immediately","Dig into why: extra hours? supply waste? Then reprice or fix efficiency before deciding","Give the crew a bonus","Ignore it — average margin is fine"]'::jsonb, 1, 'Diagnose before you act. An 8% site might be fixed with retraining or a scope correction — but you only know because you tracked it.'
union all select (select cid from c), 'scenario', 'raise-prices', 'Costs rose 6% this year but you have not raised prices in 2 years. Best move?', '["Absorb it forever to keep clients","Annual 3–5% increase with 30 days notice and a brief note about rising costs","Double prices to catch up","Only raise prices on new clients"]'::jsonb, 1, 'Small annual increases are expected by every business client. Clients who leave over 4% were going to leave anyway.'
union all select (select cid from c), 'scenario', 'raise-prices', 'A long-time client threatens to leave over a 4% increase ($40/month on $1,000). You:', '["Cancel the increase just for them","Hold firm politely — the math says keeping them at old prices costs more than losing them","Beg them to stay","Offer 2 extra free cleans"]'::jsonb, 1, 'Caving teaches haggling and keeps a below-market account. Most "threats" over small increases evaporate once you hold firm kindly.'
union all select (select cid from c), 'scenario', 'cash-crunch', 'It is Wednesday. Payroll hits Friday ($4,200) and your biggest client''s $6,000 check "is in the mail." You have $3,000 in the bank. What now?', '["Wait and hope","Call the client today: polite but firm, request wire/ACH this week; this is why you build a cash cushion","Skip payroll this week","Take a payday loan"]'::jsonb, 1, 'Call today — polite urgency beats hope. And the real lesson: a 4–6 week cash cushion exists exactly for this week.'
union all select (select cid from c), 'scenario', 'cash-crunch', 'Two clients regularly pay at 60+ days. Your terms are Net 15. What is the systemic fix?', '["Accept it — big clients pay slow","Enforce your terms: reminders at 16/30 days, call at 35, pause service at 45 — consistently","Fire them both immediately","Switch to cash only"]'::jsonb, 1, 'Terms without enforcement are suggestions. A consistent escalation system trains clients to pay on time — most pay at the reminder stage.'
union all select (select cid from c), 'scenario', 'growth-decision', 'You are at capacity. A $2,000/month prospect wants to sign but you would need to hire. How do you decide?', '["Sign first, figure out staffing later","Cost it out: fully-loaded labor + supplies + overhead share vs. $2,000 — only sign if margin clears your 15–25% net target","Sign only if they prepay a year","Decline all growth"]'::jsonb, 1, 'Growth that loses money is just expensive stress. Run the job-cost math first — a $2,000 account at 5% margin is not worth the hiring risk.'
union all select (select cid from c), 'scenario', 'growth-decision', 'A competitor closes and offers you their 10 accounts at "a great price." Before you answer, you:', '["Buy them — accounts are accounts","Cost out each account individually — some may be underpriced losers you would be buying","Accept only if they are all monthly","Ask their cleaners to join you first"]'::jsonb, 1, 'Never buy revenue blind. Underpriced accounts are liabilities, not assets. Price each one from your costs before agreeing.'
union all select (select cid from c), 'scenario', 'supply-costs', 'Supply costs jumped 20% this quarter and your per-job supply estimates are now wrong. What do you do?', '["Ignore it — supplies are minor","Recalculate supply cost per labor hour from the last 3 months and update every active bid template","Switch to the cheapest chemicals","Bill clients extra without telling them"]'::jsonb, 1, 'Estimates rot. Recompute supply-per-hour quarterly from real spending and refresh your bid math — small leaks sink margins.'
union all select (select cid from c), 'scenario', 'supply-costs', 'A crew is using twice the chemical the job should need. Your first move?', '["Buy in bigger bulk","Retrain on proper dilution and measure usage for two weeks — waste is usually a training problem, not a purchasing problem","Accuse them of stealing","Do nothing"]'::jsonb, 1, 'Overuse is almost always dilution/training, not theft. Retrain, measure, and watch the numbers normalize before assuming worse.';

-- ============ STEP 8: PRACTICAL FINAL ============

with c as (select id as cid from public.training_courses where slug = 'accounting-training')
insert into public.training_practicals (course_id, title, instructions, checklist)
select (select cid from c), 'Cost Out a Real Job and Build a Quote',
'Put the math to work on a real job. Pick one actual site you service (or a realistic prospect). (1) Compute YOUR fully-loaded hourly cost with your real wage, burden, supply, and overhead numbers. (2) Time-estimate or use actual hours for the site. (3) Build the full quote: per-visit cost, monthly cost, price at 40% margin, and the client-facing proposal lines. Submit your worksheet as evidence (photo or file).',
'["Computed fully-loaded hourly cost using MY real numbers (wage + burden + supplies/hr + overhead/hr)","Showed the labor burden calculation (not just the wage)","Computed overhead per labor hour from actual monthly overhead and crew hours","Estimated or measured the site''s hours per visit with a stated basis","Calculated per-visit true cost (hours × fully-loaded rate)","Calculated monthly true cost (visits/month × per-visit cost)","Priced at 40% margin using Price = Cost ÷ 0.60","Ran sanity checks: $/visit, $/sq ft, and billed hourly rate all reasonable","Wrote client-facing proposal lines (scope + price, no internal cost math shown)","Worksheet is legible, complete, and submitted as evidence"]'::jsonb;
