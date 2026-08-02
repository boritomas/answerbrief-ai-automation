# CareerOS Production Architecture v1.0

## Objective

CareerOS is production-ready only when one application completes autonomously from discovery through employer confirmation, with evidence attached and status set to `submitted_confirmed`.

## Production Success Contract

A run is successful only when all stages pass:

1. Discover job
2. Qualify job
3. Generate tailored resume package
4. Claim one application
5. Launch browser
6. Complete ATS flow
7. Detect confirmation page or success response
8. Receive matching employer confirmation email
9. Archive evidence
10. Persist `submitted_confirmed = true`

A click on Submit, page navigation, or HTTP 200 alone is not success.

## Control Surface

CareerOS exposes operations through GitHub issue commands. Issue #49 is the production control channel.

Supported commands:

- `CAREER_OS_STATUS`
  - Returns the latest production run, runner state, last completed stage, and artifact name.
- `TRIGGER_PRODUCTION_CANARY`
  - Cancels stale production runs and dispatches one controlled canary against `main`.
- `RETRY_FAILED_STAGE`
  - Re-dispatches the latest failed canary using existing state and evidence.
- `FETCH_LATEST_EVIDENCE`
  - Reports the latest evidence artifact and run ID for inspection.
- `CLEANUP_AND_HEALTHCHECK`
  - Runs disk recovery, Docker health, runtime health, and runner diagnostics without submitting an application.

Only repository owner `boritomas` and GitHub Actions may issue production commands.

## Runtime Boundary

The Mac is the execution host.

Canonical runtime:

`/Users/tomasnieves/Library/Application Support/CareerOSCompanionRuntime/answerbrief-ai-automation-starter`

Self-hosted runner:

`Mac-mini-career-os`

The runtime preserves local secrets and authenticated browser state. Secrets must never be printed, uploaded, or committed.

## Evidence Contract

Every canary must archive:

- stage report
- supervisor log
- worker health
- production report
- browser screenshots
- Playwright trace when available
- HAR when available
- DOM snapshot when available
- console/network errors
- confirmation-page evidence
- confirmation-email evidence

Artifact naming:

`career-os-production-<run_id>`

## Stage Contract

Each run must report these stages:

- DISCOVERY
- QUALIFICATION
- PACKAGE_GENERATION
- QUEUE_CLAIM
- BROWSER_LAUNCH
- LOGIN
- RESUME_UPLOAD
- AUTOFILL
- QUESTIONNAIRE
- REVIEW
- SUBMIT
- CONFIRMATION_PAGE
- CONFIRMATION_EMAIL
- EVIDENCE_ARCHIVE
- PERSISTENCE

Each stage records:

- start time
- end time
- PASS, FAIL, BLOCKED, or NOT_REACHED
- evidence path
- failure class
- retryable true or false

## Failure Classes

- `infrastructure`
- `runner`
- `disk`
- `docker`
- `authentication`
- `browser_launch`
- `selector_drift`
- `validation`
- `upload`
- `network`
- `ats_state`
- `queue_starvation`
- `confirmation_timeout`
- `human_required`

## Automatic Repair Policy

The supervisor may automatically repair and retry only when the failure is classified as retryable.

Allowed automatic repairs include:

- restart worker
- restart browser session
- clear temporary browser state
- refresh selectors from current DOM
- retry transient network failures
- re-open current application checkpoint
- restart OpenHands or fallback executor
- clean old evidence and Docker cache

Automatic execution must stop for:

- CAPTCHA
- MFA
- identity verification
- macOS security approval
- unavailable credentials
- legal or factual application questions not supported by verified records

## Deterministic Canary Policy

Until the first production proof is achieved:

- one ATS
- one job
- one resume package
- one browser profile
- one application per run
- no concurrent submissions
- no feature expansion

## Promotion Gate

The first production milestone requires one run ending in:

`submitted_confirmed`

with linked browser and employer-email evidence.

After that, the baseline is frozen and tagged. Additional ATS platforms are added one at a time using the same evidence contract.

## Operating Rule

Evidence first. Code second.

When a browser failure cannot be isolated from logs, collect HAR, trace, screenshots, DOM, and console evidence before modifying automation logic.
