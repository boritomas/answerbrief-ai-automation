Approved production-canary trigger.

Base commit: 83f3e76c9eb58add5481e5352a2c3ba46041ce84
Purpose: trigger the self-hosted Mac production workflow against the latest main state after disk cleanup, empty-queue recovery, and runtime-portable validation fixes.
Success requires disk cleanup, typecheck, lint, ATS/control-plane tests, discovery refresh, one claimed task, supervisor completion, and uploaded production evidence.
