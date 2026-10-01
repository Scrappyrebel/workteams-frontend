# Advanced Training Upgrade Roadmap

This product must be upgraded to the organization-wide training standard defined by Business HQ Control Hub standard `TRAINING_COURSE_DESIGN`.

## Required end state

Existing training is preserved and expanded, not replaced with shorter summaries.

Every substantial course must contain:
1. Full textbook-style reading that assumes the learner may be a beginner.
2. Visual reinforcement after the related reading: labeled screenshots, diagrams, equipment/workflow drawings, or provider-style training screens.
3. Worked examples.
4. Guided practice with all needed information supplied.
5. Hands-on practice or a safe simulator that mirrors actual job duties.
6. Written knowledge assessment.
7. Scenario-based assessment.
8. A practical final that requires the learner to perform the actual workflow safely.
9. Saved evidence and management/reviewer sign-off.
10. Retraining and recertification when procedures or systems materially change.

## Non-negotiable rules

- Visuals add to the reading; they never shorten or replace it.
- Learners are never tested on internal information that was not taught or supplied.
- Practical training must use safe test/simulation environments when live work could affect customers, employees, money, security, food safety, or Production software.
- Completion does not automatically grant elevated system or job access.
- Existing company-specific content remains company-specific.

## Business-specific application

For Lilly B's Janitorial, visuals and practicals should include cleaning equipment, chemical/dilution procedures, site access, scope/checklist examples, inspections, timekeeping, end-of-shift proof, supply handling, and customer-site scenarios.

For That's A Wrap and More Catering and Food Trailer, visuals and practicals should include food-prep setup, thermometers and temperature logs, sanitation, allergen controls, transport/setup, trailer utilities, food-service workflow, portioning, equipment, closing/breakdown, and Missouri-specific food-safety examples where applicable.

For office/management departments, practical finals should mirror the actual app screens and controlled workflows for Accounting, HR, Sales, Operations, Quality, Training Administration, IT, and other departments.

## Release rule

Implement and review the upgrade on a non-production branch first. Verify course depth, visuals, practicals, permissions, and saved progress before merging into Production.
