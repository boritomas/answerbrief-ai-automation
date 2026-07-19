# Verified Profile and Evidence Rules

## Candidate Master Profile

Career OS uses one versioned Candidate Master Profile containing:

- legal and preferred name;
- contact details;
- address data required for applications;
- LinkedIn URL;
- portfolio URL when applicable;
- verified employment history;
- verified education;
- verified certifications;
- AI learning and applied AI evidence;
- skills;
- accomplishments;
- metrics;
- leadership stories;
- projects;
- target roles;
- excluded roles;
- target industries;
- excluded companies;
- location preferences;
- remote, hybrid, and on-site preferences;
- relocation preference;
- travel preference;
- work authorization;
- sponsorship need;
- availability;
- compensation target;
- reusable application answers;
- approved resume versions;
- application policy;
- messaging approval policy.

## Verification States

Every reusable fact and every material candidate claim must be one of:

- verified fact;
- Tomas-provided fact;
- parsed fact;
- calculated value;
- assumption;
- unknown;
- recommendation;
- requires verification.

Only verified facts and Tomas-provided facts approved for external use may appear in resumes, applications, recruiter messages, LinkedIn materials, interview packages, or employer forms.

## Claim Evidence

Every material candidate claim must carry:

- source;
- evidence reference;
- verification state;
- confidence;
- profile version;
- last-reviewed timestamp.

## Unsupported Fact Rejection

Before external use, Career OS must reject:

- facts with missing evidence;
- unknown legal answers;
- unsupported employment dates, titles, education, credentials, metrics, compensation history, sponsorship status, work authorization, protected-status answers, disability status, veteran status, criminal-history answers, and legal certifications;
- contradictions between generated artifacts and the Candidate Master Profile.

## Onboarding Rule

Missing reusable factual or legal answers must be consolidated into one Candidate Master Profile onboarding flow. Do not generate repeated job-level tasks for the same missing reusable answer.

## Confidentiality Rule

Verizon confidential data, internal screenshots, transcripts, emails, proprietary processes, customer data, or employment-confidential material must never be used in fixtures, demos, tests, public content, or external artifacts.
