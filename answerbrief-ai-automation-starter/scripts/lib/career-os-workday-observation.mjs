import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

import {
  findWorkdayAnswerEntry,
  loadWorkdayAnswerBank,
  normalizeQuestion as normalizeBankQuestion,
} from './career-os-workday-answer-bank.mjs';
import {
  buildWorkdayReviewFingerprint,
  parseWorkdayJobUrl,
} from './career-os-workday-production.mjs';

export const WORKDAY_OBSERVATION_ARTIFACT_FILES = [
  'session-summary.json',
  'active-tab-verification.json',
  'pages.json',
  'fields.json',
  'transitions.json',
  'resume-flow.json',
  'validation-events.json',
  'proposed-replay-map.json',
  'proposed-answer-bank-patch.json',
  'redaction-report.json',
  'evidence-index.json',
];

export const WORKDAY_ACTIVE_TAB_STATUSES = [
  'ACTIVE WORKDAY APPLICATION READY',
  'SIGN-IN REQUIRED',
  'WRONG TENANT',
  'WRONG JOB',
  'MULTIPLE MATCHING TABS',
  'APPLICATION NOT ACTIVE',
  'BROWSER ATTACHMENT FAILED',
  'NO ACTIVE WORKDAY APPLICATION FOUND',
];

export const WORKDAY_OBSERVATION_REUSE_CLASSES = [
  'reusable_verified',
  'reusable_but_reconfirm',
  'application_specific',
  'tenant_specific',
  'sensitive_user_confirmed',
  'voluntary_disclosure',
  'legal_acknowledgment',
  'human_only',
  'uncertain',
  'prohibited_from_inference',
];

const WORKDAY_PAGE_NAMES = [
  'My Information',
  'My Experience',
  'Application Questions',
  'Voluntary Disclosures',
  'Self Identify',
  'Review',
  'Submit',
];

const PROHIBITED_STORAGE = [
  'passwords',
  'security_codes',
  'otp_codes',
  'captcha_inputs',
  'cookies',
  'session_tokens',
  'hidden_credentials',
  'clipboard',
  'unrelated_tabs',
];

const SECRET_FIELD_PATTERNS = [
  ['password', /password|passphrase|current password|new password/i],
  ['security_code', /verification code|security code|one[ -]?time code|\botp\b|\bmfa\b|passcode|two[ -]?factor|authenticator/i],
  ['captcha', /captcha|verify you are human|human verification|security challenge/i],
  ['session_token', /session token|auth token|access token|refresh token|bearer|csrf|xsrf|cookie|secret|credential/i],
  ['security_answer', /security answer|security question|mother.?s maiden|memorable/i],
];

const AUTH_IDENTIFIER_PATTERN = /email|username|user id|login id|phone|mobile/i;
const AUTH_CONTEXT_PATTERN = /sign in|log in|login|create account|forgot password|verification|security code|multi.factor|mfa|password/i;
const LEGAL_PATTERN = /terms|conditions|acknowledge|certify|consent|privacy|signature|legal|policy|accurate|arbitration/i;
const VOLUNTARY_PATTERN = /voluntary|gender|race|ethnicity|hispanic|latino|veteran|military|disability|self.identification|self identify/i;
const DEMOGRAPHIC_PATTERN = /gender|race|ethnicity|hispanic|latino/i;
const VETERAN_PATTERN = /veteran|military/i;
const DISABILITY_PATTERN = /disability|accommodation/i;
const SPONSORSHIP_PATTERN = /sponsor|visa|immigration|now or in the future|authorized to work|legally authorized/i;
const TENANT_SPECIFIC_PATTERN = /t-mobile|deutsche telekom|softbank|affiliate|dealer|metro by t-mobile|contractor|relative|family member/i;
const RELOCATION_PATTERN = /relocat|local|move to|commute/i;
const EMPLOYMENT_HISTORY_PATTERN = /previously employed|current employer|employment history|start date|end date|work experience/i;
const COMPENSATION_PATTERN = /salary|compensation|pay|bonus|equity|wage/i;
const WORKDAY_APPLICATION_STRUCTURE_PATTERN = /my information|my experience|application questions|voluntary disclosures|self identify|self identification|review|submit|upload resume|work experience|education|job application/i;
const WORKDAY_APPLICATION_URL_PATTERN = /\/apply\/|\/job\/|\/candidate\/|\/application\//i;
const WORKDAY_AUTH_GATE_PATTERN = /sign in|log in|login|create account|forgot password|password reset|verification code|security code|one.time code|multi.factor|mfa|captcha|verify you are human|security challenge/i;
const WORKDAY_INACTIVE_PATTERN = /no longer accepting applications|job is no longer available|job posting is no longer available|position has been filled|posting has expired|this job is closed|application is no longer active/i;
const WORKDAY_REVIEW_PATTERN = /review|summary|submit application|application review/i;
const execFileAsync = promisify(execFile);

export function workdayObserveModeEnabled(env = process.env) {
  return clean(env.CAREER_OS_WORKDAY_OBSERVE_MODE) === '1';
}

export function defaultWorkdayObservationCanaryId(url) {
  const parsed = parseWorkdayJobUrl(url);
  if (!parsed.ok) return 'workday-observation-unqualified';
  return `workday-observe-${parsed.tenant}-${parsed.jobId}`.toLowerCase().replace(/[^a-z0-9-]+/g, '-');
}

export function validateWorkdayObservationBounds(input = {}) {
  const env = input.env || process.env;
  const url = clean(input.url || env.CAREER_OS_WORKDAY_OBSERVE_URL || env.CAREER_OS_WORKDAY_CANARY_URL);
  const configuredUrl = clean(env.CAREER_OS_WORKDAY_CANARY_URL);
  const canaryId = clean(input.canaryId || env.CAREER_OS_WORKDAY_CANARY_ID || env.CAREER_OS_WORKDAY_CANARY_APPLICATION_ID);
  const configuredCanaryId = clean(env.CAREER_OS_WORKDAY_CANARY_ID || env.CAREER_OS_WORKDAY_CANARY_APPLICATION_ID);
  const parsed = parseWorkdayJobUrl(url);
  const configuredIdentity = configuredUrl ? parseWorkdayJobUrl(configuredUrl) : null;
  const approvedOrigins = approvedWorkdayOrigins({
    configuredIdentity,
    env,
    extraOrigins: input.approvedOrigins,
  });
  const details = {
    canaryId,
    configuredCanaryId,
    configuredUrl: Boolean(configuredUrl),
    observeModeEnabled: workdayObserveModeEnabled(env),
    queueEnabled: clean(env.CAREER_OS_QUEUE_ENABLED) === '1',
    requestedUrl: url,
    workdayIdentity: parsed.ok ? publicIdentity(parsed) : null,
    configuredIdentity: configuredIdentity?.ok ? publicIdentity(configuredIdentity) : null,
    approvedOrigins: Array.from(approvedOrigins),
  };

  if (input.requireMode !== false && !details.observeModeEnabled) {
    return blockedObservation('CAREER_OS_WORKDAY_OBSERVE_MODE=1 is required before opening a live observation browser.', details);
  }
  if (details.queueEnabled && input.allowQueueEnabled !== true) {
    return blockedObservation('CAREER_OS_QUEUE_ENABLED must remain disabled during Workday observation mode.', details);
  }
  if (!url) return blockedObservation('A single approved Workday application URL is required.', details);
  if (!parsed.ok) return blockedObservation(`Workday observation URL is not qualified: ${parsed.reason}.`, details);
  if (!canaryId) return blockedObservation('A single Workday observation canary id is required.', details);
  if (configuredCanaryId && configuredCanaryId !== canaryId) {
    return blockedObservation('The requested observation canary id does not match CAREER_OS_WORKDAY_CANARY_ID.', details);
  }
  if (input.requireConfiguredUrl !== false && !configuredUrl) {
    return blockedObservation('CAREER_OS_WORKDAY_CANARY_URL must be set to the approved observation URL.', details);
  }
  if (configuredIdentity && !configuredIdentity.ok) {
    return blockedObservation(`CAREER_OS_WORKDAY_CANARY_URL is not qualified: ${configuredIdentity.reason}.`, details);
  }
  if (configuredIdentity?.ok && !sameWorkdayIdentity(parsed, configuredIdentity)) {
    return blockedObservation('The requested observation URL does not match CAREER_OS_WORKDAY_CANARY_URL tenant/job identity.', details);
  }
  if (input.expectedTenant && clean(input.expectedTenant).toLowerCase() !== clean(parsed.tenant).toLowerCase()) {
    return blockedObservation('The requested observation URL does not match the expected Workday tenant.', details);
  }
  if (input.expectedJobId && clean(input.expectedJobId).toLowerCase() !== clean(parsed.jobId).toLowerCase()) {
    return blockedObservation('The requested observation URL does not match the expected Workday job id.', details);
  }
  if (!isApprovedWorkdayHost(parsed.host)) {
    return blockedObservation('The requested observation origin is not an approved Workday origin.', details);
  }
  const origin = originForUrl(parsed.canonicalUrl);
  if (!approvedOrigins.has(origin)) {
    return blockedObservation('The requested observation origin is not in the approved origin allowlist.', details);
  }

  return {
    ok: true,
    reason: 'Workday observation is bounded to one canary id, tenant, job id, and approved origin.',
    details: {
      ...details,
      approvedOrigin: origin,
      canonicalUrl: parsed.canonicalUrl,
      workdayIdentity: publicIdentity(parsed),
    },
  };
}

export function classifyWorkdayObservationRedaction(field = {}, context = {}) {
  if (field.redactedInBrowser) {
    return {
      category: clean(field.redactionCategory) || 'credential_or_auth_gate',
      gateType: clean(field.redactionGateType) || 'authentication',
      reason: 'The browser-side observer redacted this field before handing it to the artifact writer.',
      redacted: true,
    };
  }
  const descriptor = [
    field.label,
    field.questionText,
    field.ariaLabel,
    field.placeholder,
    field.name,
    field.id,
    field.autocomplete,
    field.type,
    field.role,
  ].map(clean).join(' ');
  const type = clean(field.type).toLowerCase();
  const contextText = clean(`${context.pageName || ''} ${context.sectionName || ''} ${context.pageText || ''}`);
  if (type === 'hidden') {
    return {
      category: 'hidden_credential',
      gateType: 'hidden_credential',
      reason: 'Hidden fields are never persisted by Workday observation mode.',
      redacted: true,
    };
  }
  for (const [gateType, pattern] of SECRET_FIELD_PATTERNS) {
    if (pattern.test(descriptor)) {
      return {
        category: gateType,
        gateType,
        reason: `${gateType} fields are human-only and excluded from persisted values.`,
        redacted: true,
      };
    }
  }
  if (AUTH_CONTEXT_PATTERN.test(contextText) && AUTH_IDENTIFIER_PATTERN.test(descriptor)) {
    return {
      category: 'auth_identifier',
      gateType: 'authentication',
      reason: 'Authentication identifiers are recorded as gate completion only.',
      redacted: true,
    };
  }
  return {
    category: '',
    gateType: '',
    reason: '',
    redacted: false,
  };
}

export function normalizeObservedWorkdayField(raw = {}, context = {}) {
  const label = clean(raw.questionText || raw.label || raw.ariaLabel || raw.placeholder || raw.name || raw.id || 'Unnamed Workday field');
  if (!label) return null;
  const pageName = clean(raw.pageName || context.pageName || inferWorkdayPageName(`${label} ${context.pageText || ''}`));
  const sectionName = clean(raw.sectionName || context.sectionName || pageName);
  const redaction = classifyWorkdayObservationRedaction({ ...raw, label }, { ...context, pageName, sectionName });
  const committed = isCommittedObservation(raw);
  const committedRawValue = committed ? raw.committedValue ?? raw.selectedAnswer ?? raw.currentValue ?? raw.value : undefined;
  const selectedAnswer = redaction.redacted ? null : sanitizePrimitiveValue(committedRawValue);
  const sensitivity = classifyWorkdayObservationSensitivity(label, { ...raw, sectionName, pageName, redaction });
  const reuse = classifyWorkdayObservationReuse(label, { ...raw, redaction, sensitivity, selectedAnswer });
  const selector = buildWorkdaySemanticSelector({ ...raw, label, pageName, sectionName });
  const observedAt = clean(raw.observedAt || raw.timestamp || context.timestamp) || new Date().toISOString();
  const controlType = normalizeControlType(raw);
  const selectedFiles = controlType === 'file_upload' ? normalizeSelectedFiles(raw.selectedFiles || committedRawValue) : [];

  return {
    id: stableObservationId({ label, pageName, sectionName, selector }),
    canaryId: clean(context.canaryId),
    tenant: clean(context.tenant),
    jobId: clean(context.jobId),
    pageName,
    sectionName,
    questionText: label,
    exactLabel: label,
    normalizedQuestion: normalizeWorkdayObservationQuestion(label),
    controlType,
    accept: clean(raw.accept),
    acceptedFileTypes: normalizeAcceptTypes(raw.accept || raw.acceptedFileTypes),
    options: normalizeOptions(raw.options),
    selectedFiles,
    selectedAnswer,
    valueCaptured: Boolean(committed && selectedAnswer !== null && selectedAnswer !== ''),
    valueCapturePolicy: redaction.redacted ? 'redacted_gate_only' : (committed ? 'committed_after_blur_change_or_transition' : 'not_committed'),
    prefilled: Boolean(raw.prefilled),
    changed: Boolean(raw.changed),
    required: Boolean(raw.required),
    validationMessages: normalizeMessages(raw.validationMessages || raw.validation || raw.errors),
    selector,
    semanticAnchors: selector.anchors,
    sensitivity,
    reuseAuthorization: reuse.primary,
    reuseClasses: reuse.classes,
    requiresPromotionApproval: reuse.requiresPromotionApproval,
    safeForAutonomousReplay: reuse.safeForAutonomousReplay,
    prohibitedFromInference: reuse.classes.includes('prohibited_from_inference'),
    confidence: observationConfidence(raw, selector, redaction, committed),
    provenance: {
      source: clean(context.source) || 'career_os_workday_observation_mode',
      observedAt,
      eventType: committedEventType(raw),
      applicationSpecific: reuse.classes.includes('application_specific') || reuse.classes.includes('legal_acknowledgment'),
      manualCompletion: true,
    },
    redaction: redaction.redacted ? {
      category: redaction.category,
      gateType: redaction.gateType,
      reason: redaction.reason,
    } : null,
  };
}

export function normalizeObservedWorkdayFields(fields = [], context = {}) {
  return fields
    .map((field) => normalizeObservedWorkdayField(field, context))
    .filter(Boolean);
}

export function buildWorkdaySemanticSelector(field = {}) {
  const normalizedQuestion = normalizeWorkdayObservationQuestion(field.questionText || field.label);
  const anchors = {
    pageName: clean(field.pageName),
    sectionName: clean(field.sectionName),
    exactLabel: clean(field.questionText || field.label),
    normalizedQuestion,
    ariaLabel: clean(field.ariaLabel),
    role: clean(field.role),
    controlType: normalizeControlType(field),
    name: clean(field.name),
    id: clean(field.id),
    dataAutomationId: clean(field.dataAutomationId),
  };
  return {
    strategy: 'semantic_anchor',
    preferred: true,
    anchors,
    secondary: {
      css: buildSecondaryCssSelector(field),
      xpath: '',
    },
  };
}

export function classifyWorkdayObservationSensitivity(label, context = {}) {
  const text = clean(`${label} ${context.sectionName || ''} ${context.pageName || ''}`);
  if (context.redaction?.redacted) return 'credential_or_auth_gate';
  if (LEGAL_PATTERN.test(text)) return 'legal';
  if (DISABILITY_PATTERN.test(text)) return 'disability';
  if (VETERAN_PATTERN.test(text)) return 'veteran';
  if (DEMOGRAPHIC_PATTERN.test(text)) return 'demographic';
  if (VOLUNTARY_PATTERN.test(text)) return 'protected_status';
  if (COMPENSATION_PATTERN.test(text)) return 'salary';
  if (SPONSORSHIP_PATTERN.test(text)) return 'sponsorship_or_work_authorization';
  if (RELOCATION_PATTERN.test(text)) return 'relocation';
  if (EMPLOYMENT_HISTORY_PATTERN.test(text)) return 'employment_history';
  if (TENANT_SPECIFIC_PATTERN.test(text)) return 'tenant_specific_fact';
  if (/email|phone|address|city|state|postal|name|linkedin/i.test(text)) return 'profile';
  return 'standard';
}

export function classifyWorkdayObservationReuse(label, context = {}) {
  const text = clean(`${label} ${context.sectionName || ''} ${context.pageName || ''}`);
  const classes = new Set();
  if (context.redaction?.redacted) {
    classes.add('human_only');
    classes.add('prohibited_from_inference');
  } else if (LEGAL_PATTERN.test(text)) {
    classes.add('legal_acknowledgment');
    classes.add('application_specific');
  } else if (VOLUNTARY_PATTERN.test(text)) {
    classes.add('voluntary_disclosure');
    classes.add('sensitive_user_confirmed');
    classes.add('prohibited_from_inference');
  } else if (TENANT_SPECIFIC_PATTERN.test(text)) {
    classes.add('tenant_specific');
    classes.add('reusable_but_reconfirm');
  } else if (SPONSORSHIP_PATTERN.test(text) || RELOCATION_PATTERN.test(text) || EMPLOYMENT_HISTORY_PATTERN.test(text) || COMPENSATION_PATTERN.test(text)) {
    classes.add('reusable_but_reconfirm');
  } else if (context.selectedAnswer === null || context.selectedAnswer === undefined || context.selectedAnswer === '') {
    classes.add('uncertain');
  } else {
    classes.add('reusable_verified');
  }

  if (!classes.size) classes.add('uncertain');
  const ordered = WORKDAY_OBSERVATION_REUSE_CLASSES.filter((item) => classes.has(item));
  return {
    classes: ordered,
    primary: ordered[0] || 'uncertain',
    requiresPromotionApproval: ordered.some((item) => [
      'application_specific',
      'sensitive_user_confirmed',
      'voluntary_disclosure',
      'legal_acknowledgment',
      'human_only',
      'uncertain',
      'prohibited_from_inference',
    ].includes(item)),
    safeForAutonomousReplay: ordered.length === 1 && ordered[0] === 'reusable_verified',
  };
}

export function buildWorkdayObservationArtifacts(session = {}, pages = [], options = {}) {
  const fields = pages.flatMap((page) => Array.isArray(page.fields) ? page.fields : []);
  const transitions = pages.flatMap((page) => Array.isArray(page.transitions) ? page.transitions : []);
  const validations = pages.flatMap((page) => Array.isArray(page.validationEvents) ? page.validationEvents : []);
  const finalReview = detectWorkdayFinalReview({
    pages,
    fields,
    transitions,
    task: {
      applicationId: session.canaryId,
      employer: session.company,
      position: session.role,
    },
    workdayIdentity: session.workdayIdentity,
  });
  const resumeFlow = buildWorkdayResumeFlowEvidence({
    canaryId: session.canaryId,
    fields,
    pages,
    resume: options.resume,
    uploadControls: pages.flatMap((page) => Array.isArray(page.resumeUploadControls) ? page.resumeUploadControls : []),
    persistsToReview: finalReview.reviewReached && fields.some((field) => /resume|cv/i.test(`${field.questionText} ${field.sectionName} ${field.pageName}`)),
  });
  const proposedReplayMap = buildWorkdayProposedReplayMap(fields, {
    canaryId: session.canaryId,
    jobId: session.workdayIdentity?.jobId,
    tenant: session.workdayIdentity?.tenant,
  });
  const proposedAnswerBankPatch = buildWorkdayProposedAnswerBankPatch(fields, {
    bank: options.answerBank,
    canaryId: session.canaryId,
    company: session.company,
    jobId: session.workdayIdentity?.jobId,
    role: session.role,
    source: session.provenanceSource || 'workday_observation_mode',
    tenant: session.workdayIdentity?.tenant,
  });
  const redactionReport = buildWorkdayObservationRedactionReport(fields, pages, {
    canaryId: session.canaryId,
  });
  const sessionSummary = {
    canaryId: clean(session.canaryId),
    company: clean(session.company),
    role: clean(session.role),
    jobId: clean(session.workdayIdentity?.jobId),
    tenant: clean(session.workdayIdentity?.tenant),
    canonicalUrl: clean(session.workdayIdentity?.canonicalUrl || session.url),
    status: clean(session.status) || 'observation_artifacts_ready',
    attachmentSucceeded: Boolean(session.attachmentSucceeded),
    observeModeEnabled: Boolean(session.observeModeEnabled),
    broaderQueueDisabled: session.queueEnabled === false,
    browserProfileDir: clean(session.browserProfileDir),
    startedAt: clean(session.startedAt),
    completedAt: clean(session.completedAt),
    startingPage: clean(session.startingPage || pages[0]?.pageName),
    endingPage: clean(session.endingPage || pages[pages.length - 1]?.pageName),
    reviewReached: Boolean(session.reviewReached || finalReview.reviewReached),
    submissionPerformed: Boolean(session.submissionPerformed),
    submissionMethod: clean(session.submissionMethod) || 'none',
    resumeIdentified: Boolean(resumeFlow.resumeArtifact.artifactId || resumeFlow.fileFields.length || resumeFlow.uploadControls.length),
    counts: {
      pages: pages.length,
      fields: fields.length,
      transitions: transitions.length,
      validationEvents: validations.length,
      redactedFields: redactionReport.redactedFields.length,
      proposedAnswerBankEntries: proposedAnswerBankPatch.entries.length,
      replayMapEntries: proposedReplayMap.entries.length,
    },
    guardrails: {
      singleCanaryOnly: true,
      noAutonomousSubmit: true,
      noGlobalKeylogger: true,
      committedValuesOnly: true,
      proposedAnswerBankPatchRequiresApproval: true,
    },
    finalReview,
  };
  const pagesJson = pages.map((page) => ({
    canaryId: clean(session.canaryId),
    pageId: page.pageId || stableObservationId({ label: page.pageName, pageName: page.pageName, sectionName: page.url }),
    pageName: clean(page.pageName),
    sectionNames: Array.isArray(page.sectionNames) ? page.sectionNames.map(clean).filter(Boolean) : [],
    url: clean(page.url),
    title: clean(page.title),
    capturedAt: clean(page.capturedAt),
    actionControls: Array.isArray(page.actionControls) ? page.actionControls : [],
  }));
  const evidenceIndex = buildWorkdayEvidenceIndex(sessionSummary, {
    fields,
    pages: pagesJson,
    proposedAnswerBankPatch,
    proposedReplayMap,
    redactionReport,
    resumeFlow,
    transitions,
    validations,
  });

  return {
    'session-summary.json': sessionSummary,
    'active-tab-verification.json': session.activeTabVerification || null,
    'pages.json': pagesJson,
    'fields.json': fields,
    'transitions.json': transitions,
    'resume-flow.json': resumeFlow,
    'validation-events.json': validations,
    'proposed-replay-map.json': proposedReplayMap,
    'proposed-answer-bank-patch.json': proposedAnswerBankPatch,
    'redaction-report.json': redactionReport,
    'evidence-index.json': evidenceIndex,
  };
}

export function writeWorkdayObservationArtifacts(baseDir, artifactSet) {
  fs.mkdirSync(baseDir, { recursive: true });
  const written = [];
  for (const fileName of WORKDAY_OBSERVATION_ARTIFACT_FILES) {
    const value = artifactSet[fileName] ?? null;
    const filePath = path.join(baseDir, fileName);
    fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    written.push(filePath);
  }
  return written;
}

export function buildWorkdayProposedReplayMap(fields = [], context = {}) {
  const entries = fields
    .filter((field) => clean(field.questionText) && !field.redaction)
    .map((field) => ({
      canaryId: clean(context.canaryId || field.canaryId),
      tenant: clean(context.tenant || field.tenant),
      jobId: clean(context.jobId || field.jobId),
      pageName: clean(field.pageName),
      sectionName: clean(field.sectionName),
      questionText: clean(field.questionText),
      normalizedQuestion: clean(field.normalizedQuestion),
      controlType: clean(field.controlType),
      options: Array.isArray(field.options) ? field.options : [],
      selectedAnswer: field.selectedAnswer ?? null,
      semanticSelector: field.selector,
      selectorPreference: 'semantic_anchor_first',
      canReplayAutomatically: Boolean(field.safeForAutonomousReplay),
      replayGate: field.safeForAutonomousReplay ? 'none' : gateForReuseClasses(field.reuseClasses),
      confidence: boundedConfidence(field.confidence),
    }));
  return {
    generatedAt: new Date().toISOString(),
    selectorPolicy: 'semantic anchors are authoritative; CSS is secondary evidence only.',
    finalSubmit: {
      autonomousSubmitAllowed: false,
      requiredApproval: 'exact reviewed application approval',
    },
    entries,
    replayReadinessReport: entries.map((entry) => ({
      answerBankKey: entry.normalizedQuestion.replace(/\s+/g, '_'),
      confidence: entry.confidence,
      fallbackBehavior: entry.canReplayAutomatically ? 'fill_by_semantic_anchor_then_preserve_existing_value' : 'pause_for_operator_confirmation',
      reason: replayReadinessReason(entry),
      semanticSelectorEvidence: entry.semanticSelector?.anchors || {},
      status: replayReadinessStatus(entry),
    })),
    counts: {
      total: entries.length,
      autonomous: entries.filter((entry) => entry.canReplayAutomatically).length,
      gated: entries.filter((entry) => !entry.canReplayAutomatically).length,
    },
  };
}

export function buildWorkdayProposedAnswerBankPatch(fields = [], options = {}) {
  const bank = options.bank || safeLoadAnswerBank();
  const source = clean(options.source) || 'workday_observation_mode';
  const canaryId = clean(options.canaryId);
  const entries = [];
  const conflicts = [];
  const skipped = [];

  for (const field of fields) {
    if (!clean(field.questionText)) continue;
    if (field.redaction) {
      skipped.push({ questionText: field.questionText, reason: 'redacted_human_only' });
      continue;
    }
    if (field.controlType === 'file_upload') {
      skipped.push({ questionText: field.questionText, reason: 'resume_upload_tracked_separately' });
      continue;
    }
    if (field.selectedAnswer === null || field.selectedAnswer === undefined || field.selectedAnswer === '') {
      skipped.push({ questionText: field.questionText, reason: 'no_committed_answer' });
      continue;
    }
    const match = bank ? findWorkdayAnswerEntry(field.questionText, bank) : null;
    const conflict = match && typeof match.answer !== 'object'
      && clean(match.answer)
      && clean(match.answer).toLowerCase() !== clean(field.selectedAnswer).toLowerCase();
    if (conflict) {
      conflicts.push({
        canonicalField: clean(match.canonicalField),
        existingAnswer: safeReportAnswer(match),
        observedAnswer: field.selectedAnswer,
        questionText: field.questionText,
      });
    }
    const legal = field.reuseClasses?.includes('legal_acknowledgment');
    const sensitive = field.reuseClasses?.some((item) => ['sensitive_user_confirmed', 'voluntary_disclosure', 'prohibited_from_inference'].includes(item));
    const uncertain = field.reuseClasses?.includes('uncertain') || boundedConfidence(field.confidence) < 0.75;
    entries.push({
      canonicalField: match?.canonicalField || canonicalFieldFromQuestion(field.questionText),
      matchedExisting: Boolean(match),
      questionText: field.questionText,
      normalizedQuestion: field.normalizedQuestion || normalizeWorkdayObservationQuestion(field.questionText),
      possibleLabelVariations: uniqueValues([field.exactLabel, field.questionText, field.normalizedQuestion]),
      answer: field.selectedAnswer,
      answerType: answerTypeForObservedField(field),
      status: legal
        ? 'human_only'
        : (field.reuseClasses?.includes('reusable_verified') ? 'reusable_verified' : 'reusable_but_reconfirm'),
      sensitivity: field.sensitivity || 'standard',
      authorization: legal
        ? 'application_specific_only'
        : (sensitive || uncertain ? 'requires_user_approval_before_promotion' : 'observed_user_selected'),
      requiresApplicationSpecificConfirmation: Boolean(legal || field.reuseClasses?.includes('application_specific')),
      sensitive: Boolean(sensitive),
      uncertain: Boolean(uncertain),
      promotionApproved: false,
      provenance: [{
        source,
        canaryId,
        tenant: clean(options.tenant || field.tenant),
        jobId: clean(options.jobId || field.jobId),
        company: clean(options.company),
        role: clean(options.role),
        observedAt: field.provenance?.observedAt || new Date().toISOString(),
        status: 'observed_manual_completion_pending_review',
      }],
      replay: {
        selector: field.selector,
        safeForAutonomousReplay: Boolean(field.safeForAutonomousReplay),
        replayGate: gateForReuseClasses(field.reuseClasses),
      },
      conflicts: conflict ? [{
        value: field.selectedAnswer,
        source,
        reason: 'Observed answer differs from an existing canonical Workday answer-bank entry.',
      }] : [],
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    source,
    canaryId,
    promotionPolicy: 'review_required; sensitive, legal, and uncertain entries are never promoted automatically.',
    entries,
    reviewSections: {
      matchedExistingAnswers: entries.filter((entry) => entry.matchedExisting),
      newlyObservedOrdinaryAnswers: entries.filter((entry) => !entry.matchedExisting && !entry.sensitive && !entry.requiresApplicationSpecificConfirmation && !entry.uncertain && !entry.replay?.replayGate?.includes('tenant')),
      sensitiveAnswers: entries.filter((entry) => entry.sensitive),
      voluntaryDisclosures: entries.filter((entry) => entry.replay?.replayGate === 'sensitive_answer_requires_explicit_user_confirmation' && /gender|race|ethnicity|veteran|disability|self/i.test(entry.normalizedQuestion)),
      legalAcknowledgments: entries.filter((entry) => entry.requiresApplicationSpecificConfirmation),
      applicationSpecificAnswers: entries.filter((entry) => entry.requiresApplicationSpecificConfirmation || entry.replay?.replayGate === 'legal_acknowledgment_requires_application_specific_approval'),
      tenantSpecificAnswers: entries.filter((entry) => entry.replay?.replayGate === 'tenant_specific_reconfirm'),
      uncertainAnswers: entries.filter((entry) => entry.uncertain),
      conflictingAnswers: conflicts,
      staleAnswers: [],
    },
    skipped,
    conflicts,
    counts: {
      entries: entries.length,
      sensitive: entries.filter((entry) => entry.sensitive).length,
      legal: entries.filter((entry) => entry.requiresApplicationSpecificConfirmation).length,
      uncertain: entries.filter((entry) => entry.uncertain).length,
      conflicts: conflicts.length,
    },
  };
}

export function buildWorkdayObservationRedactionReport(fields = [], pages = [], options = {}) {
  const redactedFields = fields
    .filter((field) => field.redaction)
    .map((field) => ({
      questionText: field.questionText,
      normalizedQuestion: field.normalizedQuestion,
      pageName: field.pageName,
      sectionName: field.sectionName,
      category: field.redaction.category,
      gateType: field.redaction.gateType,
      reason: field.redaction.reason,
    }));
  return {
    generatedAt: new Date().toISOString(),
    canaryId: clean(options.canaryId),
    protectedTypes: PROHIBITED_STORAGE,
    policy: {
      noGlobalKeylogger: true,
      noKeyboardEventCapture: true,
      noCookieOrTokenCapture: true,
      noClipboardCapture: true,
      noHiddenCredentialCapture: true,
      authFieldsPersistGateOnly: true,
    },
    redactedFields,
    pageCount: pages.length,
    credentialValuesPersisted: false,
  };
}

export function buildWorkdayResumeFlowEvidence(input = {}) {
  const resume = input.resume || {};
  const filePath = clean(resume.path || resume.filePath || resume.runtimePath);
  const hash = filePath && fs.existsSync(filePath) ? sha256File(filePath) : clean(resume.hash);
  const uploadControls = (input.uploadControls || []).map((control) => ({
    pageName: clean(control.pageName),
    sectionName: clean(control.sectionName),
    label: clean(control.label || control.questionText),
    acceptedFileTypes: normalizeAcceptTypes(control.accept || control.acceptedFileTypes),
    selector: control.selector || buildWorkdaySemanticSelector(control),
    validationMessages: normalizeMessages(control.validationMessages),
  }));
  const fileFields = (input.fields || [])
    .filter((field) => field.controlType === 'file_upload')
    .map((field) => ({
      pageName: field.pageName,
      sectionName: field.sectionName,
      questionText: field.questionText,
      acceptedFileTypes: normalizeAcceptTypes(field.accept || field.acceptedFileTypes),
      selectedFiles: Array.isArray(field.selectedFiles) ? field.selectedFiles : [],
      validationMessages: field.validationMessages || [],
    }));
  return {
    canaryId: clean(input.canaryId),
    uploadControls,
    fileFields,
    resumeArtifact: {
      artifactId: clean(resume.artifactId),
      runtimePath: filePath,
      fileName: clean(resume.fileName || path.basename(filePath || '')),
      size: Number(resume.size || (filePath && fs.existsSync(filePath) ? fs.statSync(filePath).size : 0)) || 0,
      sha256: hash,
    },
    uploadStartedAt: clean(resume.uploadStartedAt),
    uploadCompletedAt: clean(resume.uploadCompletedAt),
    parsedFieldsObserved: (input.fields || []).filter((field) => field.controlType !== 'file_upload' && /resume|experience|education|skill/i.test(clean(field.sectionName))).length,
    persistsToReview: Boolean(input.persistsToReview),
    validationErrors: normalizeMessages(input.validationErrors),
  };
}

export async function installWorkdayObservationRecorder(page) {
  if (!page || typeof page.evaluate !== 'function') return false;
  await page.evaluate(() => {
    if (window.__careerOsWorkdayObservationInstalled) return;
    window.__careerOsWorkdayObservationInstalled = true;
    window.__careerOsWorkdayObservationEvents = window.__careerOsWorkdayObservationEvents || [];
    const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim();
    const authContextPattern = /sign in|log in|login|create account|forgot password|verification|security code|multi.factor|mfa|password/i;
    const authIdentifierPattern = /email|username|user id|login id|phone|mobile/i;
    const secretPattern = /password|passphrase|verification code|security code|one[ -]?time code|\botp\b|\bmfa\b|passcode|captcha|session token|auth token|access token|refresh token|cookie|secret|csrf|xsrf|credential/i;
    const visible = (element) => {
      if (!(element instanceof HTMLElement)) return false;
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
    };
    const labelFor = (element) => {
      const explicit = element.id ? document.querySelector(`label[for="${CSS.escape(element.id)}"]`) : null;
      if (explicit) return normalize(explicit.textContent);
      const wrapped = element.closest('label');
      if (wrapped) return normalize(wrapped.textContent);
      const field = element.closest('[data-automation-id], [role="group"], fieldset, div, section, form');
      const nearby = field?.querySelector?.('label, legend, [data-automation-id*="label" i], [role="heading"]');
      return normalize(nearby?.textContent || element.getAttribute('aria-label') || element.getAttribute('placeholder') || element.getAttribute('name') || element.id);
    };
    const sectionFor = (element) => {
      const region = element.closest('section, form, fieldset, [role="region"], [data-automation-id]');
      const heading = region?.querySelector?.('h1, h2, h3, legend, [role="heading"]');
      return normalize(heading?.textContent);
    };
    const pageName = () => {
      const body = normalize(document.body?.innerText || '');
      for (const name of ['My Information', 'My Experience', 'Application Questions', 'Voluntary Disclosures', 'Self Identify', 'Review', 'Submit']) {
        if (body.toLowerCase().includes(name.toLowerCase())) return name;
      }
      return normalize(document.querySelector('h1, [role="heading"]')?.textContent || document.title);
    };
    const optionsFor = (element) => {
      if (element instanceof HTMLSelectElement) {
        return Array.from(element.options).map((option) => ({
          label: normalize(option.label || option.textContent),
          selected: Boolean(option.selected),
          value: String(option.value || ''),
        }));
      }
      return [];
    };
    const valueFor = (element) => {
      if (element instanceof HTMLInputElement && element.type === 'file') {
        return Array.from(element.files || []).map((file) => ({
          name: file.name,
          size: file.size,
          type: file.type,
          lastModified: file.lastModified,
        }));
      }
      if (element instanceof HTMLInputElement && ['checkbox', 'radio'].includes(element.type)) return element.checked ? (element.value || 'checked') : '';
      if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) return String(element.value || '');
      return normalize(element.getAttribute('aria-valuetext') || element.textContent);
    };
    const redactionFor = (element, label) => {
      const descriptor = normalize(`${label} ${element.getAttribute('aria-label') || ''} ${element.getAttribute('placeholder') || ''} ${element.getAttribute('name') || ''} ${element.id || ''} ${element.getAttribute('autocomplete') || ''} ${element.getAttribute('type') || ''}`);
      const context = normalize(element.closest('form, section, main, body')?.textContent || '');
      if (element instanceof HTMLInputElement && element.type === 'hidden') return { redacted: true, category: 'hidden_credential', gateType: 'hidden_credential' };
      if (secretPattern.test(descriptor)) return { redacted: true, category: 'credential_or_security_code', gateType: 'authentication' };
      if (authContextPattern.test(context) && authIdentifierPattern.test(descriptor)) return { redacted: true, category: 'auth_identifier', gateType: 'authentication' };
      return { redacted: false };
    };
    const capture = (event) => {
      const element = event.target;
      if (!(element instanceof HTMLElement) || !visible(element)) return;
      if (!/^(INPUT|SELECT|TEXTAREA)$/.test(element.tagName) && !['combobox', 'checkbox', 'radio'].includes(element.getAttribute('role') || '')) return;
      const label = labelFor(element);
      const redaction = redactionFor(element, label);
      window.__careerOsWorkdayObservationEvents.push({
        eventType: event.type,
        capturePhase: event.type === 'blur' ? 'blur' : 'change',
        timestamp: new Date().toISOString(),
        pageName: pageName(),
        sectionName: sectionFor(element),
        label,
        ariaLabel: normalize(element.getAttribute('aria-label')),
        placeholder: normalize(element.getAttribute('placeholder')),
        name: normalize(element.getAttribute('name')),
        id: normalize(element.id),
        role: normalize(element.getAttribute('role')),
        tagName: element.tagName.toLowerCase(),
        type: element instanceof HTMLInputElement ? String(element.type || '').toLowerCase() : element.tagName.toLowerCase(),
        autocomplete: normalize(element.getAttribute('autocomplete')),
        dataAutomationId: normalize(element.getAttribute('data-automation-id')),
        committedValue: redaction.redacted ? null : valueFor(element),
        selectedFiles: element instanceof HTMLInputElement && element.type === 'file' ? valueFor(element) : [],
        options: optionsFor(element),
        redactedInBrowser: Boolean(redaction.redacted),
        redactionCategory: redaction.category || '',
        redactionGateType: redaction.gateType || '',
      });
    };
    const captureAction = (event) => {
      const element = event.target instanceof HTMLElement ? event.target.closest('button, input[type="button"], input[type="submit"], a[role="button"]') : null;
      if (!element || !visible(element)) return;
      window.__careerOsWorkdayObservationEvents.push({
        eventType: 'action_click',
        capturePhase: 'navigation_action',
        timestamp: new Date().toISOString(),
        pageName: pageName(),
        label: normalize(element.textContent || element.getAttribute('value') || element.getAttribute('aria-label')),
        actionKind: normalize(element.getAttribute('data-automation-id') || element.getAttribute('type') || element.tagName.toLowerCase()),
      });
    };
    document.addEventListener('change', capture, true);
    document.addEventListener('blur', capture, true);
    document.addEventListener('click', captureAction, true);
    window.addEventListener('pagehide', () => {
      window.__careerOsWorkdayObservationEvents.push({
        eventType: 'page_transition',
        capturePhase: 'page_transition',
        timestamp: new Date().toISOString(),
        pageName: pageName(),
        url: location.href,
      });
    });
  });
  return true;
}

export async function readWorkdayObservationEvents(page) {
  if (!page || typeof page.evaluate !== 'function') return [];
  return page.evaluate(() => {
    const events = Array.isArray(window.__careerOsWorkdayObservationEvents)
      ? window.__careerOsWorkdayObservationEvents.slice()
      : [];
    window.__careerOsWorkdayObservationEvents = [];
    return events;
  }).catch(() => []);
}

export async function scanWorkdayObservationDom(page, context = {}) {
  if (!page || typeof page.evaluate !== 'function') return emptyObservationPage(context);
  const snapshot = await page.evaluate(() => {
    const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim();
    const pageNames = ['My Information', 'My Experience', 'Application Questions', 'Voluntary Disclosures', 'Self Identify', 'Review', 'Submit'];
    const authContextPattern = /sign in|log in|login|create account|forgot password|verification|security code|multi.factor|mfa|password/i;
    const authIdentifierPattern = /email|username|user id|login id|phone|mobile/i;
    const secretPattern = /password|passphrase|verification code|security code|one[ -]?time code|\botp\b|\bmfa\b|passcode|captcha|session token|auth token|access token|refresh token|cookie|secret|csrf|xsrf|credential/i;
    const visible = (element) => {
      if (!(element instanceof HTMLElement)) return false;
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
    };
    const bodyText = normalize(document.body?.innerText || '');
    const pageName = pageNames.find((name) => bodyText.toLowerCase().includes(name.toLowerCase()))
      || normalize(document.querySelector('h1, [role="heading"]')?.textContent || document.title);
    const labelFor = (element) => {
      const explicit = element.id ? document.querySelector(`label[for="${CSS.escape(element.id)}"]`) : null;
      if (explicit) return normalize(explicit.textContent);
      const wrapped = element.closest('label');
      if (wrapped) return normalize(wrapped.textContent);
      const field = element.closest('[data-automation-id], [role="group"], fieldset, div, section, form');
      const nearby = field?.querySelector?.('label, legend, [data-automation-id*="label" i], [role="heading"]');
      return normalize(nearby?.textContent || element.getAttribute('aria-label') || element.getAttribute('placeholder') || element.getAttribute('name') || element.id);
    };
    const sectionFor = (element) => {
      const region = element.closest('section, form, fieldset, [role="region"], [data-automation-id]');
      const heading = region?.querySelector?.('h1, h2, h3, legend, [role="heading"]');
      return normalize(heading?.textContent || pageName);
    };
    const optionsFor = (element) => {
      if (element instanceof HTMLSelectElement) {
        return Array.from(element.options).map((option) => ({
          label: normalize(option.label || option.textContent),
          selected: Boolean(option.selected),
          value: String(option.value || ''),
        }));
      }
      const group = element.closest('[role="radiogroup"], [role="group"], fieldset');
      if (group) {
        return Array.from(group.querySelectorAll('input[type="radio"], input[type="checkbox"], [role="radio"], [role="checkbox"]')).map((option) => ({
          label: labelFor(option),
          selected: option instanceof HTMLInputElement ? option.checked : option.getAttribute('aria-checked') === 'true',
          value: option instanceof HTMLInputElement ? String(option.value || '') : normalize(option.textContent),
        }));
      }
      return [];
    };
    const valueFor = (element) => {
      if (element instanceof HTMLInputElement && element.type === 'file') {
        return Array.from(element.files || []).map((file) => ({
          name: file.name,
          size: file.size,
          type: file.type,
          lastModified: file.lastModified,
        }));
      }
      if (element instanceof HTMLInputElement && ['checkbox', 'radio'].includes(element.type)) return element.checked ? (element.value || 'checked') : '';
      if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) return String(element.value || '');
      return normalize(element.getAttribute('aria-valuetext') || element.textContent);
    };
    const redactionFor = (element, label) => {
      const descriptor = normalize(`${label} ${element.getAttribute('aria-label') || ''} ${element.getAttribute('placeholder') || ''} ${element.getAttribute('name') || ''} ${element.id || ''} ${element.getAttribute('autocomplete') || ''} ${element.getAttribute('type') || ''}`);
      const context = normalize(element.closest('form, section, main, body')?.textContent || '');
      if (element instanceof HTMLInputElement && element.type === 'hidden') return { redacted: true, category: 'hidden_credential', gateType: 'hidden_credential' };
      if (secretPattern.test(descriptor)) return { redacted: true, category: 'credential_or_security_code', gateType: 'authentication' };
      if (authContextPattern.test(context) && authIdentifierPattern.test(descriptor)) return { redacted: true, category: 'auth_identifier', gateType: 'authentication' };
      return { redacted: false };
    };
    const validationMessages = (element) => {
      const region = element.closest('[data-automation-id], [role="group"], fieldset, div, section, form') || element.parentElement;
      return Array.from(region?.querySelectorAll?.('[role="alert"], [aria-live], [data-automation-id*="error" i], .error, .css-error') || [])
        .filter(visible)
        .map((item) => normalize(item.textContent))
        .filter(Boolean)
        .slice(0, 5);
    };
    const fields = Array.from(document.querySelectorAll('input, select, textarea, [role="combobox"], [role="checkbox"], [role="radio"]'))
      .filter((element) => visible(element))
      .map((element) => {
        const label = labelFor(element);
        const redaction = redactionFor(element, label);
        const value = redaction.redacted ? null : valueFor(element);
        return {
          capturePhase: 'snapshot',
          committed: true,
          pageName,
          sectionName: sectionFor(element),
          label,
          ariaLabel: normalize(element.getAttribute('aria-label')),
          placeholder: normalize(element.getAttribute('placeholder')),
          name: normalize(element.getAttribute('name')),
          id: normalize(element.id),
          role: normalize(element.getAttribute('role')),
          tagName: element.tagName.toLowerCase(),
          type: element instanceof HTMLInputElement ? String(element.type || '').toLowerCase() : element.tagName.toLowerCase(),
          autocomplete: normalize(element.getAttribute('autocomplete')),
          dataAutomationId: normalize(element.getAttribute('data-automation-id')),
          accept: normalize(element.getAttribute('accept')),
          currentValue: value,
          committedValue: value,
          selectedFiles: element instanceof HTMLInputElement && element.type === 'file' ? value : [],
          options: optionsFor(element),
          prefilled: Boolean(value && !(Array.isArray(value) && value.length === 0)),
          required: element.hasAttribute('required') || element.getAttribute('aria-required') === 'true' || /\*/.test(label),
          validationMessages: validationMessages(element),
          redactedInBrowser: Boolean(redaction.redacted),
          redactionCategory: redaction.category || '',
          redactionGateType: redaction.gateType || '',
        };
      })
      .filter((field) => field.label || field.id || field.name || field.ariaLabel)
      .slice(0, 120);
    const actionControls = Array.from(document.querySelectorAll('button, input[type="button"], input[type="submit"], a[role="button"]'))
      .filter((element) => visible(element))
      .map((element) => ({
        enabled: !element.hasAttribute('disabled') && element.getAttribute('aria-disabled') !== 'true',
        label: normalize(element.textContent || element.getAttribute('value') || element.getAttribute('aria-label')),
        actionKind: normalize(element.getAttribute('data-automation-id') || element.getAttribute('type') || element.tagName.toLowerCase()),
      }))
      .filter((action) => action.label)
      .slice(0, 80);
    const headings = Array.from(document.querySelectorAll('h1, h2, h3, legend, [role="heading"]'))
      .filter(visible)
      .map((element) => normalize(element.textContent))
      .filter(Boolean)
      .slice(0, 40);
    const validationEvents = Array.from(document.querySelectorAll('[role="alert"], [aria-live], [data-automation-id*="error" i], .error, .css-error'))
      .filter(visible)
      .map((element) => ({
        message: normalize(element.textContent),
        pageName,
        sectionName: normalize(element.closest('section, form, fieldset, [role="region"]')?.querySelector?.('h1, h2, h3, legend, [role="heading"]')?.textContent || pageName),
      }))
      .filter((item) => item.message)
      .slice(0, 40);
    const resumeUploadControls = fields
      .filter((field) => field.type === 'file' || /resume|cv/i.test(`${field.label} ${field.sectionName}`))
      .map((field) => ({
        ...field,
        acceptedFileTypes: field.accept,
      }));
    return {
      capturedAt: new Date().toISOString(),
      pageName,
      sectionNames: headings,
      title: document.title,
      url: location.href,
      actionControls,
      fields,
      resumeUploadControls,
      validationEvents,
    };
  }).catch((error) => ({
    ...emptyObservationPage(context),
    errors: [error instanceof Error ? error.message : String(error)],
  }));
  return normalizeObservationPage(snapshot, context);
}

export async function attachToActiveWorkdayObservation(input = {}) {
  const env = input.env || process.env;
  const canaryId = clean(input.canaryId || env.CAREER_OS_WORKDAY_CANARY_ID || env.CAREER_OS_WORKDAY_CANARY_APPLICATION_ID);
  const expectedTenant = clean(input.expectedTenant || env.CAREER_OS_WORKDAY_EXPECTED_TENANT);
  const expectedJobId = clean(input.expectedJobId || env.CAREER_OS_WORKDAY_EXPECTED_JOB_ID);
  const artifactDir = input.artifactDir || defaultObservationArtifactDir(canaryId || 'active-tab-discovery');
  const startedAt = new Date().toISOString();
  const preflight = await validateActiveWorkdayAttachPreflight({
    canaryId,
    env,
    requireExpectedIdentity: Boolean(input.requireExpectedIdentity),
    stopWorkers: input.stopWorkers !== false,
    workerStatus: input.workerStatus,
  });
  if (!preflight.ok) {
    const verification = activeTabVerification({
      attached: false,
      artifactDir,
      canaryId,
      expectedJobId,
      expectedTenant,
      preflight,
      status: preflight.status,
      reason: preflight.reason,
      startedAt,
    });
    if (input.writeVerification !== false) writeActiveTabVerificationArtifact(artifactDir, verification);
    return {
      ok: false,
      status: preflight.status,
      reason: preflight.reason,
      artifactDir,
      verification,
    };
  }

  const attachment = input.browser
    ? { ok: true, browser: input.browser, endpoint: 'injected_test_browser', close: false }
    : await connectToControlledBrowser({ env, endpoints: input.cdpEndpoints });
  if (!attachment.ok) {
    const verification = activeTabVerification({
      attached: false,
      artifactDir,
      canaryId,
      expectedJobId,
      expectedTenant,
      preflight,
      status: 'BROWSER ATTACHMENT FAILED',
      reason: attachment.reason,
      startedAt,
    });
    if (input.writeVerification !== false) writeActiveTabVerificationArtifact(artifactDir, verification);
    return {
      ok: false,
      status: 'BROWSER ATTACHMENT FAILED',
      reason: attachment.reason,
      artifactDir,
      verification,
    };
  }

  try {
    const discovery = await discoverActiveWorkdayApplicationTab({
      browser: attachment.browser,
      canaryId,
      expectedJobId,
      expectedTenant,
    });
    const selected = discovery.selectedTab;
    const verification = activeTabVerification({
      attached: true,
      attachmentEndpoint: attachment.endpoint,
      artifactDir,
      canaryId,
      discovery,
      expectedJobId,
      expectedTenant,
      preflight,
      selectedTab: selected,
      startedAt,
      status: discovery.status,
      reason: discovery.reason,
    });
    if (input.writeVerification !== false) writeActiveTabVerificationArtifact(artifactDir, verification);
    if (!discovery.ok) {
      return {
        ok: false,
        status: discovery.status,
        reason: discovery.reason,
        artifactDir,
        matchingTabs: discovery.matchingTabs,
        rejectedTabs: discovery.rejectedTabs,
        verification,
      };
    }

    const configuredUrlValidation = validateWorkdayObservationBounds({
      approvedOrigins: [originForUrl(selected.url)],
      canaryId,
      env,
      expectedJobId: expectedJobId || selected.jobId,
      expectedTenant: expectedTenant || selected.tenant,
      requireConfiguredUrl: false,
      url: selected.url,
    });
    if (!configuredUrlValidation.ok) {
      const failed = {
        ...verification,
        status: 'APPLICATION NOT ACTIVE',
        reason: configuredUrlValidation.reason,
      };
      if (input.writeVerification !== false) writeActiveTabVerificationArtifact(artifactDir, failed);
      return {
        ok: false,
        status: 'APPLICATION NOT ACTIVE',
        reason: configuredUrlValidation.reason,
        artifactDir,
        verification: failed,
      };
    }

    if (!input.confirmed) {
      return {
        ok: true,
        status: 'ACTIVE WORKDAY APPLICATION READY',
        reason: 'Exactly one active Workday application tab is ready for operator confirmation.',
        artifactDir,
        selectedTab: selected,
        verification,
        observationStarted: false,
        nextAction: 'Confirm this exact active Workday application before observation starts.',
      };
    }

    const observed = await observeAttachedWorkdayPage({
      artifactDir,
      canaryId,
      company: input.company,
      env,
      expectedJobId: expectedJobId || selected.jobId,
      expectedTenant: expectedTenant || selected.tenant,
      page: selected.page,
      resume: input.resume,
      role: input.role,
      selectedTab: selected,
      verification,
    });
    return observed;
  } finally {
    if (attachment.close && attachment.browser && typeof attachment.browser.close === 'function') {
      await attachment.browser.close().catch(() => {});
    }
  }
}

export async function validateActiveWorkdayAttachPreflight(input = {}) {
  const env = input.env || process.env;
  const canaryId = clean(input.canaryId || env.CAREER_OS_WORKDAY_CANARY_ID || env.CAREER_OS_WORKDAY_CANARY_APPLICATION_ID);
  if (!workdayObserveModeEnabled(env)) {
    return {
      ok: false,
      reason: 'CAREER_OS_WORKDAY_OBSERVE_MODE=1 is required before active tab attachment.',
      status: 'BROWSER ATTACHMENT FAILED',
    };
  }
  if (clean(env.CAREER_OS_QUEUE_ENABLED) === '1') {
    return {
      ok: false,
      reason: 'CAREER_OS_QUEUE_ENABLED must remain disabled during active tab observation.',
      status: 'APPLICATION NOT ACTIVE',
    };
  }
  if (!canaryId) {
    return {
      ok: false,
      reason: 'A single Workday canary id is required before active tab observation.',
      status: 'APPLICATION NOT ACTIVE',
    };
  }
  if (input.requireExpectedIdentity && (!clean(input.expectedTenant) || !clean(input.expectedJobId))) {
    return {
      ok: false,
      reason: 'Expected tenant and job id are required for this active tab attachment.',
      status: 'APPLICATION NOT ACTIVE',
    };
  }
  const stopped = input.stopWorkers === false
    ? { ok: true, stoppedPids: [], runningPids: [] }
    : await stopCareerOsWorkerProcesses({ dryRun: input.dryRunWorkers });
  if (!stopped.ok) {
    return {
      ok: false,
      reason: stopped.reason,
      status: 'APPLICATION NOT ACTIVE',
      workerProcesses: stopped,
    };
  }
  const workerStatus = input.workerStatus || await readWorkerHealthFromEnv(env);
  if (Number(workerStatus?.running || 0) > 0) {
    return {
      ok: false,
      reason: 'Career OS worker health reports another worker is running.',
      status: 'APPLICATION NOT ACTIVE',
      workerStatus: sanitizeWorkerStatus(workerStatus),
    };
  }
  return {
    ok: true,
    reason: 'Active tab attachment preflight passed.',
    status: 'ACTIVE WORKDAY APPLICATION READY',
    workerProcesses: stopped,
    workerStatus: sanitizeWorkerStatus(workerStatus),
  };
}

export async function connectToControlledBrowser(input = {}) {
  const { chromium } = await import('playwright');
  const endpoints = controlledBrowserCdpEndpoints(input.env || process.env, input.endpoints);
  if (!endpoints.length) {
    return {
      ok: false,
      reason: 'No controlled browser CDP endpoint is configured or reachable.',
      attemptedEndpoints: [],
    };
  }
  const attempted = [];
  for (const endpoint of endpoints) {
    try {
      attempted.push(endpoint);
      const browser = await chromium.connectOverCDP(endpoint, { timeout: 4000 });
      return {
        ok: true,
        browser,
        close: true,
        endpoint,
      };
    } catch (error) {
      attempted[attempted.length - 1] = `${endpoint} (${error instanceof Error ? error.message.split('\n')[0] : String(error)})`;
    }
  }
  return {
    ok: false,
    reason: 'Unable to attach to a running controlled browser over CDP.',
    attemptedEndpoints: attempted,
  };
}

export async function discoverActiveWorkdayApplicationTab(input = {}) {
  const browser = input.browser;
  if (!browser || typeof browser.contexts !== 'function') {
    return {
      ok: false,
      status: 'BROWSER ATTACHMENT FAILED',
      reason: 'Browser attachment is not active.',
      matchingTabs: [],
      rejectedTabs: [],
    };
  }
  const expectedTenant = clean(input.expectedTenant).toLowerCase();
  const expectedJobId = clean(input.expectedJobId).toLowerCase();
  const matchingTabs = [];
  const rejectedTabs = [];

  for (const context of browser.contexts()) {
    for (const page of context.pages()) {
      const minimal = await minimalPageMetadata(page);
      const initial = classifyWorkdayTabUrl(minimal, { expectedJobId, expectedTenant });
      if (!initial.candidate) {
        rejectedTabs.push({ ...minimal, reason: initial.reason });
        continue;
      }
      const dom = await inspectActiveWorkdayApplicationStructure(page, {
        expectedJobId,
        expectedTenant,
      });
      const verified = verifyActiveWorkdayTab({
        dom,
        expectedJobId,
        expectedTenant,
        minimal,
        parsed: initial.parsed,
      });
      if (verified.ok) {
        matchingTabs.push({
          ...minimal,
          ...verified.tab,
          page,
        });
      } else {
        rejectedTabs.push({
          ...minimal,
          reason: verified.reason,
          status: verified.status,
        });
      }
    }
  }

  if (matchingTabs.length > 1) {
    return {
      ok: false,
      status: 'MULTIPLE MATCHING TABS',
      reason: 'Multiple active Workday application tabs match the requested identity.',
      matchingTabs: matchingTabs.map(reportableTab),
      rejectedTabs,
    };
  }
  if (matchingTabs.length === 1) {
    const selectedTab = matchingTabs[0];
    return {
      ok: true,
      status: 'ACTIVE WORKDAY APPLICATION READY',
      reason: 'One active Workday application tab matched.',
      matchingTabs: [reportableTab(selectedTab)],
      rejectedTabs,
      selectedTab,
    };
  }

  const wrongTenant = rejectedTabs.find((tab) => tab.status === 'WRONG TENANT');
  if (wrongTenant) {
    return {
      ok: false,
      status: 'WRONG TENANT',
      reason: wrongTenant.reason,
      matchingTabs: [],
      rejectedTabs,
    };
  }
  const wrongJob = rejectedTabs.find((tab) => tab.status === 'WRONG JOB');
  if (wrongJob) {
    return {
      ok: false,
      status: 'WRONG JOB',
      reason: wrongJob.reason,
      matchingTabs: [],
      rejectedTabs,
    };
  }
  const signIn = rejectedTabs.find((tab) => tab.status === 'SIGN-IN REQUIRED');
  if (signIn) {
    return {
      ok: false,
      status: 'SIGN-IN REQUIRED',
      reason: signIn.reason,
      matchingTabs: [],
      rejectedTabs,
    };
  }
  const inactive = rejectedTabs.find((tab) => tab.status === 'APPLICATION NOT ACTIVE');
  if (inactive) {
    return {
      ok: false,
      status: 'APPLICATION NOT ACTIVE',
      reason: inactive.reason,
      matchingTabs: [],
      rejectedTabs,
    };
  }
  return {
    ok: false,
    status: 'NO ACTIVE WORKDAY APPLICATION FOUND',
    reason: 'No active Workday application tab was found in the attached controlled browser.',
    matchingTabs: [],
    rejectedTabs,
  };
}

export function verifyActiveWorkdayTab(input = {}) {
  const minimal = input.minimal || {};
  const parsed = input.parsed || parseWorkdayJobUrl(minimal.url || '');
  const dom = input.dom || {};
  const expectedTenant = clean(input.expectedTenant).toLowerCase();
  const expectedJobId = clean(input.expectedJobId).toLowerCase();
  if (!parsed.ok) {
    return {
      ok: false,
      status: 'APPLICATION NOT ACTIVE',
      reason: `Workday tab identity is ambiguous: ${parsed.reason || 'unknown'}.`,
    };
  }
  if (expectedTenant && clean(parsed.tenant).toLowerCase() !== expectedTenant) {
    return {
      ok: false,
      status: 'WRONG TENANT',
      reason: `Workday tab tenant ${parsed.tenant} does not match expected ${input.expectedTenant}.`,
    };
  }
  const detectedJobId = clean(dom.detectedJobId || parsed.jobId);
  if (expectedJobId && clean(detectedJobId).toLowerCase() !== expectedJobId) {
    return {
      ok: false,
      status: 'WRONG JOB',
      reason: `Workday tab job ${detectedJobId || '(not detected)'} does not match expected ${input.expectedJobId}.`,
    };
  }
  if (dom.authGateDetected) {
    return {
      ok: false,
      status: 'SIGN-IN REQUIRED',
      reason: `Workday tab is at a ${dom.authGateType || 'sign-in'} gate.`,
    };
  }
  if (dom.inactiveDetected) {
    return {
      ok: false,
      status: 'APPLICATION NOT ACTIVE',
      reason: 'Workday page indicates the job or application is inactive.',
    };
  }
  if (!dom.applicationStructureDetected) {
    return {
      ok: false,
      status: 'APPLICATION NOT ACTIVE',
      reason: 'Workday tab does not expose recognizable application structure.',
    };
  }
  return {
    ok: true,
    status: 'ACTIVE WORKDAY APPLICATION READY',
    reason: 'Workday tab is authenticated and active.',
    tab: {
      applicationActive: true,
      applicationStructureDetected: true,
      authenticated: true,
      jobId: detectedJobId || parsed.jobId,
      pageName: clean(dom.pageName),
      reviewReached: Boolean(dom.reviewSignals?.reviewReached),
      tenant: clean(parsed.tenant),
      workdayIdentity: publicIdentity({ ...parsed, jobId: detectedJobId || parsed.jobId }),
    },
  };
}

export function detectWorkdayFinalReview(input = {}) {
  const pages = input.pages || [];
  const lastPage = pages[pages.length - 1] || {};
  const actionControls = Array.isArray(lastPage.actionControls) ? lastPage.actionControls : [];
  const sectionText = [
    lastPage.pageName,
    ...(Array.isArray(lastPage.sectionNames) ? lastPage.sectionNames : []),
    ...(input.fields || []).map((field) => `${field.pageName} ${field.sectionName} ${field.questionText}`),
  ].map(clean).join(' ');
  const submitControls = actionControls.filter((action) => /submit/i.test(clean(action.label)) && action.enabled !== false);
  const nextControls = actionControls.filter((action) => /next|save and continue|continue/i.test(clean(action.label)) && !/submit/i.test(clean(action.label)));
  const reviewReached = (WORKDAY_REVIEW_PATTERN.test(sectionText) || /review/i.test(clean(lastPage.pageName)))
    && submitControls.length > 0
    && nextControls.length === 0;
  const unresolvedFields = (input.fields || [])
    .filter((field) => field.required && !field.redaction && (field.selectedAnswer === null || field.selectedAnswer === undefined || field.selectedAnswer === ''))
    .map((field) => ({
      pageName: field.pageName,
      questionText: field.questionText,
      reason: 'required_field_without_committed_value',
    }));
  const legalAcknowledgments = (input.fields || [])
    .filter((field) => field.reuseClasses?.includes('legal_acknowledgment'))
    .map((field) => ({
      pageName: field.pageName,
      questionText: field.questionText,
      selected: Boolean(field.selectedAnswer),
    }));
  const task = input.task || {};
  const identity = input.workdayIdentity || {};
  const reviewFingerprint = reviewReached
    ? buildWorkdayReviewFingerprint(task, identity, {
      actions: submitControls,
      fields: input.fields || [],
    })
    : '';
  return {
    reviewReached,
    reviewFingerprint,
    visibleSections: uniqueValues(lastPage.sectionNames || []),
    unresolvedFields,
    legalAcknowledgments,
    resumeIdentity: summarizeResumeIdentity(input.fields || []),
    submitButtonSemanticFingerprint: submitControls[0] ? stableObservationId({
      label: submitControls[0].label,
      pageName: lastPage.pageName,
      sectionName: 'submit_control',
    }) : '',
    applicationAppearsComplete: Boolean(reviewReached && !unresolvedFields.length),
    submitControlDetected: submitControls.length > 0,
  };
}

export async function observeAttachedWorkdayPage(input = {}) {
  const page = input.page;
  if (!page || typeof page.evaluate !== 'function') {
    return {
      ok: false,
      status: 'BROWSER ATTACHMENT FAILED',
      reason: 'Selected active Workday page is no longer available.',
    };
  }
  const env = input.env || process.env;
  const canaryId = clean(input.canaryId || env.CAREER_OS_WORKDAY_CANARY_ID || env.CAREER_OS_WORKDAY_CANARY_APPLICATION_ID);
  const identity = {
    canonicalUrl: clean(input.selectedTab?.url || page.url?.()),
    host: clean(input.selectedTab?.host),
    jobId: clean(input.expectedJobId || input.selectedTab?.jobId),
    tenant: clean(input.expectedTenant || input.selectedTab?.tenant),
    vendor: 'workday',
  };
  const artifactDir = input.artifactDir || defaultObservationArtifactDir(canaryId);
  const session = {
    activeTabVerification: input.verification,
    attachmentSucceeded: true,
    browserProfileDir: clean(env.CAREER_OS_WORKDAY_OBSERVE_PROFILE_DIR || path.join(process.cwd(), '.career-os-browser-worker', 'chrome-profile')),
    canaryId,
    company: clean(input.company),
    observeModeEnabled: true,
    queueEnabled: false,
    role: clean(input.role),
    startedAt: new Date().toISOString(),
    startingPage: clean(input.selectedTab?.pageName),
    status: 'observation_running',
    submissionMethod: 'none',
    submissionPerformed: false,
    url: identity.canonicalUrl,
    workdayIdentity: identity,
  };
  const pages = [];
  let lastUrl = '';
  let stopped = false;
  let reviewReached = false;
  const stop = async () => {
    stopped = true;
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  await installWorkdayObservationRecorder(page);
  const pollMs = Math.max(1000, Number(input.pollMs || 2500));

  while (!stopped && !page.isClosed()) {
    const currentUrl = typeof page.url === 'function' ? page.url() : identity.canonicalUrl;
    if (!isObservedRuntimeUrlAllowed(currentUrl, [originForUrl(identity.canonicalUrl)])) {
      pages.push({
        ...emptyObservationPage({ url: currentUrl }),
        pageName: 'Navigation Blocked',
        transitions: [{
          actionKind: 'navigation_blocked',
          actionLabel: 'Navigation left approved Workday origin',
          canaryId,
          eventType: 'navigation_blocked',
          fromUrl: currentUrl,
          jobId: identity.jobId,
          manualAction: true,
          tenant: identity.tenant,
          timestamp: new Date().toISOString(),
        }],
      });
      stopped = true;
      break;
    }
    if (currentUrl !== lastUrl) {
      await installWorkdayObservationRecorder(page);
      lastUrl = currentUrl;
    }
    const snapshot = await scanWorkdayObservationDom(page, {
      canaryId,
      jobId: identity.jobId,
      source: 'career_os_workday_active_tab_observation',
      tenant: identity.tenant,
      timestamp: new Date().toISOString(),
    });
    const events = await readWorkdayObservationEvents(page);
    const eventFields = events
      .filter((event) => event.eventType !== 'action_click' && event.eventType !== 'page_transition')
      .map((event) => normalizeObservedWorkdayField(event, {
        canaryId,
        jobId: identity.jobId,
        source: 'career_os_workday_active_tab_observation',
        tenant: identity.tenant,
      }))
      .filter(Boolean);
    const transitions = events
      .filter((event) => event.eventType === 'action_click' || event.eventType === 'page_transition')
      .map((event) => normalizeTransitionEvent(event, { canaryId, jobId: identity.jobId, tenant: identity.tenant }));
    const observedPage = {
      ...snapshot,
      fields: mergeFields(snapshot.fields.concat(eventFields)),
      transitions: transitions.concat(snapshot.transitions || []),
    };
    pages.push(observedPage);
    const finalReview = detectWorkdayFinalReview({
      fields: pages.flatMap((item) => item.fields || []),
      pages,
      task: {
        applicationId: canaryId,
        employer: input.company,
        position: input.role,
      },
      workdayIdentity: identity,
    });
    reviewReached = finalReview.reviewReached;
    session.endingPage = observedPage.pageName;
    session.reviewReached = reviewReached;
    session.status = reviewReached ? 'observation_review_reached' : 'observation_running';
    const artifactSet = buildWorkdayObservationArtifacts(session, pages, {
      resume: input.resume,
    });
    writeWorkdayObservationArtifacts(artifactDir, artifactSet);
    if (reviewReached) break;
    await page.waitForTimeout(pollMs).catch(() => {});
  }

  session.completedAt = new Date().toISOString();
  session.status = reviewReached ? 'observation_complete_review_required' : 'observation_stopped_before_review';
  session.submissionPerformed = false;
  const artifactSet = buildWorkdayObservationArtifacts(session, pages, {
    resume: input.resume,
  });
  writeWorkdayObservationArtifacts(artifactDir, artifactSet);
  return {
    ok: true,
    artifactDir,
    artifacts: WORKDAY_OBSERVATION_ARTIFACT_FILES.map((file) => path.join(artifactDir, file)),
    fieldCount: pages.flatMap((item) => item.fields || []).length,
    pageCount: pages.length,
    reviewReached,
    status: reviewReached ? 'OBSERVATION COMPLETE — REVIEW REQUIRED' : 'OBSERVATION ACTIVE — COMPLETE APPLICATION',
    transitionCount: pages.flatMap((item) => item.transitions || []).length,
  };
}

export async function startWorkdayObservationSession(input = {}) {
  const env = input.env || process.env;
  const validation = validateWorkdayObservationBounds({
    canaryId: input.canaryId,
    env,
    url: input.url,
  });
  if (!validation.ok) {
    throw new Error(validation.reason);
  }
  const { chromium } = await import('playwright');
  const identity = validation.details.workdayIdentity;
  const canaryId = clean(input.canaryId || validation.details.canaryId);
  const artifactDir = input.artifactDir || defaultObservationArtifactDir(canaryId);
  const browserProfileDir = clean(input.browserProfileDir || env.CAREER_OS_WORKDAY_OBSERVE_PROFILE_DIR || path.join(process.cwd(), '.career-os-browser-worker', 'chrome-profile'));
  fs.mkdirSync(browserProfileDir, { recursive: true });
  const context = await chromium.launchPersistentContext(browserProfileDir, {
    headless: input.headless === true,
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();
  const session = {
    canaryId,
    company: clean(input.company),
    role: clean(input.role),
    url: identity.canonicalUrl,
    workdayIdentity: identity,
    observeModeEnabled: true,
    queueEnabled: false,
    browserProfileDir,
    startedAt: new Date().toISOString(),
    status: 'observation_running',
  };
  const pages = [];
  let lastUrl = '';
  let stopped = false;
  const stop = async () => {
    stopped = true;
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);

  await page.goto(identity.canonicalUrl, { waitUntil: 'domcontentloaded', timeout: Number(input.navigationTimeoutMs || 120000) });
  await installWorkdayObservationRecorder(page);
  const started = Date.now();
  const durationMs = Number(input.durationMs || 30 * 60 * 1000);
  const pollMs = Math.max(1000, Number(input.pollMs || 2500));

  while (!stopped && Date.now() - started < durationMs && !page.isClosed()) {
    const currentUrl = page.url();
    if (!isObservedRuntimeUrlAllowed(currentUrl, validation.details.approvedOrigins)) {
      pages.push({
        ...emptyObservationPage({ url: currentUrl }),
        pageName: 'Navigation Blocked',
        transitions: [{
          actionKind: 'navigation_blocked',
          actionLabel: 'Navigation left approved Workday origin',
          canaryId,
          eventType: 'navigation_blocked',
          fromUrl: currentUrl,
          jobId: identity.jobId,
          manualAction: true,
          tenant: identity.tenant,
          timestamp: new Date().toISOString(),
        }],
      });
      stopped = true;
      break;
    }
    if (currentUrl !== lastUrl) {
      await installWorkdayObservationRecorder(page);
      lastUrl = currentUrl;
    }
    const snapshot = await scanWorkdayObservationDom(page, {
      canaryId,
      jobId: identity.jobId,
      source: 'career_os_workday_observation_mode',
      tenant: identity.tenant,
      timestamp: new Date().toISOString(),
    });
    const events = await readWorkdayObservationEvents(page);
    const eventFields = events
      .filter((event) => event.eventType !== 'action_click' && event.eventType !== 'page_transition')
      .map((event) => normalizeObservedWorkdayField(event, {
        canaryId,
        jobId: identity.jobId,
        source: 'career_os_workday_observation_mode',
        tenant: identity.tenant,
      }))
      .filter(Boolean);
    const transitions = events
      .filter((event) => event.eventType === 'action_click' || event.eventType === 'page_transition')
      .map((event) => normalizeTransitionEvent(event, { canaryId, jobId: identity.jobId, tenant: identity.tenant }));
    pages.push({
      ...snapshot,
      fields: mergeFields(snapshot.fields.concat(eventFields)),
      transitions: transitions.concat(snapshot.transitions || []),
    });
    const artifactSet = buildWorkdayObservationArtifacts(session, pages, {
      resume: input.resume,
    });
    writeWorkdayObservationArtifacts(artifactDir, artifactSet);
    await page.waitForTimeout(pollMs).catch(() => {});
  }

  session.completedAt = new Date().toISOString();
  session.status = stopped ? 'observation_stopped_by_operator' : 'observation_duration_elapsed';
  const artifactSet = buildWorkdayObservationArtifacts(session, pages, {
    resume: input.resume,
  });
  writeWorkdayObservationArtifacts(artifactDir, artifactSet);
  await context.close().catch(() => {});
  return {
    ok: true,
    artifactDir,
    artifacts: WORKDAY_OBSERVATION_ARTIFACT_FILES.map((file) => path.join(artifactDir, file)),
    pageCount: pages.length,
    status: session.status,
  };
}

export function normalizeObservationPage(page = {}, context = {}) {
  const pageName = clean(page.pageName || inferWorkdayPageName(`${page.title || ''} ${context.pageText || ''}`));
  const normalizedFields = normalizeObservedWorkdayFields(page.fields || [], {
    canaryId: context.canaryId,
    jobId: context.jobId,
    pageName,
    source: context.source,
    tenant: context.tenant,
    timestamp: context.timestamp,
  });
  return {
    capturedAt: clean(page.capturedAt) || new Date().toISOString(),
    pageName,
    sectionNames: uniqueValues(page.sectionNames || []),
    title: clean(page.title),
    url: clean(page.url),
    actionControls: normalizeActionControls(page.actionControls),
    fields: normalizedFields,
    resumeUploadControls: normalizeResumeUploadControls(page.resumeUploadControls || [], {
      canaryId: context.canaryId,
      jobId: context.jobId,
      pageName,
      source: context.source,
      tenant: context.tenant,
      timestamp: context.timestamp,
    }),
    validationEvents: normalizeValidationEvents(page.validationEvents || [], {
      canaryId: context.canaryId,
      jobId: context.jobId,
      pageName,
      tenant: context.tenant,
    }),
    transitions: [],
  };
}

export function defaultObservationArtifactDir(canaryId, root = process.cwd()) {
  return path.join(root, '.runtime', 'workday-observations', clean(canaryId) || 'unassigned-canary');
}

export function scanArtifactFilesForSecrets(baseDir, forbiddenSamples = []) {
  const findings = [];
  for (const fileName of WORKDAY_OBSERVATION_ARTIFACT_FILES) {
    const filePath = path.join(baseDir, fileName);
    if (!fs.existsSync(filePath)) continue;
    const text = fs.readFileSync(filePath, 'utf8');
    for (const sample of forbiddenSamples.map(clean).filter(Boolean)) {
      if (text.includes(sample)) findings.push({ fileName, sample });
    }
  }
  return {
    ok: findings.length === 0,
    findings,
  };
}

async function minimalPageMetadata(page) {
  const url = typeof page.url === 'function' ? clean(page.url()) : '';
  let title = '';
  try {
    title = typeof page.title === 'function' ? clean(await page.title()) : '';
  } catch {
    title = '';
  }
  return {
    host: hostForUrl(url),
    sanitizedUrl: sanitizeWorkdayObservationUrl(url),
    title,
    url,
  };
}

function classifyWorkdayTabUrl(minimal = {}, options = {}) {
  const url = clean(minimal.url);
  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch {
    return { candidate: false, reason: 'invalid_url' };
  }
  if (parsedUrl.protocol !== 'https:') return { candidate: false, reason: 'non_https' };
  if (!isApprovedWorkdayHost(parsedUrl.hostname)) return { candidate: false, reason: 'non_workday_origin' };
  const parsed = parseWorkdayJobUrl(url);
  if (!parsed.ok) return { candidate: false, reason: `ambiguous_workday_identity:${parsed.reason}` };
  const expectedTenant = clean(options.expectedTenant).toLowerCase();
  if (expectedTenant && clean(parsed.tenant).toLowerCase() !== expectedTenant) {
    return { candidate: true, parsed, reason: 'wrong_tenant' };
  }
  if (!WORKDAY_APPLICATION_URL_PATTERN.test(parsedUrl.pathname)) return { candidate: false, reason: 'not_application_url' };
  return { candidate: true, parsed, reason: '' };
}

async function inspectActiveWorkdayApplicationStructure(page, options = {}) {
  if (!page || typeof page.evaluate !== 'function') {
    return {
      applicationStructureDetected: false,
      authGateDetected: false,
      inactiveDetected: false,
      reviewSignals: { reviewReached: false },
    };
  }
  const expectedJobId = clean(options.expectedJobId);
  return page.evaluate((expected) => {
    const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim();
    const visible = (element) => {
      if (!(element instanceof HTMLElement)) return false;
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
    };
    const body = normalize(document.body?.innerText || '');
    const headings = Array.from(document.querySelectorAll('h1, h2, h3, legend, [role="heading"]'))
      .filter(visible)
      .map((item) => normalize(item.textContent))
      .filter(Boolean)
      .slice(0, 40);
    const actions = Array.from(document.querySelectorAll('button, input[type="button"], input[type="submit"], a[role="button"]'))
      .filter(visible)
      .map((item) => ({
        enabled: !item.hasAttribute('disabled') && item.getAttribute('aria-disabled') !== 'true',
        label: normalize(item.textContent || item.getAttribute('value') || item.getAttribute('aria-label')),
      }))
      .filter((item) => item.label)
      .slice(0, 40);
    const fields = Array.from(document.querySelectorAll('input, select, textarea, [role="combobox"], [role="checkbox"], [role="radio"]'))
      .filter(visible)
      .length;
    const applicationPattern = /my information|my experience|application questions|voluntary disclosures|self identify|self identification|review|submit|upload resume|work experience|education|job application/i;
    const authPattern = /sign in|log in|login|create account|forgot password|password reset|verification code|security code|one.time code|multi.factor|mfa|captcha|verify you are human|security challenge/i;
    const inactivePattern = /no longer accepting applications|job is no longer available|job posting is no longer available|position has been filled|posting has expired|this job is closed|application is no longer active/i;
    const submitVisible = actions.some((action) => /submit/i.test(action.label) && action.enabled !== false);
    const nextVisible = actions.some((action) => /next|save and continue|continue/i.test(action.label) && !/submit/i.test(action.label));
    const detectedJobId = expected && body.toLowerCase().includes(String(expected).toLowerCase())
      ? expected
      : (body.match(/\b(?:REQ|JR|R|WD|J)\d[A-Z0-9-]*\b/i)?.[0] || '');
    return {
      applicationStructureDetected: applicationPattern.test(body) || fields > 2,
      authGateDetected: authPattern.test(body) && !applicationPattern.test(body),
      authGateType: body.match(/verification code|security code|captcha|password reset|create account|sign in|log in|login/i)?.[0] || '',
      detectedJobId,
      fieldCount: fields,
      headings,
      inactiveDetected: inactivePattern.test(body),
      pageName: headings.find((heading) => /my information|my experience|application questions|voluntary disclosures|self identify|review|submit/i.test(heading))
        || (body.match(/My Information|My Experience|Application Questions|Voluntary Disclosures|Self Identify|Review|Submit/i)?.[0] || ''),
      reviewSignals: {
        reviewReached: /review/i.test(body) && submitVisible && !nextVisible,
        submitVisible,
        nextVisible,
      },
    };
  }, expectedJobId).catch(() => ({
    applicationStructureDetected: false,
    authGateDetected: false,
    inactiveDetected: false,
    reviewSignals: { reviewReached: false },
  }));
}

function activeTabVerification(input = {}) {
  const selected = input.selectedTab ? reportableTab(input.selectedTab) : null;
  const matchingTabs = (input.discovery?.matchingTabs || []).map(reportableTab);
  return {
    generatedAt: new Date().toISOString(),
    artifactDir: clean(input.artifactDir),
    canaryId: clean(input.canaryId),
    status: clean(input.status),
    reason: clean(input.reason),
    attachment: {
      active: Boolean(input.attached),
      endpoint: clean(input.attachmentEndpoint),
      succeeded: Boolean(input.attached),
    },
    expected: {
      tenant: clean(input.expectedTenant),
      jobId: clean(input.expectedJobId),
    },
    selectedTab: selected,
    matchingTabs,
    rejectedTabs: (input.discovery?.rejectedTabs || []).map((tab) => ({
      reason: clean(tab.reason),
      sanitizedUrl: clean(tab.sanitizedUrl),
      status: clean(tab.status),
      title: clean(tab.title),
    })),
    preflight: {
      ok: Boolean(input.preflight?.ok),
      observeModeEnabled: true,
      queueDisabled: true,
      noWorkerRunning: Number(input.preflight?.workerStatus?.running || 0) === 0,
      workerStatus: sanitizeWorkerStatus(input.preflight?.workerStatus),
    },
    startedAt: clean(input.startedAt),
  };
}

function writeActiveTabVerificationArtifact(artifactDir, verification) {
  fs.mkdirSync(artifactDir, { recursive: true });
  fs.writeFileSync(path.join(artifactDir, 'active-tab-verification.json'), `${JSON.stringify(verification, null, 2)}\n`, 'utf8');
}

function reportableTab(tab = {}) {
  return {
    applicationActive: Boolean(tab.applicationActive),
    authenticated: Boolean(tab.authenticated),
    host: clean(tab.host || hostForUrl(tab.url)),
    jobId: clean(tab.jobId),
    pageName: clean(tab.pageName),
    reviewReached: Boolean(tab.reviewReached),
    sanitizedUrl: clean(tab.sanitizedUrl || sanitizeWorkdayObservationUrl(tab.url)),
    tenant: clean(tab.tenant),
    title: clean(tab.title),
  };
}

function controlledBrowserCdpEndpoints(env = process.env, configured = []) {
  const endpoints = new Set();
  const rawConfigured = Array.isArray(configured) ? configured : clean(configured).split(',').map(clean).filter(Boolean);
  for (const endpoint of rawConfigured) endpoints.add(endpoint);
  for (const key of ['CAREER_OS_BROWSER_CDP_URL', 'CAREER_OS_CHROME_CDP_URL', 'CAREER_OS_WORKDAY_OBSERVE_CDP_URL']) {
    if (clean(env[key])) endpoints.add(clean(env[key]));
  }
  for (const key of ['CAREER_OS_BROWSER_DEBUG_PORT', 'CAREER_OS_CHROME_DEBUG_PORT', 'CAREER_OS_WORKDAY_OBSERVE_DEBUG_PORT']) {
    const port = Number(env[key]);
    if (Number.isInteger(port) && port > 0) endpoints.add(`http://127.0.0.1:${port}`);
  }
  for (const port of [9222, 9223, 9333]) endpoints.add(`http://127.0.0.1:${port}`);
  return Array.from(endpoints).map(stripTrailingSlash);
}

async function stopCareerOsWorkerProcesses(options = {}) {
  const processes = await findCareerOsWorkerProcesses();
  if (!processes.length) return { ok: true, stoppedPids: [], runningPids: [] };
  if (options.dryRun) {
    return {
      ok: false,
      reason: `Career OS worker process(es) are still running: ${processes.map((item) => item.pid).join(', ')}`,
      runningPids: processes.map((item) => item.pid),
      stoppedPids: [],
    };
  }
  const stoppedPids = [];
  for (const item of processes) {
    try {
      process.kill(item.pid, 'SIGTERM');
      stoppedPids.push(item.pid);
    } catch {
      // The process may already have exited.
    }
  }
  await new Promise((resolve) => setTimeout(resolve, 500));
  const remaining = await findCareerOsWorkerProcesses();
  if (remaining.length) {
    return {
      ok: false,
      reason: `Career OS worker process(es) remain running: ${remaining.map((item) => item.pid).join(', ')}`,
      runningPids: remaining.map((item) => item.pid),
      stoppedPids,
    };
  }
  return { ok: true, stoppedPids, runningPids: [] };
}

async function findCareerOsWorkerProcesses() {
  try {
    const { stdout } = await execFileAsync('ps', ['-axo', 'pid=,command='], { timeout: 3000 });
    return stdout.split(/\r?\n/)
      .map((line) => {
        const match = line.trim().match(/^(\d+)\s+(.+)$/);
        if (!match) return null;
        const pid = Number(match[1]);
        const command = match[2];
        if (!Number.isInteger(pid) || pid === process.pid) return null;
        if (!/career-os-browser-companion\.mjs/.test(command)) return null;
        if (!/\s(start|run-once)\b/.test(command)) return null;
        return { pid, command };
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

async function readWorkerHealthFromEnv(env = process.env) {
  const token = clean(env.CAREER_OS_BROWSER_WORKER_TOKEN);
  const baseUrl = clean(env.APP_BASE_URL || env.NEXT_PUBLIC_BASE_URL);
  if (!token || !baseUrl) return null;
  try {
    const response = await fetch(new URL('/api/career-os/worker/health', baseUrl), {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(4000),
    });
    if (!response.ok) return null;
    return response.json();
  } catch {
    return null;
  }
}

function sanitizeWorkerStatus(status = {}) {
  if (!status || typeof status !== 'object') return null;
  return {
    configured: Boolean(status.configured),
    eligible: Number(status.eligible || 0),
    ok: status.ok !== false,
    running: Number(status.running || 0),
  };
}

function summarizeResumeIdentity(fields = []) {
  const resumeFields = fields.filter((field) => /resume|cv/i.test(`${field.questionText} ${field.sectionName} ${field.pageName}`));
  const fileField = resumeFields.find((field) => Array.isArray(field.selectedFiles) && field.selectedFiles.length);
  return {
    detected: resumeFields.length > 0,
    filename: clean(fileField?.selectedFiles?.[0]?.name),
    unresolvedArtifact: resumeFields.length > 0 && !fileField,
  };
}

function sanitizeWorkdayObservationUrl(value) {
  const url = clean(value);
  if (!url) return '';
  try {
    const parsed = new URL(url);
    const kept = new URL(`${parsed.origin}${parsed.pathname}`);
    for (const key of ['jobSeqNo', 'jobId', 'jobID', 'job', 'jid', 'step']) {
      if (parsed.searchParams.has(key)) kept.searchParams.set(key, parsed.searchParams.get(key));
    }
    return kept.toString();
  } catch {
    return '';
  }
}

function hostForUrl(value) {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return '';
  }
}

function normalizeResumeUploadControls(controls, context) {
  return controls
    .map((control) => normalizeObservedWorkdayField({
      ...control,
      capturePhase: 'snapshot',
      committed: true,
      type: control.type || 'file',
    }, context))
    .filter(Boolean);
}

function normalizeTransitionEvent(event = {}, context = {}) {
  const label = clean(event.label || event.actionLabel || event.eventType);
  return {
    canaryId: clean(context.canaryId),
    tenant: clean(context.tenant),
    jobId: clean(context.jobId),
    eventType: clean(event.eventType),
    actionLabel: label,
    actionKind: classifyActionKind(label, event.actionKind),
    pageName: clean(event.pageName),
    fromUrl: clean(event.url),
    timestamp: clean(event.timestamp) || new Date().toISOString(),
    manualAction: true,
  };
}

function normalizeActionControls(actions = []) {
  return actions.map((action) => ({
    label: clean(action.label),
    actionKind: classifyActionKind(action.label, action.actionKind || action.type),
    enabled: action.enabled !== false,
  })).filter((action) => action.label);
}

function classifyActionKind(label, fallback = '') {
  const text = clean(`${label} ${fallback}`);
  if (/save and continue|save & continue/i.test(text)) return 'save_and_continue';
  if (/save/i.test(text)) return 'save';
  if (/continue|next/i.test(text)) return 'next';
  if (/review/i.test(text)) return 'review';
  if (/submit/i.test(text)) return 'submit';
  if (/back|previous/i.test(text)) return 'back';
  return clean(fallback) || 'action';
}

function normalizeValidationEvents(events = [], context = {}) {
  return events.map((event) => ({
    canaryId: clean(context.canaryId),
    tenant: clean(context.tenant),
    jobId: clean(context.jobId),
    pageName: clean(event.pageName || context.pageName),
    sectionName: clean(event.sectionName || event.section || context.pageName),
    message: clean(event.message || event.text || event),
    observedAt: clean(event.observedAt || event.timestamp) || new Date().toISOString(),
  })).filter((event) => event.message);
}

function mergeFields(fields = []) {
  const byId = new Map();
  for (const field of fields) {
    const key = `${field.pageName}|${field.sectionName}|${field.normalizedQuestion}|${field.controlType}`;
    byId.set(key, { ...(byId.get(key) || {}), ...field });
  }
  return Array.from(byId.values());
}

function isCommittedObservation(raw = {}) {
  if (raw.redactedInBrowser) return true;
  if (raw.committed === true) return true;
  const phase = clean(raw.capturePhase).toLowerCase();
  const eventType = clean(raw.eventType).toLowerCase();
  return ['blur', 'change', 'page_transition', 'snapshot', 'manual_snapshot'].includes(phase)
    || ['blur', 'change', 'page_transition'].includes(eventType);
}

function committedEventType(raw = {}) {
  return clean(raw.eventType || raw.capturePhase || (raw.committed ? 'snapshot' : 'uncommitted'));
}

function normalizeWorkdayObservationQuestion(value) {
  return normalizeBankQuestion(value);
}

function normalizeControlType(field = {}) {
  const tagName = clean(field.tagName).toLowerCase();
  const type = clean(field.type).toLowerCase();
  const role = clean(field.role).toLowerCase();
  if (type === 'file') return 'file_upload';
  if (tagName === 'select') return 'select';
  if (role === 'combobox') return 'combobox';
  if (type === 'radio' || role === 'radio') return 'radio';
  if (type === 'checkbox' || role === 'checkbox') return 'checkbox';
  if (tagName === 'textarea') return 'textarea';
  if (['email', 'tel', 'phone', 'date', 'number'].includes(type)) return type === 'tel' ? 'phone' : type;
  return 'text';
}

function normalizeOptions(options = []) {
  if (!Array.isArray(options)) return [];
  return options.map((option) => ({
    label: clean(option.label || option.text),
    value: clean(option.value),
    selected: Boolean(option.selected),
  })).filter((option) => option.label || option.value);
}

function normalizeMessages(values = []) {
  if (!Array.isArray(values)) values = [values];
  return uniqueValues(values.map((value) => typeof value === 'object' ? value.message || value.text : value));
}

function sanitizePrimitiveValue(value) {
  if (Array.isArray(value)) {
    return value.map((item) => {
      if (item && typeof item === 'object') {
        return {
          name: clean(item.name),
          size: Number(item.size) || 0,
          type: clean(item.type),
          lastModified: Number(item.lastModified) || 0,
        };
      }
      return clean(item);
    });
  }
  if (value === null || value === undefined) return '';
  return clean(value);
}

function buildSecondaryCssSelector(field = {}) {
  const automation = clean(field.dataAutomationId);
  if (automation) return `[data-automation-id="${cssEscape(automation)}"]`;
  const id = clean(field.id);
  if (id) return `#${cssEscape(id)}`;
  const name = clean(field.name);
  if (name) return `[name="${cssEscape(name)}"]`;
  return '';
}

function cssEscape(value) {
  return clean(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function observationConfidence(raw, selector, redaction, committed) {
  if (redaction.redacted) return 1;
  let score = committed ? 0.72 : 0.35;
  if (selector.anchors.normalizedQuestion) score += 0.12;
  if (selector.anchors.sectionName) score += 0.06;
  if (selector.anchors.dataAutomationId || selector.anchors.id || selector.anchors.name) score += 0.06;
  if (Array.isArray(raw.options) && raw.options.length) score += 0.04;
  return boundedConfidence(score);
}

function stableObservationId(input = {}) {
  const payload = [
    input.pageName,
    input.sectionName,
    input.label,
    input.selector?.anchors?.normalizedQuestion,
    input.selector?.anchors?.name,
    input.selector?.anchors?.id,
  ].map(clean).join('|');
  return crypto.createHash('sha256').update(payload).digest('hex').slice(0, 16);
}

function buildWorkdayEvidenceIndex(summary, parts) {
  return {
    generatedAt: new Date().toISOString(),
    canaryId: summary.canaryId,
    evidenceReferences: WORKDAY_OBSERVATION_ARTIFACT_FILES.map((fileName) => ({
      fileName,
      purpose: evidencePurpose(fileName),
    })),
    counts: {
      pages: parts.pages.length,
      fields: parts.fields.length,
      transitions: parts.transitions.length,
      validations: parts.validations.length,
      redactions: parts.redactionReport.redactedFields.length,
      proposedAnswers: parts.proposedAnswerBankPatch.entries.length,
      replayEntries: parts.proposedReplayMap.entries.length,
    },
  };
}

function evidencePurpose(fileName) {
  const map = {
    'session-summary.json': 'bounded observation session metadata and guardrails',
    'active-tab-verification.json': 'active controlled browser tab verification and rejection metadata',
    'pages.json': 'observed Workday page and section names',
    'fields.json': 'committed visible field observations with redaction metadata',
    'transitions.json': 'manual navigation and button transition observations',
    'resume-flow.json': 'resume upload controls and approved artifact binding evidence',
    'validation-events.json': 'visible Workday validation messages',
    'proposed-replay-map.json': 'reviewable semantic replay anchors',
    'proposed-answer-bank-patch.json': 'reviewable answer-bank patch, not promoted automatically',
    'redaction-report.json': 'credential and sensitive storage exclusions',
    'evidence-index.json': 'artifact inventory',
  };
  return map[fileName] || 'observation artifact';
}

function gateForReuseClasses(classes = []) {
  if (classes.includes('legal_acknowledgment')) return 'legal_acknowledgment_requires_application_specific_approval';
  if (classes.includes('voluntary_disclosure') || classes.includes('sensitive_user_confirmed')) return 'sensitive_answer_requires_explicit_user_confirmation';
  if (classes.includes('human_only')) return 'human_only_gate';
  if (classes.includes('uncertain')) return 'low_confidence_review';
  if (classes.includes('tenant_specific')) return 'tenant_specific_reconfirm';
  if (classes.includes('reusable_but_reconfirm')) return 'reconfirm_before_replay';
  return 'none';
}

function replayReadinessStatus(entry = {}) {
  if (entry.replayGate === 'none' && entry.canReplayAutomatically) return 'ready_for_replay';
  if (/legal|human_only/.test(clean(entry.replayGate))) return 'human_only';
  if (/low_confidence|uncertain/.test(clean(entry.replayGate))) return 'unresolved';
  if (!entry.semanticSelector?.anchors?.normalizedQuestion) return 'unsupported';
  return 'replay_with_confirmation';
}

function replayReadinessReason(entry = {}) {
  const status = replayReadinessStatus(entry);
  if (status === 'ready_for_replay') return 'Reusable verified answer with semantic selector evidence.';
  if (status === 'human_only') return 'Legal, credential, or human-only control cannot be replayed autonomously.';
  if (status === 'unresolved') return 'Observed value is low confidence or missing canonical approval.';
  if (status === 'unsupported') return 'Control lacks enough semantic selector evidence for replay.';
  return 'Observed answer needs explicit confirmation before replay.';
}

function answerTypeForObservedField(field = {}) {
  if (field.controlType === 'checkbox') return 'checkbox';
  if (['select', 'combobox', 'radio'].includes(field.controlType)) return 'select';
  if (typeof field.selectedAnswer === 'boolean') return 'boolean_yes_no';
  if (/^(yes|no)$/i.test(clean(field.selectedAnswer))) return 'boolean_yes_no';
  return 'text';
}

function canonicalFieldFromQuestion(question) {
  return normalizeWorkdayObservationQuestion(question).replace(/\s+/g, '_').slice(0, 80) || 'observed_workday_field';
}

function safeReportAnswer(entry = {}) {
  if (entry.answer && typeof entry.answer === 'object') return '[runtime-value]';
  return clean(entry.answer);
}

function safeLoadAnswerBank() {
  try {
    return loadWorkdayAnswerBank();
  } catch {
    return null;
  }
}

function emptyObservationPage(context = {}) {
  return {
    actionControls: [],
    capturedAt: new Date().toISOString(),
    fields: [],
    pageName: clean(context.pageName),
    resumeUploadControls: [],
    sectionNames: [],
    title: '',
    transitions: [],
    url: clean(context.url),
    validationEvents: [],
  };
}

function inferWorkdayPageName(text) {
  const value = clean(text);
  return WORKDAY_PAGE_NAMES.find((name) => new RegExp(name.replace(/\s+/g, '\\s+'), 'i').test(value)) || '';
}

function approvedWorkdayOrigins(input = {}) {
  const origins = new Set();
  const envOrigins = clean(input.env?.CAREER_OS_WORKDAY_OBSERVE_ALLOWED_ORIGINS)
    .split(',')
    .map(clean)
    .filter(Boolean);
  for (const origin of envOrigins) origins.add(stripTrailingSlash(origin));
  const extraOrigins = Array.isArray(input.extraOrigins)
    ? input.extraOrigins
    : clean(input.extraOrigins).split(',').map(clean).filter(Boolean);
  for (const origin of extraOrigins) origins.add(stripTrailingSlash(origin));
  if (input.configuredIdentity?.ok) origins.add(originForUrl(input.configuredIdentity.canonicalUrl));
  return origins;
}

function isApprovedWorkdayHost(host) {
  const value = clean(host).toLowerCase();
  return /\.myworkdayjobs\.com$/.test(value) || value === 'careers.cisco.com';
}

function sameWorkdayIdentity(left, right) {
  return clean(left?.tenant).toLowerCase() === clean(right?.tenant).toLowerCase()
    && clean(left?.jobId).toLowerCase() === clean(right?.jobId).toLowerCase();
}

function publicIdentity(parsed) {
  return {
    canonicalUrl: clean(parsed.canonicalUrl),
    host: clean(parsed.host),
    jobId: clean(parsed.jobId),
    tenant: clean(parsed.tenant),
    vendor: clean(parsed.vendor),
  };
}

function originForUrl(value) {
  try {
    return new URL(value).origin;
  } catch {
    return '';
  }
}

function normalizeAcceptTypes(value) {
  if (Array.isArray(value)) return value.map(clean).filter(Boolean);
  return clean(value).split(',').map(clean).filter(Boolean);
}

function normalizeSelectedFiles(value) {
  if (!Array.isArray(value)) return [];
  return value.map((file) => ({
    name: clean(file.name),
    size: Number(file.size) || 0,
    type: clean(file.type),
    lastModified: Number(file.lastModified) || 0,
  })).filter((file) => file.name);
}

function isObservedRuntimeUrlAllowed(value, approvedOrigins = []) {
  const origin = originForUrl(value);
  if (!origin) return true;
  if (origin === 'null') return true;
  const approved = new Set((approvedOrigins || []).map(stripTrailingSlash));
  return approved.has(stripTrailingSlash(origin));
}

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function blockedObservation(reason, details) {
  return {
    ok: false,
    reason,
    details,
  };
}

function boundedConfidence(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0.5;
  return Math.max(0, Math.min(1, number));
}

function stripTrailingSlash(value) {
  return clean(value).replace(/\/+$/, '');
}

function uniqueValues(values) {
  return Array.from(new Set((values || []).map(clean).filter(Boolean)));
}

function clean(value) {
  return String(value ?? '').trim().replace(/^"|"$/g, '');
}
