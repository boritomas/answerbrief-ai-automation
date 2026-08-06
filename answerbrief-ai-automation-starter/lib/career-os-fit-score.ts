// Typed entry point for the shared fit-score engine.
//
// The canonical scoring logic lives in ../scripts/lib/career-os-fit-score.mjs
// rather than here, because scripts/lib/career-os-linkedin-discovery.mjs runs
// under plain `node` in production (npm run linkedin:discover) with no
// TypeScript loader registered, so it cannot import a .ts module at runtime.
// This file just re-exports typed bindings for TypeScript callers such as
// lib/career-os-daily-cycle.ts, matching the existing convention already used
// for ../scripts/lib/career-os-compensation-policy.mjs.
export {
  FIT_SCORE_VERSION,
  scoreJobPosting,
  scoreOracleJobPosting,
  scoreLinkedInJobRecord,
} from '../scripts/lib/career-os-fit-score.mjs';
