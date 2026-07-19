# Codex Cost Control

## Operating Rules

- Inspect the repository once and preserve a concise map.
- Do not repeat broad scans.
- Do not re-read unchanged files unnecessarily.
- Batch related file reads and edits.
- Batch tests where practical.
- Reuse existing architecture and functioning components.
- Do not create parallel repositories, apps, databases, storage systems, or deployment targets.
- Avoid unnecessary dependencies.
- Confirm push and deployment capability before major development when the mission depends on production validation.

## AI Usage

Use deterministic code for parsing, validation, scoring, deduplication, state transitions, and evidence checks.

Call AI models only for work that genuinely requires language reasoning or generation. Cache AI results using a stable hash of:

- profile version;
- opportunity version;
- prompt version;
- model version;
- input content.

Record model identifier, prompt version, token usage, and cost where supported.

Use the least expensive suitable model for routine transformations. Reserve more capable models for high-value resume, interview, and evidence reasoning.

## Verification Discipline

Do not regenerate identical artifacts. Do not run broad redundant test suites after every small edit. Do run the full required suite, production build, and `./scripts/verify-career-os-mission` before a production completion claim.

## Evidence Discipline

Never spend tokens or engineering time making placeholders look real. Missing production evidence should remain a failing verifier row with the exact smallest required external action.
