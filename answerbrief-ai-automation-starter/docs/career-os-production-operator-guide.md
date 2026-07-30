# Career OS Production Operator Guide

Controlled launch defaults are intentionally conservative. The browser worker does not process queue rows unless `CAREER_OS_QUEUE_ENABLED=1`, and ATS automation does not run unless `CAREER_OS_EXECUTION_MODE` is one of `inspect_only`, `assisted_apply`, `workday_single_canary`, or `submit_enabled`.

## Modes

- `inspect_only`: safe inspection only. No employer-site submit actions are allowed.
- `assisted_apply`: Workday-assisted inspection/fill boundary. Career OS stops before submit and records a user decision item.
- `workday_single_canary`: one Workday task only. Career OS may inspect, upload the approved resume, fill authorized answer-bank fields, navigate pages, and stop at final review unless an exact review fingerprint is approved.
- `submit_enabled`: Greenhouse canary submit only. This mode requires `CAREER_OS_GREENHOUSE_CANARY_APPLICATION_ID` and `CAREER_OS_SUBMIT_RUN_AUTHORIZATION`.

## Controlled Launch Defaults

- Daily browser-worker limit: `CAREER_OS_DAILY_LIMIT=5`.
- Greenhouse submit canary limit: `CAREER_OS_GREENHOUSE_SUBMIT_CANARY_LIMIT=1`.
- Workday broad submission is disabled. Workday `submit_enabled` is rejected; only `workday_single_canary` can reach final review, and submit still requires an exact review fingerprint.
- Unsupported ATS platforms are marked manual-required.
- Oracle is forbidden in the production capability matrix.

## Greenhouse Canary

1. Confirm the application is qualified, duplicate-free, and has an active Greenhouse URL.
2. Set `CAREER_OS_QUEUE_ENABLED=1`.
3. Set `CAREER_OS_EXECUTION_MODE=submit_enabled`.
4. Set `CAREER_OS_GREENHOUSE_CANARY_APPLICATION_ID=<career_os_applications.id>`.
5. Set `CAREER_OS_SUBMIT_RUN_AUTHORIZATION=<operator-approved-run-id>`.
6. Run `npm run health:career-os`.
7. Run one worker pass with `npm run worker:run-once`.
8. Review confirmation evidence, screenshot path, and `raw_record.production_outcome`.

Stop after the first Greenhouse canary. Do not leave `submit_enabled` active without a configured canary id and authorization.

## Workday Assisted Run

1. Set `CAREER_OS_QUEUE_ENABLED=1`.
2. Set `CAREER_OS_EXECUTION_MODE=assisted_apply`.
3. Run `npm run health:career-os`.
4. Run one worker pass with `npm run worker:run-once`.
5. Review the `inspected_assisted` report and user decision queue item.

Do not provide credentials, create accounts, solve MFA/CAPTCHA, or submit a Workday application through automation.

## Workday Single Canary

1. Validate the real URL without writing production data:

```bash
npm run workday:canary -- inspect-url "https://example.wd5.myworkdayjobs.com/en-US/External/job/Product-Manager_JR123"
```

2. If the URL is the one approved canary and no duplicate application exists, create the task through the production intake helper:

```bash
npm run workday:canary -- intake \
  --url "https://example.wd5.myworkdayjobs.com/en-US/External/job/Product-Manager_JR123" \
  --canary-id "<career_os_applications.id>" \
  --employer "<Employer>" \
  --position "<Position>" \
  --write
```

3. Arm only that task:

```bash
export CAREER_OS_QUEUE_ENABLED=1
export CAREER_OS_EXECUTION_MODE=workday_single_canary
export CAREER_OS_WORKDAY_CANARY_ID="<career_os_applications.id>"
export CAREER_OS_WORKDAY_CANARY_URL="<exact Workday URL>"
npm run health:career-os
npm run worker:run-once
```

4. If Workday asks for sign-in, account creation, email code, email verification, legal acknowledgement, voluntary disclosure, CAPTCHA, or a missing answer, complete that human step manually and resume only the same canary.
5. When Career OS reports `review_ready`, review the live Workday page. If and only if the application is correct, set the exact fingerprint from the report:

```bash
export CAREER_OS_WORKDAY_SUBMIT_APPROVAL="wdrev_<fingerprint>"
npm run health:career-os
npm run worker:run-once
```

Career OS performs at most one Workday submit click for that exact review fingerprint, then records `submitted_confirmed` or `submission_uncertain`. Do not leave `CAREER_OS_WORKDAY_SUBMIT_APPROVAL` set after the run.

If no real qualified Workday URL is available, leave `CAREER_OS_QUEUE_ENABLED` unset or `0`; the correct operating status is `PRODUCTION READY — WAITING FOR WORKDAY CANARY URL`.

## Outcome Statuses

Career OS records these production outcomes in `raw_record.production_outcome` when applicable:

- `submitted_confirmed`
- `completed_waiting_for_user`
- `inspected_assisted`
- `waiting_for_sign_in`
- `waiting_for_account_creation`
- `waiting_for_email_code`
- `waiting_for_email_verification`
- `waiting_for_user_decision`
- `waiting_for_manual_upload`
- `assisted_in_progress`
- `review_ready`
- `submission_uncertain`
- `unsupported_workday_state`
- `duplicate_skipped`
- `unsupported_manual_required`
- `retryable_failure`
- `terminal_failure`
- `not_qualified`
- `canary_stopped`

Decision queue entries are stored in `raw_record.user_decision_queue` with job identity, ATS, tenant, URL, field label, reason, proposed allowed answer, provenance, confidence, sensitivity, required action, resume point, and timestamp.

## Daily Report

At the end of a controlled run, use:

```bash
npm run report:career-os
```

Record:

- Total rows inspected by the browser worker.
- Greenhouse submitted and confirmed.
- Workday inspected/assisted.
- Duplicates skipped.
- Unsupported/manual-required rows.
- Waiting-on-user rows by reason.
- Retryable and terminal failures.
- Canary stopped count.
- The active execution mode and queue setting.
