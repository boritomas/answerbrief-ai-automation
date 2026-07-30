# Career OS Production Rollback

Use this rollback when the controlled browser companion behaves unexpectedly, reports unsafe ATS policy state, or touches more than the intended canary row.

## Immediate Stop

1. Stop the worker process.
2. Set `CAREER_OS_QUEUE_ENABLED=0`.
3. Remove or clear `CAREER_OS_SUBMIT_RUN_AUTHORIZATION`.
4. Remove or clear `CAREER_OS_GREENHOUSE_CANARY_APPLICATION_ID`.
5. Set `CAREER_OS_EXECUTION_MODE=inspect_only`.
6. Run `npm run health:career-os` and confirm `submit_enabled` is disabled.

## Runtime Restore

Runtime sync creates a timestamped backup under the active runtime before files are copied. To restore:

1. Stop the worker process.
2. Copy the most recent backup contents back into the runtime root.
3. Preserve the current `.env.local` only if it contains the intended safe controls; otherwise restore the backed-up `.env.local`.
4. Run `node --check scripts/career-os-browser-companion.mjs`.
5. Run `npm run health:career-os`.

## Git Restore

The controlled-launch code is committed as a single feature commit. To inspect or revert in a development worktree:

```bash
git show --stat HEAD
git revert HEAD
npm run test:ats
npm run build
```

Do not force-push or reset shared work. Prefer a revert commit so the rollback is auditable.

## Data Cleanup

For any row touched by a failed launch:

- Preserve screenshots and workflow events.
- Mark submitted rows terminal only when confirmation evidence exists.
- Mark uncertain employer states as `completed_waiting_for_user`.
- Mark unsupported ATS rows as `unsupported_manual_required`.
- Add a user decision queue item when Tomas must review salary, sponsorship, relocation, legal, arbitration, background, demographic, disability, veteran, conflict, criminal, unknown, low-confidence, login, account, MFA, or CAPTCHA steps.
