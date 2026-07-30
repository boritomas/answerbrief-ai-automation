import fs from 'node:fs';
import path from 'node:path';

import {
  createEvidenceItem,
  type AtsEvidenceItem,
  type AtsExecutionContext,
  type AtsPhase,
  type EvidenceBundle,
  type FailureClassification,
  type JsonRecord,
  type UserGate,
} from './contracts';
import { detectAts } from './detector';
import {
  inferSensitivityFromLabel,
  resolveCanonicalFieldValue,
  type AtsRequestedField,
  type CanonicalFieldMappingResult,
  type CanonicalFieldSensitivity,
  type CanonicalFieldValue,
} from './field-mapping';

export const WORKDAY_FIXTURE_INSPECTOR_VERSION = 'career-os-workday-fixture-inspector-2026-07-24-phase-3';

export const WORKDAY_PAGE_STATES = [
  'UNKNOWN',
  'ACCOUNT_GATE',
  'SIGN_IN',
  'CREATE_ACCOUNT',
  'SESSION_EXPIRED',
  'APPLICATION_START',
  'RESUME_UPLOAD',
  'PERSONAL_INFORMATION',
  'WORK_EXPERIENCE',
  'EDUCATION',
  'APPLICATION_QUESTIONS',
  'VOLUNTARY_DISCLOSURES',
  'REVIEW',
  'SUBMIT_READY',
  'VALIDATION_ERROR',
  'CONFIRMATION',
] as const;

export type WorkdayPageState = typeof WORKDAY_PAGE_STATES[number];

export type WorkdayFailureCode =
  | 'FIXTURE_NOT_FOUND'
  | 'FIXTURE_INVALID'
  | 'LIVE_NAVIGATION_PROHIBITED'
  | 'WORKDAY_CONTEXT_UNRESOLVED'
  | 'ACCOUNT_GATE'
  | 'AUTHENTICATION_REQUIRED'
  | 'RESUME_CONTROL_NOT_FOUND'
  | 'REQUIRED_FIELDS_UNRESOLVED'
  | 'SENSITIVE_FIELD_REQUIRES_USER'
  | 'LOW_CONFIDENCE_MAPPING'
  | 'VALIDATION_ERROR'
  | 'SUBMIT_CONTROL_NOT_FOUND'
  | 'UNSUPPORTED_WORKDAY_STATE'
  | 'TERMINAL_FIXTURE_ERROR';

export type WorkdayFixtureMetadata = {
  scenarioName: string;
  expectedWorkdayState: WorkdayPageState;
  fixtureUrl: string;
  tenant?: string;
  jobId?: string;
  expectedRequiredFields?: string[];
  expectedUserGates?: string[];
  expectedFailureClassification?: WorkdayFailureCode;
  expectedSubmitControlState?: string;
  resumeUploadPresent?: boolean;
  authenticationRequired?: boolean;
  notes?: string[];
  [key: string]: unknown;
};

export type WorkdayFixture = {
  absolutePath: string;
  html: string;
  metadata: WorkdayFixtureMetadata;
  metadataPath: string;
  name: string;
  scenario: string;
  fixtureUrl: string;
};

export type WorkdaySelectorMetadata = {
  selectorType: 'css' | 'role' | 'text' | 'xpath' | 'unknown';
  selectorValue: string;
  attributeSignals: JsonRecord;
};

export type WorkdayInspectedField = {
  fieldId: string;
  label: string;
  normalizedLabel: string;
  inputType: AtsRequestedField['controlType'];
  htmlTag: string;
  required: boolean;
  visible: boolean;
  enabled: boolean;
  currentValuePresent: boolean;
  options: string[];
  section?: string;
  sensitiveCategory: CanonicalFieldSensitivity;
  canonicalCandidate?: string;
  mappingConfidence?: number;
  selector: WorkdaySelectorMetadata;
  validationMessage?: string;
  repeatedSectionContext?: {
    section: string;
    index?: number;
  };
  authorizationRequirement?: string;
  userDecisionRequirement?: string;
  rawAttributes: JsonRecord;
};

export type WorkdaySubmitControl = {
  selectorType: 'css' | 'role' | 'text' | 'xpath' | 'unknown';
  selectorValue: string;
  visible: boolean;
  enabled: boolean;
  text?: string;
  controlType: string;
  clickPermitted: false;
  noSubmitClick: true;
  metadata: JsonRecord;
};

export type WorkdayResumeUploadControl = {
  selectorType: 'css' | 'role' | 'text' | 'xpath' | 'unknown';
  selectorValue: string;
  visible: boolean;
  enabled: boolean;
  acceptedFileTypes: string[];
  required: boolean;
  uploadPermitted: false;
  metadata: JsonRecord;
};

export type WorkdayValidationSummary = {
  requiredFields: string[];
  unresolvedRequiredFields: string[];
  validationMessages: string[];
};

export type WorkdayInspectionSnapshot = {
  fixture: WorkdayFixture;
  pageState: WorkdayPageState;
  normalizedUrl: string;
  tenant?: string;
  jobId?: string;
  matchedSignals: string[];
  conflictingSignals: string[];
  unknowns: string[];
  fields: WorkdayInspectedField[];
  resumeUploadControl?: WorkdayResumeUploadControl;
  submitControl?: WorkdaySubmitControl;
  validation: WorkdayValidationSummary;
  userGates: UserGate[];
  failureCode?: WorkdayFailureCode;
  mode: 'fixture_inspection';
  inspectedAt: string;
};

export type WorkdayFieldMappingSummary = {
  fieldsMapped: number;
  unresolvedFields: string[];
  mappings: CanonicalFieldMappingResult[];
  userGates: UserGate[];
  failureCode?: WorkdayFailureCode;
};

export class WorkdayFixtureError extends Error {
  code: WorkdayFailureCode;
  details?: JsonRecord;

  constructor(code: WorkdayFailureCode, message: string, details?: JsonRecord) {
    super(message);
    this.name = 'WorkdayFixtureError';
    this.code = code;
    this.details = details;
  }
}

export function isWorkdayFixtureInspectionContext(context: AtsExecutionContext) {
  return context.mode === 'fixture_inspection';
}

export function ensureWorkdayFixtureMode(context: AtsExecutionContext) {
  if (context.mode === 'live') {
    throw new WorkdayFixtureError(
      'LIVE_NAVIGATION_PROHIBITED',
      'Workday Phase 3 native phases are fixture-only and do not navigate live ATS pages.',
      { mode: context.mode, sourceUrl: context.sourceUrl },
    );
  }
  if (!isWorkdayFixtureInspectionContext(context)) {
    throw new WorkdayFixtureError(
      'TERMINAL_FIXTURE_ERROR',
      'Workday fixture inspection requires mode fixture_inspection.',
      { mode: context.mode },
    );
  }
}

export function loadWorkdayFixture(context: AtsExecutionContext): WorkdayFixture {
  const rawJobRecord = asRecord(context.rawJobRecord);
  const source = clean(
    context.fixturePath
    || rawJobRecord.fixturePath
    || rawJobRecord.fixture_path
    || rawJobRecord.workdayFixturePath
    || rawJobRecord.workday_fixture_path,
  );

  if (!source) {
    throw new WorkdayFixtureError('FIXTURE_NOT_FOUND', 'No Workday fixture path was provided.');
  }

  if (isRemoteUrl(source)) {
    throw new WorkdayFixtureError(
      'LIVE_NAVIGATION_PROHIBITED',
      'Workday fixture loading accepts local files only; remote fixture fetches are prohibited.',
      { fixturePath: source },
    );
  }

  const absolutePath = path.isAbsolute(source) ? source : path.resolve(process.cwd(), source);
  if (!existsAsFile(absolutePath)) {
    throw new WorkdayFixtureError('FIXTURE_NOT_FOUND', 'The Workday fixture file was not found.', {
      fixturePath: absolutePath,
    });
  }

  const html = fs.readFileSync(absolutePath, 'utf8');
  if (!html.trim()) {
    throw new WorkdayFixtureError('FIXTURE_INVALID', 'The Workday fixture file is empty.', {
      fixturePath: absolutePath,
    });
  }

  const metadataPath = metadataPathFor(absolutePath);
  if (!existsAsFile(metadataPath)) {
    throw new WorkdayFixtureError('FIXTURE_INVALID', 'The Workday fixture metadata file is missing.', {
      fixturePath: absolutePath,
      metadataPath,
    });
  }

  const metadata = readFixtureMetadata(metadataPath);
  const fixtureName = clean(context.fixtureName || metadata.scenarioName || path.basename(absolutePath, path.extname(absolutePath)));
  const fixtureUrl = clean(metadata.fixtureUrl || context.sourceUrl || `file://${absolutePath}`);

  return {
    absolutePath,
    html,
    metadata,
    metadataPath,
    name: fixtureName,
    scenario: metadata.scenarioName,
    fixtureUrl,
  };
}

export function inspectWorkdayFixture(context: AtsExecutionContext): WorkdayInspectionSnapshot {
  ensureWorkdayFixtureMode(context);
  const fixture = loadWorkdayFixture(context);
  const page = classifyWorkdayPage(fixture);
  const detection = detectAts({
    sourceUrl: fixture.fixtureUrl || context.sourceUrl,
    platformHint: 'workday',
    rawJobRecord: {
      ats_platform: 'workday',
      job_url: fixture.fixtureUrl,
    },
    pageSignals: {
      platform: 'workday',
      workdayPageState: page.pageState,
      fixtureScenario: fixture.scenario,
    },
  });
  const fields = parseWorkdayFields(fixture.html);
  const resumeUploadControl = parseResumeUploadControl(fixture.html, fields);
  const submitControl = parseSubmitControl(fixture.html);
  const requiredFields = fields
    .filter((field) => field.required && field.visible && field.enabled)
    .map((field) => field.label);
  const unresolvedRequiredFields = fields
    .filter((field) => field.required && field.visible && field.enabled && !field.currentValuePresent)
    .map((field) => field.label);
  const validationMessages = fields
    .map((field) => field.validationMessage)
    .filter(isPresentString);
  const unknowns = detection.unknowns.slice();
  if (!fixture.metadata.tenant && !detection.tenant) unknowns.push('workday_tenant');
  if (!fixture.metadata.jobId && !detection.jobId) unknowns.push('workday_job_id');

  const failureCode = page.failureCode
    || (page.pageState === 'VALIDATION_ERROR' || validationMessages.length ? 'VALIDATION_ERROR' : undefined);

  return {
    fixture,
    pageState: page.pageState,
    normalizedUrl: detection.normalized.normalizedUrl || fixture.fixtureUrl,
    tenant: clean(fixture.metadata.tenant || detection.tenant) || undefined,
    jobId: clean(fixture.metadata.jobId || detection.jobId) || undefined,
    matchedSignals: unique(page.matchedSignals.concat(detection.matchedSignals)),
    conflictingSignals: unique(page.conflictingSignals.concat(detection.conflictingSignals)),
    unknowns: unique(unknowns),
    fields,
    resumeUploadControl,
    submitControl,
    validation: {
      requiredFields,
      unresolvedRequiredFields,
      validationMessages,
    },
    userGates: page.userGates,
    failureCode,
    mode: 'fixture_inspection',
    inspectedAt: new Date().toISOString(),
  };
}

export function mapWorkdayFixtureFields(
  snapshot: WorkdayInspectionSnapshot,
  candidateProfile?: JsonRecord,
): WorkdayFieldMappingSummary {
  const candidateValues = canonicalValuesFrom(candidateProfile);
  const mappedFields = snapshot.fields.filter((field) => {
    return field.visible && field.enabled && field.inputType !== 'file';
  });
  const mappings = mappedFields.map((field) => {
    return resolveCanonicalFieldValue(toRequestedField(field), candidateValues, {
      minimumConfidence: field.mappingConfidence,
    });
  });
  const unresolvedFields = mappings
    .filter((mapping) => mapping.requestedField.required && !mapping.canAutofill)
    .map((mapping) => mapping.requestedField.visibleLabel);
  const userGates = mappings
    .filter((mapping) => mapping.requestedField.required || mapping.userGate?.category !== 'MISSING_VERIFIED_FACT')
    .map((mapping) => mapping.userGate)
    .filter(isUserGate);
  const failureCode = failureCodeForMappings(unresolvedFields, userGates, mappings);

  return {
    fieldsMapped: mappings.filter((mapping) => mapping.canAutofill).length,
    unresolvedFields,
    mappings,
    userGates,
    failureCode,
  };
}

export function createWorkdayFixtureEvidence(
  snapshot: WorkdayInspectionSnapshot,
  phase: AtsPhase,
  options: {
    failureCode?: WorkdayFailureCode;
    mapping?: WorkdayFieldMappingSummary;
    userGates?: UserGate[];
    validationMessages?: string[];
  } = {},
): AtsEvidenceItem[] {
  const userGates = uniqueGates((options.userGates || []).concat(snapshot.userGates));
  const failureCode = options.failureCode || options.mapping?.failureCode || snapshot.failureCode;
  const validationMessages = unique((options.validationMessages || []).concat(snapshot.validation.validationMessages));
  const unresolvedFields = unique((options.mapping?.unresolvedFields || []).concat(snapshot.validation.unresolvedRequiredFields));
  const metadata: JsonRecord = {
    adapter: 'workday',
    phase,
    fixtureName: snapshot.fixture.name,
    fixturePath: snapshot.fixture.absolutePath,
    fixtureMetadataPath: snapshot.fixture.metadataPath,
    scenario: snapshot.fixture.scenario,
    pageState: snapshot.pageState,
    normalizedUrl: snapshot.normalizedUrl,
    tenant: snapshot.tenant,
    jobId: snapshot.jobId,
    matchedSignals: snapshot.matchedSignals,
    conflictingSignals: snapshot.conflictingSignals,
    selectors: selectorEvidence(snapshot),
    requiredFields: snapshot.validation.requiredFields,
    unresolvedFields,
    userGates: userGates.map((gate) => gate.category),
    validationMessages,
    submitControl: snapshot.submitControl,
    resumeUploadControl: snapshot.resumeUploadControl,
    mode: snapshot.mode,
    inspectedAt: snapshot.inspectedAt,
    noLiveNavigation: true,
    noSubmitClick: true,
    noProductionAction: true,
    fixtureInspectorVersion: WORKDAY_FIXTURE_INSPECTOR_VERSION,
  };
  if (failureCode) metadata.workdayFailureCode = failureCode;

  const evidence = [
    createEvidenceItem({
      kind: 'page_snapshot',
      label: 'Workday fixture inspection snapshot',
      value: snapshot.pageState,
      url: snapshot.normalizedUrl,
      metadata,
    }),
    createEvidenceItem({
      kind: 'field_scan',
      label: 'Workday fixture fields inspected',
      value: String(snapshot.fields.length),
      url: snapshot.normalizedUrl,
      metadata: {
        fixtureName: snapshot.fixture.name,
        fieldsDetected: snapshot.fields.length,
        requiredFields: snapshot.validation.requiredFields,
        unresolvedFields,
      },
    }),
  ];

  if (validationMessages.length) {
    evidence.push(createEvidenceItem({
      kind: 'validation',
      label: 'Workday fixture validation messages',
      value: validationMessages.join('; '),
      url: snapshot.normalizedUrl,
      metadata: {
        fixtureName: snapshot.fixture.name,
        validationMessages,
        workdayFailureCode: failureCode || 'VALIDATION_ERROR',
      },
    }));
  }

  if (snapshot.submitControl) {
    evidence.push(createEvidenceItem({
      kind: 'submit_control',
      label: 'Workday fixture submit control located',
      value: snapshot.submitControl.selectorValue,
      url: snapshot.normalizedUrl,
      metadata: {
        fixtureName: snapshot.fixture.name,
        submitControl: snapshot.submitControl,
        noSubmitClick: true,
      },
    }));
  }

  if (failureCode) {
    evidence.push(createEvidenceItem({
      kind: 'failure',
      label: 'Workday fixture failure classification',
      value: failureCode,
      url: snapshot.normalizedUrl,
      metadata: {
        fixtureName: snapshot.fixture.name,
        workdayFailureCode: failureCode,
        userGates: userGates.map((gate) => gate.category),
        unresolvedFields,
        validationMessages,
      },
    }));
  }

  return evidence;
}

export function createWorkdayEvidenceBundle(
  snapshot: WorkdayInspectionSnapshot,
  phase: AtsPhase,
  options: Parameters<typeof createWorkdayFixtureEvidence>[2] = {},
): EvidenceBundle {
  const items = createWorkdayFixtureEvidence(snapshot, phase, options);
  return {
    items,
    summary: `Workday fixture ${snapshot.fixture.name} inspected as ${snapshot.pageState}; no live navigation or submit click occurred.`,
  };
}

export function classifyWorkdayFixtureFailure(
  errorOrCode: unknown,
  message?: string,
  userGate?: UserGate,
  rawSignals: JsonRecord = {},
): FailureClassification {
  const fixtureError = errorOrCode instanceof WorkdayFixtureError ? errorOrCode : undefined;
  const code = fixtureError?.code || normalizeFailureCode(errorOrCode);
  const failureMessage = message || fixtureError?.message || `Workday fixture failure: ${code}`;
  const gate = userGate || gateFromFailureCode(code, failureMessage);

  return {
    code: sharedFailureCode(code),
    message: failureMessage,
    retryPolicy: {
      classification: retryClassification(code),
      retryable: false,
      reason: retryReason(code),
    },
    terminal: terminalFailure(code),
    userGate: gate,
    rawSignals: {
      ...rawSignals,
      ...(fixtureError?.details || {}),
      workdayFailureCode: code,
    },
  };
}

export function remoteFixtureRejected(context: AtsExecutionContext) {
  try {
    loadWorkdayFixture(context);
    return false;
  } catch (error) {
    return error instanceof WorkdayFixtureError && error.code === 'LIVE_NAVIGATION_PROHIBITED';
  }
}

function classifyWorkdayPage(fixture: WorkdayFixture): {
  pageState: WorkdayPageState;
  matchedSignals: string[];
  conflictingSignals: string[];
  userGates: UserGate[];
  failureCode?: WorkdayFailureCode;
} {
  const htmlState = normalizePageState(extractAttributeValue(fixture.html, 'data-workday-state'));
  const metadataState = normalizePageState(fixture.metadata.expectedWorkdayState);
  const inferredState = inferPageStateFromHtml(fixture.html);
  const pageState = htmlState || metadataState || inferredState || 'UNKNOWN';
  const matchedSignals: string[] = [];
  const conflictingSignals: string[] = [];

  if (htmlState) matchedSignals.push(`fixture_html_state:${htmlState}`);
  if (metadataState) matchedSignals.push(`fixture_metadata_state:${metadataState}`);
  if (inferredState) matchedSignals.push(`fixture_text_state:${inferredState}`);
  if (htmlState && metadataState && htmlState !== metadataState) {
    conflictingSignals.push(`fixture_state_conflict:${htmlState}_vs_${metadataState}`);
  }

  const userGates = pageStateGates(pageState, fixture.html);
  let failureCode: WorkdayFailureCode | undefined;
  if (pageState === 'UNKNOWN') failureCode = 'UNSUPPORTED_WORKDAY_STATE';
  if (pageState === 'ACCOUNT_GATE' || pageState === 'SIGN_IN' || pageState === 'SESSION_EXPIRED') {
    failureCode = pageState === 'ACCOUNT_GATE' ? 'ACCOUNT_GATE' : 'AUTHENTICATION_REQUIRED';
  }
  if (pageState === 'CREATE_ACCOUNT') failureCode = 'ACCOUNT_GATE';

  return {
    pageState,
    matchedSignals,
    conflictingSignals,
    userGates,
    failureCode,
  };
}

function parseWorkdayFields(html: string): WorkdayInspectedField[] {
  const fields: WorkdayInspectedField[] = [];
  const tagPattern = /<(input|select|textarea)\b([^>]*)(?:>([\s\S]*?)<\/\1>)?/gi;
  let match: RegExpExecArray | null;
  while ((match = tagPattern.exec(html)) !== null) {
    const tag = match[1].toLowerCase();
    const attrs = parseAttributes(match[2] || '');
    const content = match[3] || '';
    if (!hasAttribute(attrs, 'data-ats-field') && !hasAttribute(attrs, 'data-resume-upload')) continue;

    const id = clean(attrs.id);
    const name = clean(attrs.name);
    const label = clean(
      attrs['data-label']
      || attrs['aria-label']
      || attrs.label
      || extractLabelFor(html, id)
      || name
      || id
      || 'Unnamed Workday field',
    );
    const options = tag === 'select' ? parseOptions(content) : [];
    const rawType = tag === 'input' ? clean(attrs.type || 'text').toLowerCase() : tag;
    const inputType = controlTypeFor(tag, rawType);
    const selectedOption = parseSelectedOption(content);
    const rawValue = clean(attrs.value || selectedOption);
    const currentValuePresent = Boolean(rawValue)
      || hasAttribute(attrs, 'checked')
      || hasAttribute(attrs, 'data-current-value-present');
    const section = clean(attrs['data-section']) || undefined;
    const repeatedSection = clean(attrs['data-repeated-section']);
    const repeatIndex = numberOrUndefined(attrs['data-repeat-index']);
    const sensitivity = toSensitivity(attrs['data-sensitive'], label);
    const selector = selectorForField(id, name, attrs);
    const validationMessage = clean(attrs['data-validation-message'] || attrs['aria-errormessage']) || undefined;

    fields.push({
      fieldId: clean(attrs['data-field-id'] || id || name || `${inputType}-${fields.length + 1}`),
      label,
      normalizedLabel: normalize(label),
      inputType,
      htmlTag: tag,
      required: hasAttribute(attrs, 'required') || clean(attrs['aria-required']) === 'true' || clean(attrs['data-required']) === 'true',
      visible: !hasAttribute(attrs, 'hidden') && clean(attrs['aria-hidden']) !== 'true' && clean(attrs['data-visible']) !== 'false',
      enabled: !hasAttribute(attrs, 'disabled') && clean(attrs['aria-disabled']) !== 'true' && clean(attrs['data-enabled']) !== 'false',
      currentValuePresent,
      options,
      section,
      sensitiveCategory: sensitivity,
      canonicalCandidate: clean(attrs['data-canonical']) || undefined,
      mappingConfidence: numberOrUndefined(attrs['data-confidence']),
      selector,
      validationMessage,
      repeatedSectionContext: repeatedSection ? {
        section: repeatedSection,
        index: repeatIndex,
      } : undefined,
      authorizationRequirement: clean(attrs['data-authorization']) || undefined,
      userDecisionRequirement: clean(attrs['data-user-decision']) || undefined,
      rawAttributes: attrs,
    });
  }
  return fields;
}

function parseResumeUploadControl(html: string, fields: WorkdayInspectedField[]): WorkdayResumeUploadControl | undefined {
  const resumeField = fields.find((field) => {
    return field.inputType === 'file' && (/resume|cv/i.test(field.label) || hasAttribute(field.rawAttributes, 'data-resume-upload'));
  });
  if (!resumeField) return undefined;
  const accept = clean(resumeField.rawAttributes.accept);
  return {
    selectorType: resumeField.selector.selectorType,
    selectorValue: resumeField.selector.selectorValue,
    visible: resumeField.visible,
    enabled: resumeField.enabled,
    acceptedFileTypes: accept ? accept.split(',').map((value) => value.trim()).filter(Boolean) : [],
    required: resumeField.required,
    uploadPermitted: false,
    metadata: {
      fieldId: resumeField.fieldId,
      label: resumeField.label,
      noRealResumeUpload: true,
      htmlMatchedResumeControl: /data-resume-upload/i.test(html),
    },
  };
}

function parseSubmitControl(html: string): WorkdaySubmitControl | undefined {
  const tagPattern = /<(button|input)\b([^>]*)(?:>([\s\S]*?)<\/button>)?/gi;
  let match: RegExpExecArray | null;
  while ((match = tagPattern.exec(html)) !== null) {
    const tag = match[1].toLowerCase();
    const attrs = parseAttributes(match[2] || '');
    if (!hasAttribute(attrs, 'data-submit-control')) continue;

    const text = tag === 'input'
      ? clean(attrs.value || attrs['aria-label'] || 'Submit')
      : clean(stripTags(match[3] || '') || attrs['aria-label'] || 'Submit');
    const id = clean(attrs.id);
    const name = clean(attrs.name);
    return {
      selectorType: 'css',
      selectorValue: id ? `#${cssEscape(id)}` : name ? `[name="${cssEscape(name)}"]` : '[data-submit-control="true"]',
      visible: !hasAttribute(attrs, 'hidden') && clean(attrs['aria-hidden']) !== 'true' && clean(attrs['data-visible']) !== 'false',
      enabled: !hasAttribute(attrs, 'disabled') && clean(attrs['aria-disabled']) !== 'true' && clean(attrs['data-enabled']) !== 'false',
      text,
      controlType: clean(attrs.type || 'button') || 'button',
      clickPermitted: false,
      noSubmitClick: true,
      metadata: {
        tag,
        id,
        name,
        dataSubmitControl: true,
        noProductionAction: true,
      },
    };
  }
  return undefined;
}

function toRequestedField(field: WorkdayInspectedField): AtsRequestedField {
  return {
    atsFieldIdentifier: clean(field.canonicalCandidate || field.fieldId),
    visibleLabel: field.label,
    controlType: field.inputType,
    options: field.options,
    required: field.required,
    surroundingContext: field.section,
  };
}

function failureCodeForMappings(
  unresolvedFields: string[],
  userGates: UserGate[],
  mappings: CanonicalFieldMappingResult[],
): WorkdayFailureCode | undefined {
  if (!unresolvedFields.length && !userGates.length) return undefined;
  if (userGates.some((gate) => gate.category === 'LOW_CONFIDENCE_ANSWER')) return 'LOW_CONFIDENCE_MAPPING';
  if (userGates.some((gate) => {
    return gate.category !== 'MISSING_VERIFIED_FACT' && gate.category !== 'LOW_CONFIDENCE_ANSWER';
  })) {
    return 'SENSITIVE_FIELD_REQUIRES_USER';
  }
  if (mappings.some((mapping) => mapping.reasonUnavailable === 'missing_canonical_value')) return 'REQUIRED_FIELDS_UNRESOLVED';
  return 'REQUIRED_FIELDS_UNRESOLVED';
}

function canonicalValuesFrom(candidateProfile?: JsonRecord): CanonicalFieldValue[] {
  const profile = asRecord(candidateProfile);
  const rawValues = Array.isArray(profile.canonicalValues)
    ? profile.canonicalValues
    : Array.isArray(profile.values)
      ? profile.values
      : [];
  return rawValues
    .map((value) => asRecord(value))
    .filter((value) => Boolean(clean(value.canonicalFieldKey)))
    .map((value) => ({
      canonicalFieldKey: clean(value.canonicalFieldKey),
      value: value.value,
      displayValue: clean(value.displayValue) || undefined,
      source: clean(value.source || 'fixture_candidate_profile'),
      confidence: typeof value.confidence === 'number' ? value.confidence : 0,
      verified: value.verified === true,
      authorizationStatus: canonicalAuthorizationStatus(value.authorizationStatus),
      sensitivityClassification: toSensitivity(value.sensitivityClassification, clean(value.canonicalFieldKey)),
      reviewedAt: clean(value.reviewedAt) || undefined,
      expiresAt: clean(value.expiresAt) || undefined,
      reasonUnavailable: clean(value.reasonUnavailable) || undefined,
      provenance: asRecord(value.provenance),
    }));
}

function readFixtureMetadata(metadataPath: string): WorkdayFixtureMetadata {
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new WorkdayFixtureError('FIXTURE_INVALID', `The Workday fixture metadata is invalid JSON: ${message}`, {
      metadataPath,
    });
  }

  const record = asRecord(parsed);
  const scenarioName = clean(record.scenarioName);
  const fixtureUrl = clean(record.fixtureUrl);
  const expectedWorkdayState = normalizePageState(record.expectedWorkdayState);

  if (!scenarioName || !fixtureUrl || !expectedWorkdayState) {
    throw new WorkdayFixtureError('FIXTURE_INVALID', 'Workday fixture metadata must include scenarioName, fixtureUrl, and expectedWorkdayState.', {
      metadataPath,
      scenarioName,
      fixtureUrl,
      expectedWorkdayState: clean(record.expectedWorkdayState),
    });
  }

  return {
    ...record,
    scenarioName,
    expectedWorkdayState,
    fixtureUrl,
    tenant: clean(record.tenant) || undefined,
    jobId: clean(record.jobId) || undefined,
    expectedRequiredFields: stringArray(record.expectedRequiredFields),
    expectedUserGates: stringArray(record.expectedUserGates),
    expectedFailureClassification: normalizeFailureCode(record.expectedFailureClassification),
    expectedSubmitControlState: clean(record.expectedSubmitControlState) || undefined,
    resumeUploadPresent: typeof record.resumeUploadPresent === 'boolean' ? record.resumeUploadPresent : undefined,
    authenticationRequired: typeof record.authenticationRequired === 'boolean' ? record.authenticationRequired : undefined,
    notes: stringArray(record.notes),
  };
}

function metadataPathFor(fixturePath: string) {
  return `${fixturePath.slice(0, -path.extname(fixturePath).length)}.json`;
}

function normalizePageState(value: unknown): WorkdayPageState | undefined {
  const state = clean(value).toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return WORKDAY_PAGE_STATES.indexOf(state as WorkdayPageState) >= 0 ? state as WorkdayPageState : undefined;
}

function normalizeFailureCode(value: unknown): WorkdayFailureCode {
  const code = clean(value).toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  const allowed: WorkdayFailureCode[] = [
    'FIXTURE_NOT_FOUND',
    'FIXTURE_INVALID',
    'LIVE_NAVIGATION_PROHIBITED',
    'WORKDAY_CONTEXT_UNRESOLVED',
    'ACCOUNT_GATE',
    'AUTHENTICATION_REQUIRED',
    'RESUME_CONTROL_NOT_FOUND',
    'REQUIRED_FIELDS_UNRESOLVED',
    'SENSITIVE_FIELD_REQUIRES_USER',
    'LOW_CONFIDENCE_MAPPING',
    'VALIDATION_ERROR',
    'SUBMIT_CONTROL_NOT_FOUND',
    'UNSUPPORTED_WORKDAY_STATE',
    'TERMINAL_FIXTURE_ERROR',
  ];
  return allowed.indexOf(code as WorkdayFailureCode) >= 0 ? code as WorkdayFailureCode : 'TERMINAL_FIXTURE_ERROR';
}

function inferPageStateFromHtml(html: string): WorkdayPageState | undefined {
  const text = normalize(stripTags(html));
  if (/session expired|timed out/.test(text)) return 'SESSION_EXPIRED';
  if (/create account|register/.test(text)) return 'CREATE_ACCOUNT';
  if (/sign in|login|log in/.test(text)) return 'SIGN_IN';
  if (/upload resume|resume upload|attach resume/.test(text)) return 'RESUME_UPLOAD';
  if (/validation error|required field/.test(text)) return 'VALIDATION_ERROR';
  if (/review.*submit|submit application/.test(text)) return 'SUBMIT_READY';
  if (/voluntary disclosures|gender|veteran|disability/.test(text)) return 'VOLUNTARY_DISCLOSURES';
  if (/application questions|sponsorship|relocation/.test(text)) return 'APPLICATION_QUESTIONS';
  if (/personal information|legal first name|email address/.test(text)) return 'PERSONAL_INFORMATION';
  if (/confirmation|application submitted/.test(text)) return 'CONFIRMATION';
  return undefined;
}

function pageStateGates(pageState: WorkdayPageState, html: string): UserGate[] {
  const gates: UserGate[] = [];
  if (pageState === 'ACCOUNT_GATE' || pageState === 'SIGN_IN' || pageState === 'SESSION_EXPIRED') {
    gates.push({
      category: 'AUTHENTICATION_REQUIRED',
      label: 'Workday sign-in required',
      reason: 'The fixture represents a Workday account or session gate that must be completed by the user.',
      rawSignals: { pageState },
    });
  }
  if (pageState === 'CREATE_ACCOUNT') {
    gates.push({
      category: 'ACCOUNT_CREATION_REQUIRED',
      label: 'Workday account creation required',
      reason: 'The fixture represents a Workday create-account gate that must be completed by the user.',
      rawSignals: { pageState },
    });
  }
  if (/data-mfa-required=["']?true|multi-factor|verification code/i.test(html)) {
    gates.push({
      category: 'MFA_REQUIRED',
      label: 'Workday MFA required',
      reason: 'The fixture includes MFA signals that require user completion.',
      rawSignals: { pageState, mfaSignal: true },
    });
  }
  if (/data-captcha-required=["']?true|captcha|recaptcha/i.test(html)) {
    gates.push({
      category: 'CAPTCHA_REQUIRED',
      label: 'Workday CAPTCHA required',
      reason: 'The fixture includes CAPTCHA signals that require user completion.',
      rawSignals: { pageState, captchaSignal: true },
    });
  }
  return gates;
}

function parseAttributes(source: string): JsonRecord {
  const attrs: JsonRecord = {};
  const attrPattern = /([:@A-Za-z0-9_-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let match: RegExpExecArray | null;
  while ((match = attrPattern.exec(source)) !== null) {
    const key = match[1];
    const value = match[2] ?? match[3] ?? match[4] ?? true;
    attrs[key] = typeof value === 'string' ? decodeEntities(value) : value;
  }
  return attrs;
}

function parseOptions(source: string) {
  const options: string[] = [];
  const optionPattern = /<option\b([^>]*)>([\s\S]*?)<\/option>/gi;
  let match: RegExpExecArray | null;
  while ((match = optionPattern.exec(source)) !== null) {
    const attrs = parseAttributes(match[1] || '');
    const text = clean(stripTags(match[2] || ''));
    const value = clean(attrs.value);
    options.push(text || value);
  }
  return options.filter(Boolean);
}

function parseSelectedOption(source: string) {
  const optionPattern = /<option\b([^>]*)>([\s\S]*?)<\/option>/gi;
  let match: RegExpExecArray | null;
  while ((match = optionPattern.exec(source)) !== null) {
    const attrs = parseAttributes(match[1] || '');
    if (hasAttribute(attrs, 'selected')) return clean(attrs.value || stripTags(match[2] || ''));
  }
  return '';
}

function extractLabelFor(html: string, id?: string) {
  if (!id) return '';
  const escaped = escapeRegExp(id);
  const labelPattern = new RegExp(`<label\\b[^>]*for=["']${escaped}["'][^>]*>([\\s\\S]*?)<\\/label>`, 'i');
  const match = labelPattern.exec(html);
  return match ? clean(stripTags(match[1])) : '';
}

function extractAttributeValue(html: string, attribute: string) {
  const escaped = escapeRegExp(attribute);
  const pattern = new RegExp(`${escaped}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'=<>]+))`, 'i');
  const match = pattern.exec(html);
  return match ? decodeEntities(match[1] || match[2] || match[3] || '') : '';
}

function selectorForField(id: string, name: string, attrs: JsonRecord): WorkdaySelectorMetadata {
  if (id) {
    return {
      selectorType: 'css',
      selectorValue: `#${cssEscape(id)}`,
      attributeSignals: { id },
    };
  }
  if (name) {
    return {
      selectorType: 'css',
      selectorValue: `[name="${cssEscape(name)}"]`,
      attributeSignals: { name },
    };
  }
  const fieldId = clean(attrs['data-field-id'] || attrs['data-canonical']);
  return {
    selectorType: fieldId ? 'css' : 'unknown',
    selectorValue: fieldId ? `[data-field-id="${cssEscape(fieldId)}"]` : '',
    attributeSignals: { dataFieldId: fieldId },
  };
}

function selectorEvidence(snapshot: WorkdayInspectionSnapshot) {
  return {
    fields: snapshot.fields.map((field) => ({
      fieldId: field.fieldId,
      label: field.label,
      selector: field.selector,
      visible: field.visible,
      enabled: field.enabled,
    })),
    resumeUploadControl: snapshot.resumeUploadControl,
    submitControl: snapshot.submitControl,
  };
}

function controlTypeFor(tag: string, rawType: string): AtsRequestedField['controlType'] {
  if (tag === 'select') return 'select';
  if (tag === 'textarea') return 'textarea';
  if (rawType === 'file') return 'file';
  if (rawType === 'checkbox') return 'checkbox';
  if (rawType === 'radio') return 'radio';
  if (rawType === 'search') return 'combobox';
  return 'text';
}

function canonicalAuthorizationStatus(value: unknown): CanonicalFieldValue['authorizationStatus'] {
  const status = clean(value);
  const allowed: CanonicalFieldValue['authorizationStatus'][] = [
    'authorized',
    'authorized_for_reuse',
    'authorized_for_application',
    'authorization_required',
    'not_authorized',
    'user_decision_required',
    'unknown',
  ];
  return allowed.indexOf(status as CanonicalFieldValue['authorizationStatus']) >= 0
    ? status as CanonicalFieldValue['authorizationStatus']
    : 'unknown';
}

function toSensitivity(value: unknown, fallbackLabel: string): CanonicalFieldSensitivity {
  const text = clean(value).toLowerCase();
  const allowed: CanonicalFieldSensitivity[] = [
    'standard',
    'contact',
    'employment',
    'salary',
    'relocation',
    'sponsorship',
    'legal',
    'demographic',
    'disability',
    'veteran',
    'conflict_disclosure',
  ];
  return allowed.indexOf(text as CanonicalFieldSensitivity) >= 0
    ? text as CanonicalFieldSensitivity
    : inferSensitivityFromLabel(fallbackLabel);
}

function sharedFailureCode(code: WorkdayFailureCode): FailureClassification['code'] {
  if (code === 'AUTHENTICATION_REQUIRED' || code === 'ACCOUNT_GATE') return 'authentication_gate';
  if (code === 'VALIDATION_ERROR') return 'validation_failed';
  if (code === 'SUBMIT_CONTROL_NOT_FOUND') return 'submit_control_missing';
  if (code === 'REQUIRED_FIELDS_UNRESOLVED' || code === 'LOW_CONFIDENCE_MAPPING') return 'missing_verified_fact';
  if (code === 'SENSITIVE_FIELD_REQUIRES_USER') return 'policy_gate';
  return 'runtime_error';
}

function retryClassification(code: WorkdayFailureCode): FailureClassification['retryPolicy']['classification'] {
  if (code === 'AUTHENTICATION_REQUIRED' || code === 'ACCOUNT_GATE') return 'manual_resume_required';
  if (code === 'VALIDATION_ERROR' || code === 'REQUIRED_FIELDS_UNRESOLVED' || code === 'SENSITIVE_FIELD_REQUIRES_USER') {
    return 'manual_resume_required';
  }
  return 'terminal';
}

function retryReason(code: WorkdayFailureCode) {
  if (code === 'AUTHENTICATION_REQUIRED' || code === 'ACCOUNT_GATE') {
    return 'Workday account gates require explicit user action in Phase 3.';
  }
  if (code === 'REQUIRED_FIELDS_UNRESOLVED' || code === 'SENSITIVE_FIELD_REQUIRES_USER' || code === 'LOW_CONFIDENCE_MAPPING') {
    return 'Candidate data or user authorization is required before continuing.';
  }
  if (code === 'VALIDATION_ERROR') {
    return 'Fixture validation errors require inspection before continuing.';
  }
  return 'The fixture cannot proceed automatically in this phase.';
}

function terminalFailure(code: WorkdayFailureCode) {
  return code === 'FIXTURE_NOT_FOUND'
    || code === 'FIXTURE_INVALID'
    || code === 'LIVE_NAVIGATION_PROHIBITED'
    || code === 'WORKDAY_CONTEXT_UNRESOLVED'
    || code === 'UNSUPPORTED_WORKDAY_STATE'
    || code === 'TERMINAL_FIXTURE_ERROR';
}

function gateFromFailureCode(code: WorkdayFailureCode, message: string): UserGate | undefined {
  if (code === 'AUTHENTICATION_REQUIRED' || code === 'ACCOUNT_GATE') {
    return {
      category: 'AUTHENTICATION_REQUIRED',
      label: 'Workday authentication required',
      reason: message,
      rawSignals: { workdayFailureCode: code },
    };
  }
  return undefined;
}

function hasAttribute(attrs: JsonRecord, key: string) {
  return Object.prototype.hasOwnProperty.call(attrs, key);
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}

function clean(value: unknown) {
  return String(value ?? '').trim();
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.map((entry) => clean(entry)).filter(Boolean)
    : [];
}

function normalize(value: string) {
  return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function stripTags(value: string) {
  return decodeEntities(value.replace(/<[^>]+>/g, ' '));
}

function decodeEntities(value: string) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function cssEscape(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isRemoteUrl(value: string) {
  return /^https?:\/\//i.test(value);
}

function existsAsFile(filePath: string) {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function numberOrUndefined(value: unknown) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : undefined;
}

function isPresentString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isUserGate(value: unknown): value is UserGate {
  return Boolean(value && typeof value === 'object' && clean((value as UserGate).category));
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function uniqueGates(gates: UserGate[]) {
  const seen = new Set<string>();
  const result: UserGate[] = [];
  for (const gate of gates) {
    const key = `${gate.category}:${gate.label}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(gate);
  }
  return result;
}
