import fs from 'node:fs';
import path from 'node:path';

const VALID_MODES = new Set(['inspect_only', 'assisted_apply', 'workday_single_canary', 'workday_first_submit', 'submit_enabled']);
const SENSITIVE_CATEGORY_PATTERNS = [
  ['salary', /salary|compensation|pay|wage|bonus|equity/i],
  ['sponsorship', /sponsor|visa|immigration|work authorization|authorized to work/i],
  ['relocation', /relocat|move to|commute/i],
  ['arbitration', /arbitration|class action|jury trial/i],
  ['background', /background check|drug screen|reference check/i],
  ['demographic', /gender|race|ethnicity|hispanic|latino|sexual orientation/i],
  ['disability', /disability|accommodation/i],
  ['veteran', /veteran|military service/i],
  ['conflict', /conflict of interest|relative|family member|related to/i],
  ['criminal', /criminal|felony|conviction/i],
  ['legal', /certify|consent|terms|privacy|signature|acknowledge|legal|policy/i],
  ['mfa', /multi-factor|mfa|security code|verify your identity/i],
  ['captcha', /captcha|verify you are human|bot verification|security challenge/i],
  ['login', /login|log in|sign in/i],
  ['account', /create account|account required|already have a profile|forgot password/i],
];

let cachedCapabilities;

export function loadAtsProductionCapabilities(options = {}) {
  if (cachedCapabilities && !options.reload) return cachedCapabilities;
  const configPath = options.configPath || path.resolve(process.cwd(), 'config/ats-production-capabilities.json');
  const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  validateCapabilityMatrix(parsed);
  cachedCapabilities = parsed;
  return parsed;
}

export function validateCapabilityMatrix(matrix) {
  if (!matrix || typeof matrix !== 'object') throw new Error('ATS production capability matrix is missing.');
  if (!Array.isArray(matrix.executionModes) || !matrix.executionModes.every((mode) => VALID_MODES.has(mode))) {
    throw new Error('ATS production capability matrix has invalid execution modes.');
  }
  for (const adapterId of ['greenhouse', 'workday', 'unsupported']) {
    const adapter = matrix.adapters?.[adapterId];
    if (!adapter) throw new Error(`ATS production capability matrix is missing ${adapterId}.`);
    if (!Array.isArray(adapter.allowedModes)) throw new Error(`${adapterId} capability is missing allowed modes.`);
  }
  const forbidden = matrix.claimPolicy?.forbiddenAdapters || [];
  if (!forbidden.includes('oracle')) throw new Error('ATS production capability matrix must forbid Oracle automation.');
  if (matrix.adapters?.oracle) throw new Error('Oracle must not be present as a production adapter.');
  return true;
}

export function resolveProductionExecutionPolicy(input = {}) {
  const matrix = input.matrix || loadAtsProductionCapabilities();
  const adapterId = canonicalAdapterId(input.adapterId);
  const capability = matrix.adapters?.[adapterId] || matrix.adapters?.unsupported;
  const task = input.task || {};
  const env = input.env || process.env;
  const explicitMode = explicitExecutionMode(task, env);
  const mode = normalizeExecutionMode(explicitMode.value);
  const baseDetails = {
    adapterId,
    capabilityTier: capability?.capabilityTier || 'unknown',
    matrixVersion: matrix.version,
    modeSource: explicitMode.source,
    requestedExecutionMode: explicitMode.value || '',
    routing: input.routingMetadata || null,
  };
  let greenhouseSubmitValidation = null;

  if (!explicitMode.value) {
    return blockedPolicy({
      adapterId,
      capability,
      details: baseDetails,
      mode: '',
      outcomeStatus: 'terminal_failure',
      reason: 'CAREER_OS_EXECUTION_MODE is missing; Career OS will not run ATS automation without an explicit mode.',
      reportStatus: 'blocked_technical',
    });
  }

  if (!mode) {
    return blockedPolicy({
      adapterId,
      capability,
      details: baseDetails,
      mode: explicitMode.value,
      outcomeStatus: 'terminal_failure',
      reason: `CAREER_OS_EXECUTION_MODE=${explicitMode.value} is invalid; expected inspect_only, assisted_apply, workday_single_canary, workday_first_submit, or submit_enabled.`,
      reportStatus: 'blocked_technical',
    });
  }

  if (adapterId === 'greenhouse') {
    greenhouseSubmitValidation = validateGreenhouseSubmitPolicy(task, env, mode);
    if (!greenhouseSubmitValidation.ok) {
      return blockedPolicy({
        adapterId,
        capability,
        details: {
          ...baseDetails,
          executionMode: mode,
          greenhouseCanary: greenhouseSubmitValidation.details,
        },
        mode,
        outcomeStatus: greenhouseSubmitValidation.outcomeStatus,
        reason: greenhouseSubmitValidation.reason,
        reportStatus: greenhouseSubmitValidation.reportStatus,
      });
    }
    baseDetails.greenhouseCanary = greenhouseSubmitValidation.details;
  }

  if (!capability?.supported) {
    return blockedPolicy({
      adapterId,
      capability,
      details: { ...baseDetails, executionMode: mode },
      mode,
      outcomeStatus: 'unsupported_manual_required',
      reason: 'Career OS does not have a production-supported adapter for this ATS.',
      reportStatus: 'unsupported_manual_required',
    });
  }

  if (!capability.allowedModes.includes(mode)) {
    const outcomeStatus = adapterId === 'workday' && mode === 'submit_enabled'
      ? 'completed_waiting_for_user'
      : (capability.defaultOutcomeWhenBlocked || 'terminal_failure');
    return blockedPolicy({
      adapterId,
      capability,
      details: { ...baseDetails, executionMode: mode },
      mode,
      outcomeStatus,
      reason: `${adapterId} does not allow ${mode}; allowed modes are ${capability.allowedModes.join(', ')}.`,
      reportStatus: outcomeStatus === 'completed_waiting_for_user' ? 'completed_waiting_for_user' : 'canary_stopped',
    });
  }

  if (adapterId === 'workday' && mode === 'workday_single_canary') {
    const validation = validateWorkdaySingleCanaryPolicy(task, env);
    if (!validation.ok) {
      return blockedPolicy({
        adapterId,
        capability,
        details: {
          ...baseDetails,
          executionMode: mode,
          ...validation.details,
        },
        mode,
        outcomeStatus: 'canary_stopped',
        reason: validation.reason,
        reportStatus: 'canary_stopped',
      });
    }
    baseDetails.workdayCanary = validation.details;
  }

  return {
    adapterId,
    allowed: true,
    capability,
    details: {
      ...baseDetails,
      executionMode: mode,
      canaryApplicationIdConfigured: Boolean(clean(env.CAREER_OS_GREENHOUSE_CANARY_APPLICATION_ID)),
      workdayCanaryIdConfigured: Boolean(clean(env.CAREER_OS_WORKDAY_CANARY_ID || env.CAREER_OS_WORKDAY_CANARY_APPLICATION_ID)),
      workdayCanaryUrlConfigured: Boolean(clean(env.CAREER_OS_WORKDAY_CANARY_URL)),
      workdaySubmitApprovalConfigured: Boolean(clean(env.CAREER_OS_WORKDAY_SUBMIT_APPROVAL)),
      submitRunAuthorizationConfigured: Boolean(clean(env.CAREER_OS_SUBMIT_RUN_AUTHORIZATION || env.CAREER_OS_GREENHOUSE_SUBMIT_AUTHORIZATION)),
    },
    mode,
    outcomeStatus: adapterId === 'workday' ? 'inspected_assisted' : undefined,
    reason: `${adapterId} is allowed to run in ${mode}.`,
    reportStatus: undefined,
    submitAllowed: (adapterId === 'workday' && mode === 'workday_first_submit')
      || (adapterId === 'workday' && mode === 'workday_single_canary' && Boolean(clean(env.CAREER_OS_WORKDAY_SUBMIT_APPROVAL)))
      || (adapterId === 'greenhouse' && mode === 'submit_enabled' && greenhouseSubmitValidation?.ok === true),
  };
}

export function createProductionBlockedReport(policy, task = {}) {
  const outcomeStatus = policy.outcomeStatus || 'terminal_failure';
  const status = policy.reportStatus || outcomeStatus;
  return {
    status,
    currentUrl: task.applicationUrl || policy.details?.routing?.sourceUrl || '',
    evidenceText: policy.reason,
    details: {
      outcomeStatus,
      production: reportablePolicyDetails(policy),
      decisionQueue: [
        createProductionDecisionQueueItem({
          ats: policy.adapterId,
          category: categoryForText(policy.reason),
          confidence: 0.96,
          fieldLabel: 'Production execution mode',
          reason: policy.reason,
          requiredAction: requiredActionForOutcome(outcomeStatus),
          resumePoint: 'Set an allowed execution mode and rerun the browser companion.',
          sensitivity: 'operational',
          task,
        }),
      ],
    },
  };
}

export function createProductionDecisionQueueItem(input = {}) {
  const task = input.task || {};
  const category = normalizeDecisionCategory(input.category || categoryForText(`${input.fieldLabel || ''} ${input.reason || ''}`));
  return {
    ats: clean(input.ats || task.platform || 'unknown'),
    category,
    confidence: boundedConfidence(input.confidence),
    fieldLabel: clean(input.fieldLabel || 'Unknown field'),
    jobIdentity: {
      applicationId: clean(task.applicationId),
      employer: clean(task.employer),
      position: clean(task.position),
    },
    proposedAllowedAnswer: input.proposedAllowedAnswer ?? null,
    provenance: input.provenance || {
      source: 'career_os_browser_companion',
      status: input.provenanceStatus || 'runtime_inspection',
    },
    reason: clean(input.reason || 'Career OS needs Tomas to decide how to proceed.'),
    requiredAction: clean(input.requiredAction || 'Review and complete this step manually.'),
    resumePoint: clean(input.resumePoint || 'Resume this application after the human-only step is complete.'),
    sensitivity: clean(input.sensitivity || sensitivityForCategory(category)),
    tenant: clean(input.tenant || input.routing?.tenant || ''),
    timestamp: clean(input.timestamp) || new Date().toISOString(),
    url: clean(input.url || task.applicationUrl || input.routing?.sourceUrl || ''),
  };
}

export function reportablePolicyDetails(policy) {
  return {
    adapterId: policy.adapterId,
    allowed: Boolean(policy.allowed),
    capabilityTier: policy.details?.capabilityTier,
    executionMode: policy.mode || '',
    matrixVersion: policy.details?.matrixVersion,
    modeSource: policy.details?.modeSource,
    outcomeStatus: policy.outcomeStatus,
    reason: policy.reason,
    routing: policy.details?.routing,
    submitAllowed: Boolean(policy.submitAllowed),
  };
}

export function normalizeExecutionMode(value) {
  const mode = clean(value);
  return VALID_MODES.has(mode) ? mode : '';
}

export function normalizeDecisionCategory(value) {
  const category = clean(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  const matrix = loadAtsProductionCapabilities();
  return matrix.decisionQueueCategories.includes(category) ? category : 'unknown';
}

export function categoryForText(value) {
  const text = clean(value);
  for (const [category, pattern] of SENSITIVE_CATEGORY_PATTERNS) {
    if (pattern.test(text)) return category;
  }
  return 'unknown';
}

function blockedPolicy(input) {
  return {
    adapterId: input.adapterId,
    allowed: false,
    capability: input.capability,
    details: input.details,
    mode: input.mode,
    outcomeStatus: input.outcomeStatus,
    reason: input.reason,
    reportStatus: input.reportStatus,
    submitAllowed: false,
  };
}

function explicitExecutionMode(task, env) {
  const taskMode = clean(task.productionExecutionMode || task.executionMode || task.execution_mode);
  if (taskMode) return { source: 'task', value: taskMode };
  const raw = task.rawRecord && typeof task.rawRecord === 'object' ? task.rawRecord : {};
  const rawMode = clean(raw.production_execution_mode || raw.execution_mode);
  if (rawMode) return { source: 'task.rawRecord', value: rawMode };
  const envMode = clean(env.CAREER_OS_EXECUTION_MODE);
  if (envMode) return { source: 'env.CAREER_OS_EXECUTION_MODE', value: envMode };
  return { source: 'missing', value: '' };
}

function requiredActionForOutcome(outcomeStatus) {
  if (outcomeStatus === 'deferred_phase_two_greenhouse') return 'No Tomas action is required; Career OS is processing Workday first and preserving this Greenhouse record for phase two.';
  if (outcomeStatus === 'canary_stopped') return 'Choose exactly one canary application id, set the required authorization for that mode, then rerun.';
  if (outcomeStatus === 'unsupported_manual_required') return 'Complete this application manually or add a production adapter.';
  if (outcomeStatus === 'completed_waiting_for_user') return 'Review the employer page manually before continuing.';
  if (outcomeStatus === 'waiting_for_sign_in') return 'Sign in to the employer Workday account, then resume the single canary.';
  if (outcomeStatus === 'waiting_for_account_creation') return 'Create or open the employer Workday account, then resume the single canary.';
  if (outcomeStatus === 'waiting_for_email_code') return 'Enter the employer email code manually, then resume the single canary.';
  if (outcomeStatus === 'waiting_for_email_verification') return 'Complete employer email verification manually, then resume the single canary.';
  if (outcomeStatus === 'waiting_for_manual_upload') return 'Upload the approved resume manually or fix the approved resume artifact, then resume.';
  if (outcomeStatus === 'waiting_for_user_decision') return 'Review the Workday field or disclosure and provide an application-specific decision.';
  if (outcomeStatus === 'review_ready') return 'Review the exact Workday application and set the job-specific submit approval token only if ready.';
  if (outcomeStatus === 'submission_uncertain') return 'Review the live employer page and confirmation evidence before taking any further action.';
  if (outcomeStatus === 'unsupported_workday_state') return 'Inspect the Workday page manually and add support only after confirming the state.';
  return 'Fix the production execution configuration before rerunning.';
}

function sensitivityForCategory(category) {
  if (['salary', 'sponsorship', 'relocation', 'legal', 'arbitration', 'background', 'demographic', 'disability', 'veteran', 'conflict', 'criminal'].includes(category)) {
    return 'sensitive';
  }
  if (['login', 'account', 'mfa', 'captcha'].includes(category)) return 'human_only';
  return 'operational';
}

function canonicalAdapterId(value) {
  const text = clean(value).toLowerCase();
  if (text.includes('greenhouse')) return 'greenhouse';
  if (text.includes('workday') || text.includes('phenom')) return 'workday';
  return 'unsupported';
}

// CAREER_OS_WORKDAY_CANARY_ID may hold a comma-separated allowlist of
// application ids, not just one -- mirrors workdayCanaryIdAllowlist() in
// lib/career-os-browser-worker.ts. A single-entry allowlist reproduces the
// original single-canary behavior exactly, including the
// CAREER_OS_WORKDAY_CANARY_URL identity cross-check, which only makes sense
// for exactly one canary.
function workdayCanaryIdAllowlist(env) {
  const raw = env.CAREER_OS_WORKDAY_CANARY_ID || env.CAREER_OS_WORKDAY_CANARY_APPLICATION_ID || '';
  const entries = raw.split(',').map((entry) => clean(entry)).filter(Boolean);
  return Array.from(new Set(entries));
}

function validateWorkdaySingleCanaryPolicy(task, env) {
  const applicationId = clean(task.applicationId);
  const raw = task.rawRecord && typeof task.rawRecord === 'object' ? task.rawRecord : {};
  const taskCanaryId = clean(raw.workday_canary_id || raw.workday_canary_application_id);
  const canaryAllowlist = workdayCanaryIdAllowlist(env);
  const canaryUrl = canaryAllowlist.length === 1 ? clean(env.CAREER_OS_WORKDAY_CANARY_URL) : '';
  const taskUrl = clean(task.applicationUrl || raw.application_url || raw.canonical_url || raw.job_url);
  const parsedTaskUrl = parseWorkdayPolicyUrl(taskUrl);
  const parsedCanaryUrl = canaryUrl ? parseWorkdayPolicyUrl(canaryUrl) : null;
  const details = {
    canaryApplicationIdConfigured: canaryAllowlist.length > 0,
    canaryApplicationIdMatchesTask: canaryAllowlist.includes(applicationId) || (Boolean(taskCanaryId) && canaryAllowlist.includes(taskCanaryId)),
    canaryUrlConfigured: Boolean(canaryUrl),
    taskUrlConfigured: Boolean(taskUrl),
    taskUrlIdentity: parsedTaskUrl.ok ? parsedTaskUrl.identity : null,
    canaryUrlIdentity: parsedCanaryUrl?.ok ? parsedCanaryUrl.identity : null,
  };

  if (!applicationId) {
    return { ok: false, details, reason: 'Workday single-canary mode requires a task application id.' };
  }
  if (!canaryAllowlist.length) {
    return { ok: false, details, reason: 'Workday single-canary mode requires CAREER_OS_WORKDAY_CANARY_ID for the one approved application.' };
  }
  if (!(canaryAllowlist.includes(applicationId) || (taskCanaryId && canaryAllowlist.includes(taskCanaryId)))) {
    return { ok: false, details, reason: 'Workday single-canary mode is limited to explicitly allowlisted application ids (CAREER_OS_WORKDAY_CANARY_ID).' };
  }
  if (!parsedTaskUrl.ok) {
    return { ok: false, details, reason: parsedTaskUrl.reason || 'Workday single-canary mode requires one unambiguous Workday task URL.' };
  }
  if (parsedCanaryUrl && !parsedCanaryUrl.ok) {
    return { ok: false, details, reason: parsedCanaryUrl.reason || 'CAREER_OS_WORKDAY_CANARY_URL is not an unambiguous Workday URL.' };
  }
  if (parsedCanaryUrl && !sameWorkdayPolicyJob(parsedTaskUrl.identity, parsedCanaryUrl.identity)) {
    return { ok: false, details, reason: 'CAREER_OS_WORKDAY_CANARY_URL does not match the task Workday tenant and job id.' };
  }
  return { ok: true, details, reason: '' };
}

function validateGreenhouseSubmitPolicy(task, env, mode) {
  const applicationId = clean(task.applicationId);
  const raw = task.rawRecord && typeof task.rawRecord === 'object' ? task.rawRecord : {};
  const taskCanaryId = clean(raw.greenhouse_canary_id || raw.greenhouse_canary_application_id);
  const canaryId = clean(env.CAREER_OS_GREENHOUSE_CANARY_APPLICATION_ID);
  const authorization = clean(env.CAREER_OS_GREENHOUSE_SUBMIT_AUTHORIZATION || env.CAREER_OS_SUBMIT_RUN_AUTHORIZATION);
  const details = {
    authorizationConfigured: Boolean(authorization),
    canaryApplicationIdConfigured: Boolean(canaryId),
    canaryApplicationIdMatchesTask: Boolean(canaryId && (canaryId === applicationId || canaryId === taskCanaryId)),
  };

  if (mode !== 'submit_enabled') {
    return {
      details,
      ok: false,
      outcomeStatus: 'deferred_phase_two_greenhouse',
      reason: 'Greenhouse is deferred unless submit_enabled mode names exactly one authorized canary application.',
      reportStatus: 'deferred_phase_two_greenhouse',
    };
  }
  if (!applicationId) {
    return {
      details,
      ok: false,
      outcomeStatus: 'canary_stopped',
      reason: 'Greenhouse submit canary mode requires a task application id.',
      reportStatus: 'canary_stopped',
    };
  }
  if (!canaryId) {
    return {
      details,
      ok: false,
      outcomeStatus: 'canary_stopped',
      reason: 'Greenhouse submit canary mode requires CAREER_OS_GREENHOUSE_CANARY_APPLICATION_ID.',
      reportStatus: 'canary_stopped',
    };
  }
  if (!(canaryId === applicationId || canaryId === taskCanaryId)) {
    return {
      details,
      ok: false,
      outcomeStatus: 'canary_stopped',
      reason: 'Greenhouse submit canary mode is limited to the configured canary application id.',
      reportStatus: 'canary_stopped',
    };
  }
  if (!authorization) {
    return {
      details,
      ok: false,
      outcomeStatus: 'canary_stopped',
      reason: 'Greenhouse submit canary mode requires CAREER_OS_GREENHOUSE_SUBMIT_AUTHORIZATION or CAREER_OS_SUBMIT_RUN_AUTHORIZATION.',
      reportStatus: 'canary_stopped',
    };
  }
  return { details, ok: true, outcomeStatus: '', reason: '', reportStatus: undefined };
}

function parseWorkdayPolicyUrl(value) {
  const href = clean(value);
  if (!href) return { ok: false, reason: 'Workday single-canary mode requires a non-empty application URL.' };
  let parsed;
  try {
    parsed = new URL(href);
  } catch {
    return { ok: false, reason: 'Workday single-canary mode requires a valid HTTPS URL.' };
  }
  if (!/^https?:$/i.test(parsed.protocol)) {
    return { ok: false, reason: 'Workday single-canary mode requires an HTTP(S) URL.' };
  }
  const host = parsed.hostname.toLowerCase();
  const text = `${host} ${parsed.pathname} ${parsed.search}`.toLowerCase();
  const supported = /myworkdayjobs\.com|workday|phenom|careers\.cisco\.com/.test(text);
  if (!supported) return { ok: false, reason: 'Workday single-canary mode requires a Workday or Workday-mediated URL.' };
  const tenant = workdayPolicyTenant(host);
  const jobId = clean(
    parsed.searchParams.get('jobSeqNo')
    || parsed.searchParams.get('jobId')
    || parsed.searchParams.get('jobID')
    || parsed.searchParams.get('job')
    || parsed.searchParams.get('jid')
    || workdayPolicyPathJobId(parsed.pathname),
  );
  if (!tenant || !jobId) {
    return { ok: false, reason: 'Workday single-canary mode requires an unambiguous tenant and job id.' };
  }
  return {
    ok: true,
    identity: {
      canonicalUrl: `${parsed.origin}${parsed.pathname}${parsed.search}`,
      host,
      jobId,
      tenant,
    },
    reason: '',
  };
}

function workdayPolicyTenant(host) {
  if (/careers\.cisco\.com$/i.test(host)) return 'cisco';
  if (/myworkdayjobs\.com$/i.test(host)) {
    return host.replace(/\.myworkdayjobs\.com$/i, '');
  }
  return host.split('.')[0] || host;
}

function workdayPolicyPathJobId(pathname) {
  const decoded = decodeURIComponent(clean(pathname));
  const segments = decoded.split('/').map(clean).filter(Boolean);
  const jobIndex = segments.findIndex((segment) => segment.toLowerCase() === 'job');
  const jobSegments = jobIndex >= 0 ? segments.slice(jobIndex + 1) : segments;
  const actionIndex = jobSegments.findIndex((segment) => /^(apply|usemylastapplication|autofillwithresume|manual)$/i.test(segment));
  const identitySegments = actionIndex >= 0 ? jobSegments.slice(0, actionIndex) : jobSegments;
  const candidate = identitySegments.slice().reverse().find((segment) => !/^(en-us|external|apply|job)$/i.test(segment));
  if (!candidate || /^(en-us|external|apply|job)$/i.test(candidate)) return '';
  const suffix = candidate.match(/[_-]([A-Z]*\d[A-Z0-9-]*)$/i)?.[1];
  return clean(suffix || candidate);
}

function sameWorkdayPolicyJob(left, right) {
  return clean(left?.tenant).toLowerCase() === clean(right?.tenant).toLowerCase()
    && clean(left?.jobId).toLowerCase() === clean(right?.jobId).toLowerCase();
}

function boundedConfidence(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0.5;
  return Math.max(0, Math.min(1, number));
}

function clean(value) {
  return String(value || '').trim().replace(/^"|"$/g, '');
}
