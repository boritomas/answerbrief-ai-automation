Checkpoint before adding the controlled Workday sign-in early-return guard.

Base commit: d614d0b2e374b4f3caf607e0a0ef2bc1e901ed21
Target: answerbrief-ai-automation-starter/scripts/lib/career-os-controlled-browser.mjs
Reason: CDP already proves one expected-tenant Workday sign-in page, but verifyControlledWorkdayTab still attempts Playwright attachment and can convert the valid sign-in state into a false CDP failure.
Planned implementation: idempotent source hotfix applied in prebuild and pretest before validation.
