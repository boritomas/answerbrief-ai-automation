import crypto from 'node:crypto';
import { buildCandidateProfile, employmentDateValidation, type CandidateEmploymentRecord } from './career-os-candidate-profile';

type JsonRecord = Record<string, unknown>;

type QueueState =
  | 'discovered'
  | 'qualification_pending'
  | 'qualified'
  | 'package_pending'
  | 'package_ready'
  | 'queued'
  | 'running'
  | 'waiting_on_tomas'
  | 'blocked_technical'
  | 'retry_scheduled'
  | 'submitted'
  | 'confirmed'
  | 'inactive'
  | 'ineligible'
  | 'duplicate'
  | 'failed';

type QueueApplication = JsonRecord & {
  id: string;
  owner_email: string;
  employer: string;
  exact_resume?: string | null;
  lifecycle_stage?: string | null;
  next_action?: string | null;
  position: string;
  raw_record?: JsonRecord;
  updated_at?: string | null;
};

type WorkerStatus =
  | 'running'
  | 'heartbeat'
  | 'waiting_on_tomas'
  | 'blocked_technical'
  | 'retry_scheduled'
  | 'submitted'
  | 'confirmed'
  | 'failed';

type WorkerReport = {
  applicationId: string;
  companionId: string;
  confirmationNumber?: string;
  currentUrl?: string;
  details?: JsonRecord;
  evidenceText?: string;
  evidenceUrl?: string;
  ownerEmail: string;
  screenshotPath?: string;
  status: WorkerStatus;
};

export type BrowserWorkerClaimRequest = {
  companionId: string;
  ownerEmail: string;
};

export type BrowserWorkerTask = {
  applicationId: string;
  applicationUrl: string;
  candidate: {
    city?: string;
    currentCompany?: string;
    email?: string;
    firstName?: string;
    lastName?: string;
    linkedin?: string;
    phone?: string;
    postalCode?: string;
    preferredName?: string;
    pronouns?: string;
    referralSource?: string;
    referralSourceAffirmFallback?: string;
    employmentHistory?: CandidateEmploymentRecord[];
    primaryEmployment?: CandidateEmploymentRecord;
    primaryEmploymentWorkdayReady?: boolean;
    primaryEmploymentMissingVerifiedFields?: string[];
    countryRegion?: string;
    sponsorshipFuture?: string;
    sponsorshipNow?: string;
    stateOrProvince?: string;
    usWorkAuthorization?: boolean;
    verifiedEmploymentTenure?: {
      employer?: string;
      endYear?: number;
      precision?: string;
      startYear?: number;
      usePolicy?: string;
    };
    previouslyWorkedAtEmployer?: string;
  };
  companionId: string;
  employer: string;
  legal: {
    approvedAcknowledgements: string[];
  };
  ownerEmail: string;
  platform: string;
  position: string;
  questionCatalog: Array<{
    allowedOptions: string[];
    exactWording: string;
    required: boolean;
    verifiedMappedAnswer?: JsonRecord | null;
  }>;
  resume: {
    content?: string;
    fileName: string;
    localPath?: string;
  };
};

export function browserWorkerConfigured() {
  return Boolean(cleanEnv(process.env.CAREER_OS_BROWSER_WORKER_TOKEN));
}

export function authorizeBrowserWorker(request: Request) {
  const token = cleanEnv(process.env.CAREER_OS_BROWSER_WORKER_TOKEN);
  const authorization = request.headers.get('authorization') || '';
  if (!token) return { authorized: false, reason: 'CAREER_OS_BROWSER_WORKER_TOKEN is not configured.' };
  if (authorization === `Bearer ${token}`) return { authorized: true, reason: '' };
  return { authorized: false, reason: 'Unauthorized browser worker request.' };
}

export async function claimNextBrowserWorkerTask(input: BrowserWorkerClaimRequest): Promise<BrowserWorkerTask | null> {
  const applications = await selectAll(
    'career_os_applications',
    `select=*&owner_email=eq.${encodeURIComponent(input.ownerEmail)}&order=updated_at.asc.nullslast,created_at.asc.nullslast`,
  ) as QueueApplication[];

  for (const application of applications) {
    if (!isBrowserWorkerEligible(application, input.companionId)) continue;
    const task = await buildTaskPayload(application, input.companionId);
    if (!task) continue;

    const now = new Date().toISOString();
    const runId = deterministicUuid(`career-os-browser-claim:${application.id}:${input.companionId}:${now}`);
    const raw = asRecord(application.raw_record);
    const patch = {
      lifecycle_stage: 'browser_worker_running',
      next_action: `Career OS local browser companion ${input.companionId} claimed the application for real employer-site execution.`,
      raw_record: {
        ...raw,
        browser_worker: {
          claimed_at: now,
          companion_id: input.companionId,
          last_heartbeat_at: now,
          status: 'running',
        },
        execution_engine: 'playwright_local_companion',
        execution_status: 'running',
      },
      updated_at: now,
    };
    await patchApplication(application.id, patch);
    await appendWorkflowEvent(application, 'browser_worker_claimed', 'running', patch.next_action, now, runId, task.applicationUrl);
    return task;
  }

  return null;
}

export async function reportBrowserWorkerProgress(report: WorkerReport) {
  const application = await selectApplication(report.ownerEmail, report.applicationId);
  if (!application) {
    throw new Error('Career OS browser worker application was not found.');
  }

  const now = new Date().toISOString();
  const runId = deterministicUuid(`career-os-browser-report:${report.applicationId}:${report.companionId}:${report.status}:${now}`);
  const raw = asRecord(application.raw_record);
  const browserWorker = asRecord(raw.browser_worker);
  const currentUrl = cleanEnv(report.currentUrl || report.evidenceUrl || stringValue(raw.application_url) || stringValue(raw.canonical_url));
  const screenshotPath = cleanEnv(report.screenshotPath);
  const details = asRecord(report.details);

  const nextRaw: JsonRecord = {
    ...raw,
    application_url: currentUrl || raw.application_url,
    browser_worker: {
      ...browserWorker,
      companion_id: report.companionId,
      last_heartbeat_at: now,
      last_screenshot_path: screenshotPath || browserWorker.last_screenshot_path,
      status: report.status,
    },
    browser_worker_last_report: {
      current_url: currentUrl,
      details,
      evidence_text: report.evidenceText || '',
      evidence_url: report.evidenceUrl || '',
      screenshot_path: screenshotPath || '',
      status: report.status,
      timestamp: now,
    },
    execution_engine: 'playwright_local_companion',
    execution_status: mapWorkerStatusToExecutionStatus(report.status),
  };

  if (report.status === 'heartbeat' || report.status === 'running') {
    await patchApplication(application.id, {
      lifecycle_stage: 'browser_worker_running',
      next_action: report.evidenceText || 'Browser companion is progressing the employer workflow.',
      raw_record: nextRaw,
      updated_at: now,
    });
    await appendWorkflowEvent(application, 'browser_worker_progress', 'running', report.evidenceText || 'Browser companion heartbeat received.', now, runId, currentUrl || undefined, {
      screenshot_path: screenshotPath || undefined,
      ...details,
    });
    return;
  }

  if (report.status === 'waiting_on_tomas') {
    await patchApplication(application.id, {
      lifecycle_stage: 'waiting_on_tomas_browser_worker',
      next_action: report.evidenceText || 'Browser companion reached a human-only gate.',
      raw_record: nextRaw,
      updated_at: now,
    });
    await appendWorkflowEvent(application, 'browser_worker_waiting_on_tomas', 'waiting_on_tomas', report.evidenceText || 'Human-only gate detected.', now, runId, currentUrl || undefined, {
      screenshot_path: screenshotPath || undefined,
      ...details,
    });
    return;
  }

  if (report.status === 'blocked_technical' || report.status === 'failed') {
    await patchApplication(application.id, {
      lifecycle_stage: report.status === 'failed' ? 'browser_worker_failed' : 'browser_worker_blocked_technical',
      next_action: report.evidenceText || 'Browser companion hit a technical blocker.',
      raw_record: nextRaw,
      updated_at: now,
    });
    await appendWorkflowEvent(application, 'browser_worker_blocked', report.status === 'failed' ? 'failed' : 'blocked_technical', report.evidenceText || 'Technical blocker detected.', now, runId, currentUrl || undefined, {
      screenshot_path: screenshotPath || undefined,
      ...details,
    });
    return;
  }

  if (report.status === 'retry_scheduled') {
    await patchApplication(application.id, {
      lifecycle_stage: 'retry_scheduled',
      next_action: report.evidenceText || 'Browser companion scheduled a retry.',
      raw_record: nextRaw,
      updated_at: now,
    });
    await appendWorkflowEvent(application, 'browser_worker_retry_scheduled', 'retry_scheduled', report.evidenceText || 'Retry scheduled.', now, runId, currentUrl || undefined, {
      screenshot_path: screenshotPath || undefined,
      ...details,
    });
    return;
  }

  if (report.status === 'submitted' || report.status === 'confirmed') {
    const confirmationNumber = cleanEnv(report.confirmationNumber) || `browser-worker-${application.id}-confirmation`;
    const submissionEvidence = report.evidenceText || (report.status === 'confirmed'
      ? 'Submission confirmation was captured by the Career OS browser companion.'
      : 'Submission was completed by the Career OS browser companion.');
    await patchApplication(application.id, {
      confirmation_number: confirmationNumber,
      lifecycle_stage: report.status === 'confirmed' ? 'confirmed' : 'submitted',
      next_action: report.status === 'confirmed'
        ? 'Application submitted and confirmation evidence captured by the browser companion.'
        : 'Application submitted by the browser companion; awaiting confirmation evidence review.',
      raw_record: {
        ...nextRaw,
        confirmation_url: report.evidenceUrl || currentUrl || raw.confirmation_url,
      },
      submission_evidence: submissionEvidence,
      updated_at: now,
    });
    await appendWorkflowEvent(application, report.status === 'confirmed' ? 'browser_worker_confirmed' : 'browser_worker_submitted', report.status, submissionEvidence, now, runId, report.evidenceUrl || currentUrl || undefined, {
      confirmation_number: confirmationNumber,
      screenshot_path: screenshotPath || undefined,
      ...details,
    });
  }
}

export async function browserWorkerHealth(ownerEmail: string) {
  const applications = await selectAll(
    'career_os_applications',
    `select=id,employer,position,lifecycle_stage,next_action,raw_record,updated_at,confirmation_number,submission_evidence&owner_email=eq.${encodeURIComponent(ownerEmail)}&order=updated_at.desc`,
  ) as QueueApplication[];

  const eligible = applications.filter((application) => isBrowserWorkerEligible(application, undefined)).length;
  const running = applications.filter((application) => {
    const raw = asRecord(application.raw_record);
    return cleanEnv(raw.execution_engine) === 'playwright_local_companion' && cleanEnv(asRecord(raw.browser_worker).status) === 'running';
  }).length;

  return {
    configured: browserWorkerConfigured(),
    eligible,
    running,
  };
}

function isBrowserWorkerEligible(application: QueueApplication, companionId: string | undefined) {
  const state = canonicalQueueState(application);
  if (!['queued', 'package_ready', 'qualified', 'retry_scheduled', 'running'].includes(state)) return false;
  if (application.confirmation_number || application.submission_evidence) return false;
  const raw = asRecord(application.raw_record);
  const browserWorker = asRecord(raw.browser_worker);
  const claimedBy = cleanEnv(browserWorker.companion_id);
  const status = cleanEnv(browserWorker.status);
  if (status === 'running' && claimedBy && companionId && claimedBy !== companionId) return false;
  return Boolean(externalApplicationHref(application));
}

function canonicalQueueState(application: JsonRecord): QueueState {
  const text = applicationText(application);
  if (application.confirmation_number || application.submission_evidence) return 'confirmed';
  if (hasAny(text, ['submitted'])) return 'submitted';
  if (hasAny(text, ['duplicate'])) return 'duplicate';
  if (hasAny(text, ['inactive', 'closed', 'expired', 'unavailable'])) return 'inactive';
  if (hasAny(text, ['ineligible'])) return 'ineligible';
  if (hasAny(text, ['retry_scheduled', 'retry scheduled'])) return 'retry_scheduled';
  if (hasAny(text, ['failed', 'error'])) return 'failed';
  if (hasAny(text, ['running'])) return 'running';
  if (hasAny(text, ['queued'])) return 'queued';
  if (hasAny(text, ['package_ready', 'ready_for_automation', 'qualified_pending_application', 'resumable'])) return 'queued';
  if (hasAny(text, ['package_pending'])) return 'package_pending';
  if (hasAny(text, ['qualified'])) return 'queued';
  if (hasAny(text, ['discovered'])) return 'discovered';
  return 'qualification_pending';
}

async function buildTaskPayload(application: QueueApplication, companionId: string): Promise<BrowserWorkerTask | null> {
  const applicationUrl = externalApplicationHref(application);
  if (!applicationUrl) return null;

  const profileRows = await selectAll(
    'career_os_profiles',
    `select=*&owner_email=eq.${encodeURIComponent(application.owner_email)}&limit=1`,
  );
  const profile = asRecord(profileRows[0]);
  const verifiedProfile = asRecord(profile.verified_profile);
  const employerRows = await selectAll(
    'career_os_employers',
    `select=id,canonical_name&owner_email=eq.${encodeURIComponent(application.owner_email)}&canonical_name=eq.${encodeURIComponent(application.employer)}&limit=1`,
  );
  const employer = asRecord(employerRows[0]);
  const employerId = cleanEnv(employer.id);
  const questionRows = employerId
    ? await selectAll(
        'career_os_employer_question_catalog',
        `select=exact_wording,required,allowed_options,verified_mapped_answer&owner_email=eq.${encodeURIComponent(application.owner_email)}&employer_id=eq.${encodeURIComponent(employerId)}&order=updated_at.asc`,
      )
    : [];
  const processRows = employerId
    ? await selectAll(
        'career_os_employer_application_processes',
        `select=legal_acknowledgements,platform_name&owner_email=eq.${encodeURIComponent(application.owner_email)}&employer_id=eq.${encodeURIComponent(employerId)}&order=updated_at.desc&limit=1`,
      )
    : [];
  const artifacts = await selectAll(
    'career_os_artifacts',
    `select=artifact_type,filename,local_path,approval_status,application_id,opportunity_id&owner_email=eq.${encodeURIComponent(application.owner_email)}&application_id=eq.${encodeURIComponent(application.id)}&order=created_at.desc`,
  );

  const resumeArtifact = artifacts.find((row) => {
    const record = asRecord(row);
    return cleanEnv(record.artifact_type).includes('resume');
  });
  const raw = asRecord(application.raw_record);
  const displayName = cleanEnv(profile.display_name) || 'Tomas Nieves';
  const contact = asRecord(verifiedProfile.contact);
  const pronouns = asRecord(verifiedProfile.pronouns);
  const referralSource = asRecord(verifiedProfile.referral_source);
  const priorAffirm = asRecord(verifiedProfile.prior_affirm_employment);
  const sponsorship = asRecord(verifiedProfile.sponsorship_requirement);
  const employmentTenure = asRecord(asRecord(application.application_answers).verified_employment_tenure);
  const candidateProfile = buildCandidateProfile(verifiedProfile, profile, application.application_answers);
  const employmentProfile = candidateProfile.primaryEmployment;
  const employmentValidation = employmentDateValidation(employmentProfile);
  const process = asRecord(processRows[0]);
  const legalAcknowledgements = arrayValue(process.legal_acknowledgements)
    .map((item) => cleanEnv(asRecord(item).wording))
    .filter(Boolean);

  return {
    applicationId: application.id,
    applicationUrl,
    candidate: {
      currentCompany: cleanEnv(raw.current_company) || candidateProfile.currentCompany || 'Verizon',
      email: candidateProfile.email,
      employmentHistory: candidateProfile.employmentHistory,
      firstName: candidateProfile.firstName || displayName.split(/\s+/)[0] || 'Tomas',
      lastName: candidateProfile.lastName || 'Nieves',
      linkedin: candidateProfile.linkedin,
      phone: candidateProfile.phone,
      postalCode: candidateProfile.postalCode,
      preferredName: candidateProfile.preferredName,
      primaryEmployment: employmentProfile,
      primaryEmploymentMissingVerifiedFields: employmentValidation.missingVerifiedFields,
      primaryEmploymentWorkdayReady: employmentValidation.canAutofillWorkday,
      previouslyWorkedAtEmployer: priorAffirm.answer_label ? cleanEnv(priorAffirm.answer_label) : undefined,
      pronouns: candidateProfile.pronouns || cleanEnv(pronouns.answer),
      referralSource: candidateProfile.referralSource || cleanEnv(referralSource.value),
      referralSourceAffirmFallback: application.employer === 'Affirm' ? 'Other' : undefined,
      city: candidateProfile.city || cleanEnv(contact.city),
      countryRegion: candidateProfile.countryRegion || 'United States of America',
      sponsorshipFuture: sponsorship.answer_label ? cleanEnv(sponsorship.answer_label) : undefined,
      sponsorshipNow: sponsorship.answer_label ? cleanEnv(sponsorship.answer_label) : undefined,
      stateOrProvince: candidateProfile.stateOrProvince,
      usWorkAuthorization: candidateProfile.usWorkAuthorization,
      verifiedEmploymentTenure: employmentTenure.start_year || employmentTenure.end_year
        ? {
            employer: cleanEnv(employmentTenure.employer),
            endYear: numberValue(employmentTenure.end_year),
            precision: cleanEnv(employmentTenure.precision),
            startYear: numberValue(employmentTenure.start_year),
            usePolicy: cleanEnv(employmentTenure.use_policy),
          }
        : undefined,
    },
    companionId,
    employer: application.employer,
    legal: {
      approvedAcknowledgements: legalAcknowledgements,
    },
    ownerEmail: application.owner_email,
    platform: cleanEnv(process.platform_name || raw.platform || raw.ats_platform) || 'unknown',
    position: application.position,
    questionCatalog: questionRows.map((row) => {
      const record = asRecord(row);
      return {
        allowedOptions: arrayValue(record.allowed_options).map((value) => cleanEnv(value)).filter(Boolean),
        exactWording: cleanEnv(record.exact_wording),
        required: Boolean(record.required),
        verifiedMappedAnswer: record.verified_mapped_answer ? asRecord(record.verified_mapped_answer) : null,
      };
    }),
    resume: {
      content: cleanEnv(application.exact_resume) || undefined,
      fileName: cleanEnv(asRecord(resumeArtifact).filename) || `${slugify(application.employer)}-${slugify(application.position)}-resume.txt`,
      localPath: cleanEnv(asRecord(resumeArtifact).local_path) || undefined,
    },
  };
}

async function selectApplication(ownerEmail: string, applicationId: string): Promise<QueueApplication | undefined> {
  const rows = await selectAll(
    'career_os_applications',
    `select=*&owner_email=eq.${encodeURIComponent(ownerEmail)}&id=eq.${encodeURIComponent(applicationId)}&limit=1`,
  ) as QueueApplication[];
  return rows[0];
}

async function patchApplication(id: string, patch: JsonRecord) {
  const configuration = supabaseConfiguration();
  const response = await fetch(`${configuration.url}/rest/v1/career_os_applications?id=eq.${encodeURIComponent(id)}`, {
    body: JSON.stringify(patch),
    headers: supabaseHeaders(configuration.key),
    method: 'PATCH',
  });
  if (!response.ok) {
    throw new Error(`Career OS application update failed with ${response.status}: ${(await response.text()).slice(0, 240)}`);
  }
}

async function appendWorkflowEvent(
  application: JsonRecord,
  eventType: string,
  status: string,
  evidenceText: string,
  occurredAt: string,
  runId: string,
  evidenceUrl?: string,
  metadata?: JsonRecord,
) {
  const id = deterministicUuid(`career-os-worker-event:${application.id}:${eventType}:${status}:${runId}`);
  await upsertRows('career_os_employer_workflow_events', {
    application_id: application.id,
    created_at: occurredAt,
    employer: application.employer,
    event_type: eventType,
    evidence_text: evidenceText,
    evidence_url: evidenceUrl || externalApplicationHref(application) || null,
    id,
    metadata: {
      source: 'career_os_browser_worker',
      ...metadata,
    },
    occurred_at: occurredAt,
    opportunity_id: application.opportunity_id,
    owner_email: application.owner_email,
    platform: cleanEnv(asRecord(application.raw_record).platform) || 'Career OS',
    status,
  });
}

async function selectAll(table: string, query: string): Promise<JsonRecord[]> {
  const configuration = supabaseConfiguration();
  const response = await fetch(`${configuration.url}/rest/v1/${table}?${query}`, {
    cache: 'no-store',
    headers: supabaseHeaders(configuration.key),
  });
  if (!response.ok) {
    throw new Error(`Career OS ${table} query failed with ${response.status}: ${(await response.text()).slice(0, 240)}`);
  }
  return await response.json() as JsonRecord[];
}

async function upsertRows(table: string, rows: JsonRecord | JsonRecord[]) {
  const configuration = supabaseConfiguration();
  const response = await fetch(`${configuration.url}/rest/v1/${table}?on_conflict=id`, {
    body: JSON.stringify(rows),
    headers: {
      ...supabaseHeaders(configuration.key),
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    method: 'POST',
  });
  if (!response.ok) {
    throw new Error(`Career OS ${table} upsert failed with ${response.status}: ${(await response.text()).slice(0, 240)}`);
  }
}

function mapWorkerStatusToExecutionStatus(status: WorkerStatus) {
  if (status === 'heartbeat') return 'running';
  return status;
}

function supabaseConfiguration() {
  const url = cleanEnv(process.env.SUPABASE_URL);
  const key = cleanEnv(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!url || !key || key.startsWith('[')) {
    throw new Error('Career OS Supabase service configuration is unavailable.');
  }
  return { key, url };
}

function supabaseHeaders(key: string) {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  };
}

function externalApplicationHref(application: JsonRecord) {
  const raw = asRecord(application.raw_record);
  return cleanEnv(raw.confirmation_url || raw.application_url || raw.canonical_url || raw.job_url || application.evidence_url || application.application_url);
}

function applicationText(application: JsonRecord) {
  const raw = asRecord(application.raw_record);
  return `${application.lifecycle_stage || ''} ${application.next_action || ''} ${raw.blocker_type || ''} ${raw.execution_status || ''} ${raw.reason_not_submitted || ''} ${JSON.stringify(application.application_answers || {})}`.toLowerCase();
}

function hasAny(text: string, terms: string[]) {
  const haystack = String(text || '').toLowerCase();
  return terms.some((term) => haystack.includes(term.toLowerCase()));
}

function arrayValue(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function numberValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function slugify(value: string) {
  return cleanEnv(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'resume';
}

function cleanEnv(value: unknown) {
  return String(value || '').trim().replace(/^"|"$/g, '');
}

function deterministicUuid(input: string) {
  const hash = crypto.createHash('sha1').update(input).digest();
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const hex = hash.subarray(0, 16).toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
