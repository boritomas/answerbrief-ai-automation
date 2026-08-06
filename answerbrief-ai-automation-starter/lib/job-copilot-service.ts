// JobCopilotService: the orchestration/intelligence layer above CareerOS.
//
// CareerOS is the execution engine (ATS adapters, browser worker, the
// application queue state machine). Job Copilot's job is narrower: run
// discovery, normalize postings into the canonical shape, surface the
// already-computed fit score and qualification, hold qualified postings in
// a review queue, and hand a *human-approved* posting off to CareerOS.
//
// Every step below composes existing, already-production functions -- it
// does not reimplement discovery, scoring, the compensation-floor gate, or
// the queue state machine:
//   - buildCareerOsDiscoveryPlan (career-os-market-universe.ts)
//   - fetchWorkdaySourceResults / fetchGreenhouseSourceBatches /
//     fetchOracleSourceResults, normalizeWorkdayPosting / normalizePosting /
//     normalizeOraclePosting, dedupePostings, qualifiesForCurrentProductionLane
//     (career-os-daily-cycle.ts -- exported for this reuse, no logic changed)
//   - approveReviewedJobPosting (career-os-review-approval.ts -- extracted
//     from the existing founder-dashboard approve-role route, same behavior)
//   - toCanonicalJob (career-os-canonical-job.ts)
//
// Deliberately NOT reused: runDailyGreenhouseDiscovery's auto-promotion and
// auto package-generation tail (buildAutoApplyPromotionRows /
// buildAutoApplyPackageArtifacts). This service stops at persisting
// qualified postings to the review queue -- it never creates or promotes a
// career_os_applications row on its own. handoffToCareerOS() only ever acts
// on a posting a human has already approved (a valid, verified action
// token is required), and even then it only marks the row `queued` --
// exactly what the existing approve-role flow already does. Nothing in this
// file calls the queue processor, the browser worker, or any ATS adapter,
// so nothing here can submit a live application.
import { buildCareerOsDiscoveryPlan } from './career-os-market-universe';
import {
  AUTO_APPLY_PROMOTION_THRESHOLD,
  dedupePostings,
  fetchGreenhouseSourceBatches,
  fetchOracleSourceResults,
  fetchWorkdaySourceResults,
  normalizeOraclePosting,
  normalizePosting,
  normalizeWorkdayPosting,
  qualifiesForCurrentProductionLane,
} from './career-os-daily-cycle';
import { toCanonicalJob, type CanonicalJob } from './career-os-canonical-job';
import {
  approveReviewedJobPosting,
  type ApproveReviewedJobPostingResult,
} from './career-os-review-approval';
import { careerOsSelectRows, careerOsUpsertRows } from './career-os-supabase';

type JsonRecord = Record<string, unknown>;

export type JobCopilotDiscoveryOptions = {
  /** Bounded on purpose -- this is a single orchestrated slice run, not the full daily cron's board sweep. */
  maxGreenhouseBoards?: number;
  minFitScore?: number;
};

export type JobCopilotDiscoveryResult = {
  errors: string[];
  jobs: CanonicalJob[];
  postingsPersisted: number;
  postingsReviewed: number;
  sourceRunId: string;
};

export type JobCopilotReviewQueueOptions = {
  limit?: number;
  minFitScore?: number;
};

export type JobCopilotHandoffInput = {
  actionToken?: string;
  actionTokenExpiresAt?: string;
  employer?: string;
  opportunityId: string;
};

const DEFAULT_MAX_GREENHOUSE_BOARDS = 5;

export class JobCopilotService {
  private readonly ownerEmail: string;

  constructor(ownerEmail: string) {
    if (!ownerEmail?.trim()) throw new Error('JobCopilotService requires an ownerEmail.');
    this.ownerEmail = ownerEmail.trim();
  }

  /**
   * Discovery -> normalization -> fit score (computed inside the reused
   * normalize* functions) -> persistence to the review queue
   * (career_os_job_postings). Stops there -- never promotes to an
   * application, never generates a resume/cover-letter package.
   */
  async discover(options: JobCopilotDiscoveryOptions = {}): Promise<JobCopilotDiscoveryResult> {
    const executedAt = new Date().toISOString();
    const minFitScore = options.minFitScore ?? AUTO_APPLY_PROMOTION_THRESHOLD;
    const maxGreenhouseBoards = Math.max(0, options.maxGreenhouseBoards ?? DEFAULT_MAX_GREENHOUSE_BOARDS);
    const sourceRunId = `job-copilot-discovery-${deterministicSlug(this.ownerEmail)}-${executedAt}`;
    const errors: string[] = [];
    let reviewed = 0;

    const discoveryPlan = buildCareerOsDiscoveryPlan({});
    const boards = discoveryPlan.greenhouseBoards.slice(0, maxGreenhouseBoards);

    const [workdayResults, greenhouseResults, oracleResults] = await Promise.all([
      fetchWorkdaySourceResults(discoveryPlan),
      fetchGreenhouseSourceBatches(discoveryPlan, boards),
      fetchOracleSourceResults(discoveryPlan),
    ]);

    const postings: JsonRecord[] = [];

    for (const result of workdayResults) {
      if (result.error) errors.push(`${result.source.employer}: ${result.error}`);
      reviewed += result.jobs.length;
      for (const job of result.jobs) {
        postings.push(normalizeWorkdayPosting(this.ownerEmail, job, executedAt, sourceRunId, minFitScore, result.source));
      }
    }

    for (const result of greenhouseResults) {
      if (result.status === 'rejected') {
        errors.push(result.reason instanceof Error ? result.reason.message : String(result.reason));
        continue;
      }
      const { board, source } = result.value;
      reviewed += result.value.jobs.length;
      for (const job of result.value.jobs) {
        postings.push(normalizePosting(this.ownerEmail, board, job, executedAt, sourceRunId, minFitScore, source));
      }
    }

    for (const result of oracleResults) {
      if (result.error) errors.push(`${result.source.employer}: ${result.error}`);
      reviewed += result.jobs.length;
      for (const job of result.jobs) {
        postings.push(normalizeOraclePosting(this.ownerEmail, job, executedAt, sourceRunId, minFitScore, result.source));
      }
    }

    const dedupedPostings = dedupePostings(postings)
      .sort((a, b) => numberValue(b.fit_score) - numberValue(a.fit_score));

    if (dedupedPostings.length) {
      await careerOsUpsertRows('career_os_job_postings', dedupedPostings);
    }

    return {
      errors,
      jobs: dedupedPostings.map((posting) => toCanonicalJob(posting, minFitScore)),
      postingsPersisted: dedupedPostings.length,
      postingsReviewed: reviewed,
      sourceRunId,
    };
  }

  /**
   * Postings that already qualify for review (same gate the production
   * discovery pipeline uses -- qualifiesForCurrentProductionLane) and have
   * not yet been reviewed. This is the queue a human reviews before any
   * CareerOS handoff happens.
   */
  async reviewQueue(options: JobCopilotReviewQueueOptions = {}): Promise<CanonicalJob[]> {
    const minFitScore = options.minFitScore ?? AUTO_APPLY_PROMOTION_THRESHOLD;
    const limit = Math.max(1, Math.min(options.limit ?? 50, 200));
    const rows = await careerOsSelectRows(
      'career_os_job_postings',
      `select=*&owner_email=eq.${encodeURIComponent(this.ownerEmail)}&order=fit_score.desc&limit=${limit}`,
    ) as JsonRecord[];

    return rows
      .filter((posting) => qualifiesForCurrentProductionLane(posting, minFitScore))
      .filter((posting) => toCanonicalJob(posting, minFitScore).reviewState === 'pending_review')
      .map((posting) => toCanonicalJob(posting, minFitScore));
  }

  /**
   * Review-only execution: hands a specific, already human-approved posting
   * off to CareerOS. Requires a valid action token (the same authorization
   * the founder dashboard's Approve button requires) -- there is no path in
   * this service that promotes a posting without one. This marks the
   * resulting application `queued`; it never invokes the queue processor,
   * the browser worker, or any ATS adapter, so it can never itself submit a
   * live application.
   */
  async handoffToCareerOS(input: JobCopilotHandoffInput): Promise<ApproveReviewedJobPostingResult> {
    return approveReviewedJobPosting({
      actionToken: input.actionToken,
      actionTokenExpiresAt: input.actionTokenExpiresAt,
      employer: input.employer,
      opportunityId: input.opportunityId,
      ownerEmail: this.ownerEmail,
      reviewSource: 'job_copilot_service',
    });
  }
}

function numberValue(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function deterministicSlug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
