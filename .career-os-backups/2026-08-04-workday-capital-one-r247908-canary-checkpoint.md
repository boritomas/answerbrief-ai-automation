# Checkpoint: Capital One Workday Canary (app-auto-workday-capital-one-r247908)

Saved: 2026-08-04, ~19:00 CDT (local Mac time). Updated ~19:10 CDT after two
in-session incidents (see below) — this file, `TOMORROW_START.md`, and
`scripts/resume-capital-one-canary.sh` are now committed to git specifically
because of what those incidents revealed.

## Mission

Get CareerOS to one verified Workday production canary submission
(app-auto-workday-capital-one-r247908), then keep Workday automation ready to
process additional qualified Workday applications one at a time under
existing safety controls. No submission has occurred yet.

## IMPORTANT — two in-session incidents that shaped how this checkpoint is stored

**Incident 1 (18:59 local):** The scheduled "Career OS Job Inbox" GitHub
Actions workflow (`.github/workflows/career-os-job-inbox.yml`, self-hosted
runner, cron `0 13,18,23 * * *` UTC) ran its "Sync runtime" step:
```
rsync -a --delete --exclude '.env' --exclude 'node_modules' "$CAREER_OS_SOURCE/" "$CAREER_OS_RUNTIME/"
```
This excluded only `.env` and `node_modules` — not `.env.local`, `.next/`, or
`.career-os-browser-worker/`. Since those are gitignored (absent from the
fresh checkout) and not excluded, `--delete` removed all three from this
runtime directory mid-session, including the live `.env.local` (canary
config + real secrets), the `.next` build output, and the entire
`.career-os-browser-worker/` state directory. Recovered within the session:
`.env.local` reconstructed, `.next` rebuilt, `worker:health` re-verified
healthy. The Supabase-side fix below (stale `production_outcome`) was
unaffected since it's server state.

**Fix applied and pushed to `main`:** commit
[`130e229`](https://github.com/boritomas/answerbrief-ai-automation/commit/130e22906154ff670a989bf02b703e1d1f72264c)
adds `--exclude '.env.local' --exclude '.next' --exclude '.career-os-browser-worker'`
to that rsync step, matching `career-os-approved-queue.yml` and
`career-os-mac-production.yml`. Verified live on `main`.

**Incident 2 (~19:07 local, ~10 minutes later):** Multiple other scheduled
workflows fired around the same time (`Career OS Job Inbox` again — this
time using the already-fixed workflow, confirmed via `headSha` matching
commit `130e229` — plus `Career OS Force Now`, `Career OS Mac Production
Canary`, `Verify Vercel Build`). `.env.local`, `.next/`, and
`.career-os-browser-worker/` all correctly survived this round. **However**,
this checkpoint file, `TOMORROW_START.md`, and `scripts/resume-capital-one-canary.sh`
— which had only been written locally at that point, not committed to git —
were deleted anyway, because they are new files that simply don't exist in
the git source tree at all. Excluding known state paths doesn't protect
arbitrary new files: any `rsync --delete` mirroring a git checkout onto this
directory will remove anything here that isn't in git and isn't gitignored.

**Lesson applied:** rather than trying to exclude every possible new
filename in every sync workflow (fragile, needs updating forever), these
three deliverable files are committed directly to `main` so they are part
of the git source itself and survive every sync automatically, the same way
the pre-existing `.career-os-backups/2026-08-01-*.md` files already did.

## Local server status

- Local Next.js server built (`npm run build`, webpack, succeeded) and running
  via `next start --hostname 127.0.0.1 --port 3210`, started with nohup (not a
  launchd service — does not survive reboot on its own).
- Health: `curl http://127.0.0.1:3210/api/career-os/health` → `ok: true`,
  Supabase `connectivity: "ok"`, `readAccess: true`.

## Worker status

- `npm run worker:health` → `ok: true`, `configured: true`.
- No worker "start" loop is currently running in the background (the earlier
  test loop was stopped; a `run-once` attempt exited cleanly with
  `claimed: false`, blocked only by the daily cap).
- `com.answerbrief.career-os-browser-companion` launchd agent exists at
  `~/Library/LaunchAgents/com.answerbrief.career-os-browser-companion.plist`
  (RunAtLoad, KeepAlive) but was NOT loaded during this session. It runs
  `scripts/run-career-os-browser-companion.sh`, which sources `.env.local` and
  starts the worker in `start` (continuous poll) mode. If it auto-loads at
  next login before the local API server (port 3210) is started, it will
  retry harmlessly every ~15s until the server is up.

## Queue state

- Global queue pause is in effect (`CAREER_OS_QUEUE_ENABLED` unset/`0`) —
  intentional, left untouched. All applications remain paused **except**
  those with an explicit per-row resume flag
  (`explicit_resume_requested_at` / `human_step_completed_at` /
  `blocker_resolved_at` in `raw_record`), which bypass the pause
  individually.
- Two rows currently carry that bypass flag:
  - `app-auto-workday-capital-one-r247908` (Capital One) — our canary.
  - `20260719T035639Z-cisco-senior-director-cx-product-management` (Cisco) —
    **not** touched; excluded by the `CAREER_OS_WORKDAY_CANARY_ID` mismatch
    gate in `workday_single_canary` mode (and today also independently
    blocked by the daily cap). Cisco's `updated_at` sentinel
    (`2000-01-01T00:00:00Z`) is one second *earlier* than Capital One's
    (`2000-01-01T00:00:01Z`), so by raw claim order Cisco is evaluated
    first — but it can never be claimed under the current canary
    restriction, regardless of order.
- No duplicate rows exist for this same Capital One requisition (checked by
  requisition id `R247908` / `canonical_job_posting_id
  workday-capital-one-r247908` — only one row). The `workday_single_canary`
  "exactly one qualified canary candidate" and "no duplicate same-job"
  checks both pass cleanly.
- Greenhouse applications are deferred (no browser action) under
  `workday_single_canary` mode; untouched today.

## Canary application

- **ID:** `app-auto-workday-capital-one-r247908`
- **Employer / role:** Capital One — Director, Product Management - PULSE ATM
  Experience (Houston, TX; req R247908)
- **Exact Workday URL** (also set as `CAREER_OS_WORKDAY_CANARY_URL`):
  `https://capitalone.wd12.myworkdayjobs.com/en-US/Capital_One/job/Houston%2C-TX/Director--Product-Management---PULSE-ATM-Experience_R247908-1/apply`
- **Verified voluntary-disclosure answers already stored** on this row
  (`raw_record.verified_answers`, source `tomas_direct_approval`,
  verified_at 2026-08-04 22:01:56 UTC) — no need to re-collect:
  - Gender: Male
  - Race/ethnicity: Hispanic or Latino
  - Protected veteran status: No
- `lifecycle_stage: queued`, `next_action`: "Resume Capital One Workday at
  voluntary disclosures using verified answers, then continue to review and
  submit."
- Data fix applied today: `raw_record.production_outcome` was stale
  (`unsupported_workday_state`, left over from a July 28 run) and was
  blocking `isProductionQualified()`. Corrected to `queued` via a direct,
  minimal Supabase PATCH of only that one field on only this one row.
  Re-verified intact after both incidents above (server-side state, not
  affected by local file wipes).

## Environment configuration (`.env.local`, secrets redacted)

```
APP_BASE_URL=http://127.0.0.1:3210
NEXT_PUBLIC_BASE_URL=http://127.0.0.1:3210
SUPABASE_URL=https://vhrzuhkzxevlhhvlulgx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<real value, sb_secret_... — do not log elsewhere>
CAREER_OS_OWNER_EMAIL=tomas@nieves.com
CAREER_OS_EXECUTION_MODE=workday_single_canary
CAREER_OS_WORKDAY_CANARY_ID=app-auto-workday-capital-one-r247908
CAREER_OS_WORKDAY_CANARY_URL=https://capitalone.wd12.myworkdayjobs.com/en-US/Capital_One/job/Houston%2C-TX/Director--Product-Management---PULSE-ATM-Experience_R247908-1/apply
CAREER_OS_DAILY_LIMIT=28
CAREER_OS_BROWSER_WORKER_TOKEN=<real value, freshly generated for local-only auth>
```

Notes on deviations from the original file (all reversible, all documented):

- `APP_BASE_URL`/`NEXT_PUBLIC_BASE_URL` were `https://www.answer-brief.com`
  (production Vercel) — changed to the local server so this whole exercise
  runs self-contained against a local API, not production Vercel infra. Real
  Supabase production data is still used (same database).
- `SUPABASE_URL` had a stray `/rest/v1/` suffix (would have double-appended
  REST paths) — fixed to the bare project URL.
- `SUPABASE_SERVICE_ROLE_KEY` was corrupted (held a URL, not a key) — replaced
  with the real key from Supabase dashboard (provided via clipboard, never
  printed to any log).
- `CAREER_OS_BROWSER_WORKER_TOKEN` did not exist — generated fresh
  (`openssl rand -hex 32`), used only between this local worker and this local
  server. Not (and does not need to be) present in Vercel.
- `CAREER_OS_EXECUTION_MODE` was `workday_first_submit` — switched to
  `workday_single_canary` for today's verification run because
  `workday_first_submit` has **standing auto-submit authorization** (would
  click Submit on reaching review with no additional approval).
  `workday_single_canary` requires an exact review-fingerprint match via
  `CAREER_OS_WORKDAY_SUBMIT_APPROVAL` (intentionally not set) before any
  submit click, and restricts claiming to exactly
  `CAREER_OS_WORKDAY_CANARY_ID`.
- `CAREER_OS_DAILY_LIMIT` was raised from unset(5) → 6 → 28 while diagnosing
  the daily-cap blocker. The user approved 28 explicitly. This is an env
  var, not a code change, and it is clamped by a **hard-coded** ceiling of
  25 in `lib/career-os-browser-worker.ts` (`productionDailyLimit()`), which
  was left untouched per explicit instruction not to modify production
  safety guardrails.

## Current blocker (today only)

`productionDailyLimit()` hard-caps at **25/day regardless of env var value**
(`Math.min(Math.floor(value), 25)` in `lib/career-os-browser-worker.ts`).
Real production already processed **27 applications today** (confirmed via a
direct Supabase count replicating the exact `productionProcessedToday()`
logic — includes several other real Capital One reqs: r247904, r247559,
r247078, r248227, r247665 — this is genuine daily volume, not a bug). This
cap cannot be raised past 25 via configuration; the only way past it would be
editing the hard-coded ceiling itself, which was explicitly ruled out today.

**This is a same-day-only blocker.** The counter is based on local calendar
day (`startOfLocalDayMs()`), so it resets automatically at local midnight.

## Remaining blockers (other than the daily limit)

None currently known. Specifically verified clear today:

1. `isProductionQualified()` — was blocking on stale
   `production_outcome: unsupported_workday_state`; fixed (see above).
2. `classifyPhaseTwoWorkdayBlocker()` phase-two gate — bypassed cleanly by the
   existing `explicit_resume_requested_at` flag on this row (same bypass that
   un-pauses the queue for it); confirmed via code read, no phase-two blocker
   classification is stored on this row anyway.
3. Workday identity parsing (`workdayJobIdentity`) — manually traced through
   `lib/career-os-browser-worker.ts`'s parser against both
   `application_url` and `CAREER_OS_WORKDAY_CANARY_URL` (identical values);
   both resolve to `tenant=capitalone.wd12, jobId=R247908-1`. Match confirmed.
4. "Exactly one qualified canary candidate" / "no duplicate same job" checks —
   confirmed via direct Supabase query: no other row references this
   requisition (`R247908` / `workday-capital-one-r247908`).
5. Cisco / Greenhouse cannot be touched under the current mode regardless of
   claim ordering (see "Queue state" above).

The only thing standing between this canary and an actual claim attempt is
the daily-cap reset at local midnight.

## What happens after the canary is verified/submitted

Once a real run reaches final review and (on a future, explicitly-authorized
run) submits successfully, the intent is to return the system to its normal
broader Workday automation rather than stay pinned to a single-application
canary forever. The natural next step (not done automatically, requires a
manual look at the result first) is to change
`CAREER_OS_EXECUTION_MODE` back to `workday_first_submit` (its original
value before today) and clear/remove `CAREER_OS_WORKDAY_CANARY_ID` /
`CAREER_OS_WORKDAY_CANARY_URL`, so the worker resumes processing additional
qualified Workday applications one at a time under the existing daily-limit,
duplicate-lock, and human-gate safety controls — no new code needed, this is
already how the system behaved before today's canary-specific narrowing.
