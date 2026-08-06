// The Job Copilot orchestration layer's read model for a discovered job.
//
// This is intentionally a thin, typed view over the existing
// `career_os_job_postings` row shape produced by the discovery/normalization
// pipeline in career-os-daily-cycle.ts (normalizePosting /
// normalizeWorkdayPosting / normalizeOraclePosting) and by the LinkedIn
// discovery pipeline (scripts/lib/career-os-linkedin-discovery.mjs). It does
// not compute anything new -- fit score and qualification are already
// computed at discovery time by the existing scoring/compensation-policy
// modules; this module only reads and reshapes those existing values into a
// clean, camelCase model Job Copilot can present without callers needing to
// know the internal `raw_record` posting shape.
import { qualifiesForCurrentProductionLane, AUTO_APPLY_PROMOTION_THRESHOLD } from './career-os-daily-cycle';

export type JsonRecord = Record<string, unknown>;

export type CanonicalJobReviewState = 'approved' | 'pending_review' | 'rejected';

export type CanonicalJobQualification = {
  /** Mirrors classifyCompensationPolicy's status for this posting (e.g. comp_meets_floor, comp_below_floor_reject). */
  compensationPolicyStatus: string;
  /** Reuses qualifiesForCurrentProductionLane -- the same gate the production discovery pipeline applies. */
  qualifiesForReview: boolean;
};

export type CanonicalJob = {
  /** Same id used in career_os_job_postings -- stable across discovery re-runs via canonicalOpportunityIdentity-derived dedupe keys upstream. */
  id: string;
  atsPlatform: string;
  canonicalUrl: string;
  compensationMaxUsd: number | null;
  compensationMinUsd: number | null;
  compensationText: string;
  createdAt: string;
  /** The discovery-time posting status (discovered / qualification_pending / poor_fit / ineligible / ineligible_location). */
  discoveredStatus: string;
  employer: string;
  externalRequisitionId: string;
  fitScore: number;
  lastCheckedAt: string;
  location: string;
  ownerEmail: string;
  qualification: CanonicalJobQualification;
  reviewState: CanonicalJobReviewState;
  sourceCategory: string;
  sourceRunId: string;
  title: string;
  updatedAt: string;
  workArrangement: string;
};

export function toCanonicalJob(posting: JsonRecord, minFitScore: number = AUTO_APPLY_PROMOTION_THRESHOLD): CanonicalJob {
  const raw = asRecord(posting.raw_record);
  const fitScore = numberValue(posting.fit_score);
  return {
    id: stringValue(posting.id),
    atsPlatform: stringValue(posting.ats_platform ?? raw.ats_platform),
    canonicalUrl: stringValue(posting.canonical_url),
    compensationMaxUsd: nullableNumber(posting.compensation_max_usd),
    compensationMinUsd: nullableNumber(posting.compensation_min_usd),
    compensationText: stringValue(posting.compensation_text),
    createdAt: stringValue(posting.created_at),
    discoveredStatus: stringValue(posting.status),
    employer: stringValue(posting.company) || 'Employer',
    externalRequisitionId: stringValue(posting.external_requisition_id),
    fitScore,
    lastCheckedAt: stringValue(posting.last_checked_at),
    location: stringValue(posting.location),
    ownerEmail: stringValue(posting.owner_email),
    qualification: {
      compensationPolicyStatus: stringValue(raw.compensation_policy_status),
      qualifiesForReview: qualifiesForCurrentProductionLane(posting, minFitScore),
    },
    reviewState: reviewStateFromRawRecord(raw),
    sourceCategory: stringValue(posting.source_category),
    sourceRunId: stringValue(posting.source_run_id),
    title: stringValue(posting.title) || 'Role',
    updatedAt: stringValue(posting.updated_at),
    workArrangement: stringValue(posting.work_arrangement),
  };
}

export function toCanonicalJobs(postings: JsonRecord[], minFitScore?: number): CanonicalJob[] {
  return postings.map((posting) => toCanonicalJob(posting, minFitScore));
}

function reviewStateFromRawRecord(raw: JsonRecord): CanonicalJobReviewState {
  const decision = stringValue(raw.review_decision).toLowerCase();
  if (decision === 'approve' || decision === 'approved') return 'approved';
  if (decision === 'reject' || decision === 'rejected') return 'rejected';
  return 'pending_review';
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : value == null ? '' : String(value).trim();
}

function numberValue(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function nullableNumber(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}
