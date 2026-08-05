# Resume the Capital One Workday Canary

Full context: `.career-os-backups/2026-08-04-workday-capital-one-r247908-canary-checkpoint.md`

## Why this file exists

Today (2026-08-04) the local environment was repaired end-to-end (auth
token, Supabase key, local server) and the Workday canary for
`app-auto-workday-capital-one-r247908` (Capital One, PULSE ATM Experience,
Houston TX) was fully staged: its exact Workday URL, its stale
`production_outcome` data bug, and every other production gate were checked
and confirmed clear. The **only** remaining blocker is a hard-coded 25/day
production safety cap (`lib/career-os-browser-worker.ts`,
`productionDailyLimit()`) that production already hit today (27 real
applications processed). That cap was intentionally **not** modified or
bypassed. It resets automatically at local midnight, so this resumes
tomorrow with zero re-setup.

`.env.local` already has every setting needed — you do not need to re-enter
the verified voluntary-disclosure answers (gender, race/ethnicity, veteran
status); those are stored on the application record in Supabase
(`raw_record.verified_answers`), not re-collected at runtime.

**This file, the checkpoint doc, and `scripts/resume-capital-one-canary.sh`
are committed to git** specifically so they survive the runtime-sync jobs
described below (an earlier local-only copy of each was deleted twice during
today's session by unrelated scheduled CI runs before this was committed).

## Known recurring risk (partially fixed today)

Several scheduled GitHub Actions workflows periodically `rsync --delete`
this exact directory from a fresh checkout of `main`. `.env.local`, `.next/`,
and `.career-os-browser-worker/` are now correctly excluded everywhere
(fixed in `career-os-job-inbox.yml` today, commit `130e229`; the other
workflows already excluded them). **Any other new, uncommitted file placed
directly in this runtime directory can still be deleted by these syncs** —
that's why this file and its companions are committed to git rather than
left as local-only artifacts. If you create new local-only scratch files
here, put them under `.career-os-browser-worker/` (gitignored and excluded
everywhere) rather than elsewhere in the tree.

## One command to resume

```bash
cd "/Users/tomasnieves/Library/Application Support/CareerOSCompanionRuntime/answerbrief-ai-automation-starter"
./scripts/resume-capital-one-canary.sh
```

This single script:
1. Frees port 3210 if anything stale is listening.
2. Rebuilds the app (`npm run build`).
3. Starts the local Career OS API on `http://127.0.0.1:3210` and waits for it
   to report healthy.
4. Runs `npm run worker:health` (should show `ok: true`, `configured: true`,
   `executionMode: workday_single_canary`, `workdayCanaryIdConfigured: true`).
5. Runs `node ./scripts/career-os-browser-companion.mjs run-once` — a single
   claim attempt. If the daily-cap has rolled over, this should claim
   `app-auto-workday-capital-one-r247908`, launch a (headless) browser,
   resume from the Workday session/checkpoint, and drive to the final
   review page. It will **not** submit — `workday_single_canary` mode only
   submits when `CAREER_OS_WORKDAY_SUBMIT_APPROVAL` is set to the exact
   review fingerprint it reports, which is intentionally not set.
6. Runs `npm run worker:health` again so you can see the resulting state.

If `.env.local` happens to be missing when you run this (e.g. a sync job
raced ahead of this fix, or you're on a fresh checkout), recreate it from
the "Environment configuration" section of
`.career-os-backups/2026-08-04-workday-capital-one-r247908-canary-checkpoint.md`
before running the script.

## Verification steps after running it

1. **Claimed?** Check the `run-once` output: `{"claimed": true}` means it
   picked up the canary. `{"claimed": false}` after the cap should have
   reset means something new is blocking it — re-run the dry-run check below
   to see the exact skip reason.
2. **Reached review without submitting?** Query the application row:
   ```bash
   set -a; source .env.local; set +a
   curl -s "${SUPABASE_URL}/rest/v1/career_os_applications?select=lifecycle_stage,next_action,raw_record->>execution_status,raw_record->browser_worker_last_report&id=eq.app-auto-workday-capital-one-r247908" \
     -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" | python3 -m json.tool
   ```
   Look for `browser_worker_last_report.status: "review_ready"` and
   `details.submitBlocked: true` — that confirms it reached final review and
   stopped, exactly as intended.
3. **Screenshots**: check
   `.career-os-browser-worker/screenshots/app-auto-workday-capital-one-r247908-*`
   for the most recent `workday-review-ready` image, and visually confirm
   the three voluntary-disclosure fields show:
   - Protected veteran status: No
   - Gender: Male
   - Race/ethnicity: Hispanic or Latino
4. **Dry-run / debug check** (does not claim anything if nothing is
   eligible; only claims for real if something genuinely is — same
   semantics as the real claim call, so only run this if you haven't already
   run the script above and want to check status first):
   ```bash
   set -a; source .env.local; set +a
   curl -s -X POST http://127.0.0.1:3210/api/career-os/worker/claim \
     -H "Authorization: Bearer ${CAREER_OS_BROWSER_WORKER_TOKEN}" \
     -H "Content-Type: application/json" \
     -d '{"companionId":"Mac-career-os-companion","debugClaim":true,"ownerEmail":"tomas@nieves.com","productionExecutionMode":"workday_single_canary"}' \
     | python3 -m json.tool
   ```

## After the canary is verified (do not do this until you've reviewed the result)

To let the worker continue processing *additional* qualified Workday
applications one at a time (not just this one canary), switch back to the
system's normal broader mode:

```
CAREER_OS_EXECUTION_MODE=workday_first_submit
```
and remove/comment out `CAREER_OS_WORKDAY_CANARY_ID` and
`CAREER_OS_WORKDAY_CANARY_URL` in `.env.local`. This restores the exact
configuration that was in place before today's canary-specific narrowing —
no code changes needed. All existing safety controls (daily limit, duplicate
lock, human-only gates, phase-two blockers) still apply exactly as before.

Note: `workday_first_submit` mode has **standing authorization to submit
automatically** once it reaches review — only switch to it once you're ready
for the worker to actually submit qualified Workday applications, not just
inspect them.

## What was NOT done today (by design)

- No application was submitted.
- The hard-coded 25/day safety ceiling was not modified or bypassed.
- Greenhouse and Cisco applications were not touched (Cisco is excluded by
  the canary-ID mismatch gate regardless of queue order; Greenhouse is
  deferred entirely under `workday_single_canary` mode).
- No other application besides `app-auto-workday-capital-one-r247908` can be
  claimed under the current `.env.local` configuration.
