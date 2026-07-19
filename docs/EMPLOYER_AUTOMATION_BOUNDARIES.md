# Employer Automation Boundaries

## Permitted Work

Career OS may progress employer workflows only through permitted, ordinary user-facing paths or official APIs. It may create or reuse employer profiles, fill verified reusable information, upload approved resumes, answer verified questions, submit under the configured policy, and capture confirmation evidence.

## Prohibited Work

Career OS must not:

- bypass CAPTCHA;
- bypass MFA;
- bypass identity verification;
- bypass access controls;
- ignore employer restrictions on automation;
- fabricate legal or factual answers;
- store passwords in plaintext;
- submit when policy requires review;
- submit with missing legal facts;
- submit with unsupported candidate claims.

## Human-Only Gates

Only these conditions qualify:

- CAPTCHA;
- MFA requiring Tomas's device or action;
- identity verification;
- employer account recovery inaccessible to the environment;
- a missing legal or factual answer not already stored in the verified profile;
- an employer platform that explicitly prevents the supported automation path;
- a production credential that cannot be restored through any available supported authentication mechanism.

## Human Action Design

Create a Tomas action only after every supported preceding step is complete.

A valid action must state:

- role and employer;
- fit score;
- what Career OS already completed;
- exact remaining step;
- why Tomas is required;
- estimated time;
- destination or deep link;
- what the system will do automatically afterward.

Do not use vague labels such as Continue, Resolve blocker, Confirm employer item, Update status, Other choices, or Mark complete when completion can be detected.

## Adapter Evidence

Adapter runs must capture platform, capability map, state transitions, uploaded document evidence, answered-question evidence, gate evidence, submission evidence, retry state, idempotency key, and audit timestamps.
