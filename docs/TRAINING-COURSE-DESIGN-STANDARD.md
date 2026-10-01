# Organization-Wide Training and Course Design Standard

**Source of truth:** Business HQ Control Hub organization standard `TRAINING_COURSE_DESIGN`

This standard applies to all current and future applications, training academies, onboarding courses, operator manuals, job-training modules, and internal learning systems created for the organization.

## Required teaching sequence

Every substantial lesson must use this order:

1. Full explanatory reading
2. Visual reinforcement immediately after the reading
3. Worked example
4. Guided practice
5. Hands-on simulator or supervised practical
6. Written / knowledge assessment
7. Scenario assessment
8. Evidence submission
9. Reviewer grading / approval
10. Refresher or recertification when the system materially changes

## Three-part learning model

### Reading
Written instruction teaches the concept, why it matters, how the pieces relate, common failure modes, evidence, controls, and limits of authority.

### Visual
Screenshots, labeled training screens, diagrams, callouts, and system maps show the learner what the written material looks like in practice.

Visuals are additive. They must never shorten, replace, or water down the written lesson.

### Hands-on
Simulators, guided labs, supervised practice, and practical finals prove that the learner can perform the work rather than only answer questions about it.

Where real production systems would create risk, use realistic non-production or simulated environments.

## Non-negotiable rules

- Never shorten required reading because visuals were added.
- Never require a learner to guess internal repository names, hosting projects, database references, environments, role rules, or other organization-specific facts.
- Teach before practice; practice before graded assessment.
- Use realistic screenshots, diagrams, or clearly labeled training simulations.
- Hands-on finals must mirror the real job without risking live production systems.
- Training completion never automatically grants Production, Owner, Administrator, or other elevated access.
- Update course material whenever providers, screens, architecture, security rules, recovery procedures, or critical workflows materially change.
- A course is incomplete if a learner is asked to perform a task using information that was neither taught nor supplied.
- Practical assessments must include safe stop-and-escalate decisions, not only successful technical actions.

## App implementation rule

Each product may adapt examples and simulations to its own workflows, but it must preserve this instructional model and minimum depth.

Product-specific course material belongs with that product. The organization-wide standard remains centrally governed by Business HQ Control Hub.


## Assessment integrity

Assessments must promote actual learning rather than answer copying.

- Rotate question/scenario order between learners.
- Rotate answer-choice order independently.
- Retakes must generate a different ordering or equivalent variant.
- Keep answer keys out of the learner browser before grading.
- Record an exam-variant identifier when the platform supports it.
- Written finals should use question banks with multiple equivalent questions per learning objective.
- Two employees sitting next to each other should not be guaranteed the exact same test sequence.
- Randomization must not change the required knowledge, passing standard, or difficulty unfairly.
