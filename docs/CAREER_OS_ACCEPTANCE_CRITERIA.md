# Career OS Acceptance Criteria

## Production Completion Gate

`./scripts/verify-career-os-mission` must exit 0 before anyone may claim the Career OS mission is complete.

## Required Production Evidence

Completion requires all of the following:

- clean required build state;
- repository-required tests pass;
- lint passes;
- type checks pass;
- production build passes;
- migrations are valid when present;
- RLS tests pass when Supabase is configured;
- Candidate Master Profile exists and validates;
- at least one permitted real job source is configured and has a successful current run;
- at least one real current opportunity was discovered;
- posting identity and source evidence exist;
- AnswerBrief analyses exist for the pilot;
- targeted resume artifact exists;
- targeted resume artifact opens or passes file validation;
- application package exists;
- Drive delivery exists when configured;
- employer execution was attempted through a real adapter;
- employer workflow evidence exists;
- resume upload evidence exists when the workflow reached that step;
- verified application answers were used;
- the workflow reached confirmed submission or a documented qualifying human-only gate;
- the live application reports factual state;
- daily automation invokes the same real pipeline;
- no duplicate application was created;
- remote commit contains the changes;
- production deployment corresponds to that commit;
- production health endpoints pass;
- authenticated browser verification evidence exists.

## Synthetic Acceptance Tests

Tests under `tests/acceptance/` use synthetic data only. They must cover:

- real-source adapter contract;
- posting normalization;
- duplicate prevention;
- expired-job rejection;
- Candidate Master Profile validation;
- unsupported-fact rejection;
- ATS scoring;
- AI readiness;
- recruiter scoring;
- requirement-to-evidence mapping;
- targeted resume generation;
- resume artifact availability;
- contradiction detection;
- Drive package creation;
- employer adapter state transitions;
- resume upload path;
- verified-answer population;
- human-only gate detection;
- application-mode enforcement;
- automatic resume after a gate;
- submission evidence handling;
- duplicate-application prevention;
- daily-run idempotency;
- RLS contract;
- cross-user isolation;
- admin authorization;
- cost and model-use recording;
- existing AnswerBrief interview regression;
- live-site status response;
- live-site snapshot response.

Synthetic tests support engineering quality. They cannot satisfy the real pilot.

## Pilot Standard

The real production pilot must reach confirmed submission or a verified unavoidable human-only gate after every prior supported step is complete.

It is not complete if it stops at opportunity found, package prepared, resume draft created, workspace prepared, employer identified, task created, status changed, or application card displayed.
