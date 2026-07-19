# Tomas Career OS Mission

This document is the authoritative product contract for Tomas Career OS.

## System Map

```text
Tomas Career OS
|-- Executive Assistant Home
|-- Opportunity Intelligence
|-- Candidate Master Profile
|-- AnswerBrief Career Intelligence
|   |-- Resume Engine
|   |-- ATS Analysis
|   |-- AI Readiness
|   |-- Recruiter Intelligence
|   |-- Hiring Manager Evidence
|   |-- Interview Engine
|   `-- STAR Story Library
|-- Application Package Engine
|-- Employer Execution Adapters
|-- Recruiter and Networking CRM
|-- Interview Hub
|-- Document Vault
|-- Analytics
|-- System Administration
`-- Daily Autonomous Agent
```

## Operational Objective

1. Discover real current jobs.
2. Verify that each posting is active.
3. Deduplicate by source, requisition ID, canonical URL, company, and title.
4. Score against Tomas's verified profile.
5. Skip weak matches automatically.
6. Create AnswerBrief analyses for strong matches.
7. Create and validate a targeted resume.
8. Create the application package.
9. Determine the employer platform.
10. Create or reuse the employer profile where permitted.
11. Fill verified reusable information.
12. Upload the targeted resume.
13. Continue through every technically supported step.
14. Pause only for a real human-only gate.
15. Resume automatically after the gate.
16. Submit under the configured application policy.
17. Capture submission confirmation.
18. Update the factual application timeline.
19. Monitor recruiter and interview activity where connected.
20. Create the interview package when the application progresses.
21. Produce a daily executive briefing based on completed work.

## Executive Assistant Experience

The Home page must be based on real production data and answer within five seconds:

- What did Career OS do?
- Which opportunities matter?
- What packages exist?
- What was submitted?
- What needs Tomas?
- What happens next?

The main navigation is:

- Home
- Opportunities
- Applications
- Interviews
- Contacts
- Documents

Technical controls belong under System Administration.

## Daily Briefing Contract

Daily briefings are calculated from actual daily discoveries, active posting verification, fit scores, package state, application state, published compensation, human-only gates, and completed submissions.

Do not hard-code opportunity counts, package counts, salary ranges, or submission counts. When salary information is incomplete, the briefing must say so accurately.

## Completion Standard

The mission is not complete until `./scripts/verify-career-os-mission` exits 0 using production evidence, not synthetic fixtures, seed data, placeholders, or manual status edits.
