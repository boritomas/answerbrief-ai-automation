# Tomas Career OS Architecture

## Principle

Career OS is an evidence-first orchestration layer. It may use AI for language work, but deterministic services own identity, validation, deduplication, state transitions, permissions, retries, and evidence checks.

## Core Components

- Executive Assistant Home: factual summary of completed work, important opportunities, blockers, and next actions.
- Opportunity Intelligence: permitted-source discovery, active-posting verification, normalization, deduplication, and scoring.
- Candidate Master Profile: versioned source of candidate facts, reusable application answers, approval policies, and evidence references.
- AnswerBrief Career Intelligence: ATS, AI readiness, recruiter intelligence, hiring-manager evidence matrix, interview package, and STAR story selection.
- Resume Engine: targeted resume generation with validation, artifact metadata, version history, and open-file checks.
- Application Package Engine: application answers, resume, optional cover letter, recruiter note, package metadata, and delivery location.
- Employer Execution Adapters: platform-specific execution with explicit capability boundaries and human-only gate detection.
- Recruiter and Networking CRM: recruiter contacts, messages, follow-ups, interview signals, and outcome tracking.
- Document Vault: generated artifacts, source documents, evidence snapshots, and submission confirmations.
- Analytics: discovery quality, match strength, package throughput, submissions, gates, recruiter activity, and cost.
- Daily Autonomous Agent: scheduled execution of the same production pipeline used by interactive actions.
- System Administration: adapter health, credentials, raw logs, queues, migrations, tests, and cost controls.

## State Model

Career OS state must be auditable. Every opportunity, package, adapter run, and submission attempt records:

- production or synthetic environment;
- owning user;
- source system;
- evidence references;
- input hashes;
- idempotency keys;
- previous and next state;
- actor;
- timestamp;
- cost metadata when AI or paid APIs are used.

## Adapter Boundary

Each employer adapter must declare supported capabilities before it runs:

- posting validation;
- requisition identification;
- account creation or reuse;
- profile updates;
- contact data;
- employment data;
- education data;
- document upload;
- reusable question answering;
- sensitive or legal question detection;
- CAPTCHA detection;
- MFA detection;
- submission;
- confirmation evidence;
- retry handling;
- idempotency;
- audit logging.

No adapter may claim universal support by routing every platform through one generic routine.

## Persistence

Production implementations should persist the Candidate Master Profile, opportunities, analyses, artifacts, package records, adapter runs, evidence, and timeline events in the existing application storage layer. Supabase, D1, Google Drive, Gmail, Calendar, GitHub, and Vercel may be used only when configured and permitted.

Synthetic fixtures live under `fixtures/synthetic-career-os/` and cannot satisfy production acceptance.

## Live Surface

The public AnswerBrief MVP may remain intact. The Career OS surface must expose factual private status through a route or authenticated view, and the verification command must be able to query that status before any production completion claim.
