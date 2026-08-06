// Human-approved handoff from the Job Copilot review queue into CareerOS.
//
// This is an extraction, not new behavior: the exact operations here
// previously lived only inline inside app/api/career-os/approve-role/route.ts
// (the founder dashboard's "Approve" button), which meant there was no way
// to invoke the same reviewed-and-approved handoff programmatically -- e.g.
// from JobCopilotService. That route now calls this function instead of
// duplicating the logic. Behavior is unchanged: same reads, same writes,
// same row shapes, same required action-token authorization.
//
// This never queues, claims, or runs anything against the browser worker --
// it only marks the posting/opportunity/application rows as approved and
// `lifecycle_stage: 'queued'`, exactly as the original route did. Actual
// execution still requires the separate, independently-gated CareerOS queue
// processor / browser worker, neither of which this function touches.
import crypto from 'node:crypto';
import { verifyCareerOsActionToken } from './career-os-queue';
import {
  careerOsPatchRowById,
  careerOsSelectRows,
  careerOsUpsertRows,
} from './career-os-supabase';

type JsonRecord = Record<string, unknown>;

export type ApproveReviewedJobPostingInput = {
  actionToken?: string;
  actionTokenExpiresAt?: string;
  employer?: string;
  opportunityId?: string;
  ownerEmail: string;
  reviewSource?: string;
};

export type ApproveReviewedJobPostingResult =
  | { applicationId: string; message: string; ok: true; status: 'success' }
  | { error: string; ok: false; status: 'error' | 'unauthorized' | 'not_found' };

export async function approveReviewedJobPosting(input: ApproveReviewedJobPostingInput): Promise<ApproveReviewedJobPostingResult> {
  const ownerEmail = input.ownerEmail;
  const opportunityId = clean(input.opportunityId);
  const reviewSource = clean(input.reviewSource) || 'founder_dashboard';

  const authorized = verifyCareerOsActionToken({
    action: 'review_opportunity',
    expiresAt: clean(input.actionTokenExpiresAt),
    ownerEmail,
    token: clean(input.actionToken),
  });
  if (!authorized) {
    return { error: 'Unauthorized Career OS action.', ok: false, status: 'unauthorized' };
  }
  if (!opportunityId) {
    return { error: 'Missing review opportunity id.', ok: false, status: 'error' };
  }

  try {
    const postings = await careerOsSelectRows(
      'career_os_job_postings',
      `select=*&owner_email=eq.${encodeURIComponent(ownerEmail)}&id=eq.${encodeURIComponent(opportunityId)}&limit=1`,
    ) as JsonRecord[];
    const posting = postings[0];
    if (!posting) {
      return { error: 'Review opportunity not found.', ok: false, status: 'not_found' };
    }

    const now = new Date().toISOString();
    const raw = asRecord(posting.raw_record);
    const canonicalUrl = clean(posting.canonical_url || raw.canonical_url || raw.job_url || raw.apply_url);
    const requisition = clean(posting.external_requisition_id || raw.requisition || raw.requisition_id);
    const employer = clean(posting.company || input.employer) || 'Employer';
    const position = clean(posting.title) || 'Role';

    await careerOsPatchRowById('career_os_job_postings', String(posting.id), {
      raw_record: {
        ...raw,
        review_actioned_at: now,
        review_approved_at: now,
        review_decision: 'approve',
        review_employer: employer,
      },
      updated_at: now,
    });

    const opportunities = await careerOsSelectRows(
      'career_os_opportunities',
      `select=*&owner_email=eq.${encodeURIComponent(ownerEmail)}&id=eq.${encodeURIComponent(opportunityId)}&limit=1`,
    ) as JsonRecord[];
    const existingOpportunity = opportunities[0];
    const resolvedOpportunityId = String(existingOpportunity?.id || opportunityId);

    await careerOsUpsertRows('career_os_opportunities', {
      id: resolvedOpportunityId,
      owner_email: ownerEmail,
      employer,
      position,
      requisition: requisition || null,
      source: clean(posting.ats_platform || raw.ats_platform) || 'Career OS review queue',
      job_url: canonicalUrl || null,
      match_score: Number(posting.fit_score || 0) || null,
      recommendation: 'Apply',
      status: 'approved_pending_application',
      next_action: 'Approved and queued for one-application production execution.',
      discovered_at: posting.created_at || now,
      updated_at: now,
      raw_record: {
        ...raw,
        canonical_job_posting_id: opportunityId,
        canonical_url: canonicalUrl || undefined,
        execution_status: 'queued',
        package_ready: true,
        package_status: clean(raw.package_status) || 'approved_for_run_one',
        review_approved_at: now,
        review_source: reviewSource,
      },
    });

    const applications = await careerOsSelectRows(
      'career_os_applications',
      `select=*&owner_email=eq.${encodeURIComponent(ownerEmail)}&opportunity_id=eq.${encodeURIComponent(resolvedOpportunityId)}&limit=1`,
    ) as JsonRecord[];
    const existing = applications[0];
    const existingRaw = asRecord(existing?.raw_record);
    const applicationId = String(existing?.id || `app-review-${opportunityId}`);

    await careerOsUpsertRows('career_os_applications', {
      id: applicationId,
      owner_email: ownerEmail,
      opportunity_id: resolvedOpportunityId,
      employer,
      position,
      lifecycle_stage: 'queued',
      next_action: 'Approved and queued. Run One Production Application to execute.',
      exact_resume: existing?.exact_resume || null,
      raw_record: {
        ...raw,
        ...existingRaw,
        canonical_job_posting_id: opportunityId,
        canonical_url: canonicalUrl || undefined,
        job_url: canonicalUrl || undefined,
        execution_status: 'queued',
        package_ready: true,
        package_status: clean(existingRaw.package_status || raw.package_status) || 'approved_for_run_one',
        review_approved_at: now,
        review_source: reviewSource,
      },
      updated_at: now,
      created_at: existing?.created_at || now,
    });

    await careerOsUpsertRows('career_os_employer_workflow_events', {
      id: deterministicUuid(`founder-approve:${opportunityId}:${now}`),
      owner_email: ownerEmail,
      application_id: applicationId,
      opportunity_id: resolvedOpportunityId,
      employer,
      platform: clean(posting.ats_platform || raw.ats_platform) || 'Career OS',
      event_type: 'review_queue_approved',
      status: 'queued',
      evidence_text: 'Tomas approved this qualified role from the review queue. The application is queued for Run One production execution.',
      occurred_at: now,
      created_at: now,
      metadata: {
        review_action: 'approve',
        source: reviewSource,
      },
    });

    return {
      applicationId,
      message: 'Approved and queued. Click Run One Production Application to execute this role.',
      ok: true,
      status: 'success',
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Role approval failed.',
      ok: false,
      status: 'error',
    };
  }
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}

function clean(value: unknown) {
  return String(value || '').trim().replace(/^"|"$/g, '');
}

function deterministicUuid(input: string) {
  const hash = crypto.createHash('sha1').update(input).digest();
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const hex = hash.subarray(0, 16).toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
