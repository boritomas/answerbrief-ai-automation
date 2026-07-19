# Tomas Career OS Repository Rules

## Product Objective

Tomas Career OS is an autonomous executive career agent.

Its purpose is to:

- discover real current executive opportunities;
- evaluate them against a verified Candidate Master Profile;
- prepare role-specific AnswerBrief materials;
- progress applications through every technically permitted step;
- submit under the configured approval policy;
- pause only for genuine human-only gates;
- resume automatically afterward;
- track recruiters, interviews, offers, and outcomes;
- show Tomas what the agent completed rather than exposing unfinished internal workflow mechanics.

AnswerBrief AI public-service work remains allowed in this repository when it does not conflict with the Career OS rules, privacy guardrails, or evidence standard.

## Single Source of Truth

All resumes, applications, recruiter messages, LinkedIn materials, and interview packages must use one versioned Candidate Master Profile.

No unsupported fact may appear in an external artifact.

## Evidence Standard

Every material candidate claim must carry:

- source;
- evidence reference;
- verification state;
- confidence;
- profile version;
- last-reviewed timestamp.

## No Hallucinated Completion

The following do not independently establish mission completion:

- UI deployment;
- documentation;
- database seed records;
- mocked tests;
- local-only changes;
- status-label changes;
- task creation;
- dashboard counts;
- generated placeholder text;
- application records without employer evidence.

## Required Completion Command

The mission is incomplete unless:

```bash
./scripts/verify-career-os-mission
```

exits with status 0.

Use the appropriate repository-native invocation if the script language requires one.

## Real-World Proof Requirement

Completion requires production evidence of:

- a real current job discovered from a connected permitted source;
- a persisted job description and requisition identity;
- a completed AnswerBrief analysis;
- an actual targeted resume artifact that opens;
- an actual application package stored in the documented delivery location;
- a real employer workflow progressed;
- every supported step completed;
- confirmed submission or a verified unavoidable human-only gate after all preceding steps;
- factual production state shown in the live application;
- the scheduled daily workflow using the same path.

## Human-Only Gates

Only CAPTCHA, MFA, identity verification, inaccessible account recovery, unresolved legal facts, explicit third-party automation restrictions, or irrecoverable external credentials qualify.

## UI Rule

The main application must behave like an executive assistant.

Developer terminology, raw queues, internal state values, schema language, and operational implementation details belong only in System Administration.

## Cost Rule

Reuse, cache, batch, deduplicate, and avoid unnecessary AI calls.

Deterministic code is preferred for parsing, validation, scoring, deduplication, state transitions, evidence checks, and regression tests. AI calls require a cache key based on profile version, opportunity version, prompt version, model version, and input hash.

## Confidentiality Rule

Never use Verizon confidential data, internal screenshots, transcripts, emails, proprietary processes, customer data, or employment-confidential material in the commercial system, fixtures, demos, or tests.

Never commit secrets, plaintext passwords, API keys, service-account private keys, refresh tokens, or production credentials.

## Testing Rule

Run every repository-required check and the mission verification command before claiming completion.

Mocked or synthetic tests may prove engineering quality, but they do not replace production evidence.

## Deployment Rule

Local success is not production success.

Push, deploy, and validate the live authenticated application before claiming the production mission is complete.

## Final Reporting Rule

Report facts and evidence only.

Never use "complete", "production-ready", "fully autonomous", or "end to end" unless `./scripts/verify-career-os-mission` exits 0.

## Existing AnswerBrief Guardrails

- Keep AnswerBrief AI clear, human, trustworthy, direct, and plain-English.
- Keep Founding Customer Pricing unless Tomas explicitly changes it: Quick Prep $49, Full Interview Brief $149, Premium Prep $299.
- Use Stripe Payment Link environment variables for the public MVP package cards.
- Do not add job-outcome guarantees or fake urgency.
- Warn users not to upload SSNs, passwords, bank data, confidential employer files, sensitive personal documents, or proprietary material.
