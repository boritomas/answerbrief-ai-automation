export type JsonRecord = Record<string, unknown>;

export type AtsPlatform = 'greenhouse' | 'workday' | 'unsupported' | 'unknown';

export type AtsImplementationStatus =
  | 'compatibility'
  | 'experimental'
  | 'validated'
  | 'degraded'
  | 'unsupported';

export type AtsRuntimeType =
  | 'browser_companion'
  | 'compatibility_bridge'
  | 'dry_run'
  | 'server'
  | 'unsupported';

export type AtsExecutionMode = 'compatibility' | 'dry_run' | 'fixture_inspection' | 'live';

export type AtsCanonicalState =
  | 'DISCOVERED'
  | 'QUALIFIED'
  | 'READY_FOR_AUTOMATION'
  | 'SESSION_REQUIRED'
  | 'APPLICATION_OPENED'
  | 'FORM_INSPECTED'
  | 'FORM_COMPLETED'
  | 'VALIDATION_PASSED'
  | 'SUBMIT_CONTROL_RESOLVED'
  | 'SUBMIT_CLICKED'
  | 'SUBMISSION_CONFIRMED'
  | 'WAITING_ON_USER'
  | 'RETRYABLE_FAILURE'
  | 'TERMINAL_FAILURE';

export const ATS_CANONICAL_STATES: AtsCanonicalState[] = [
  'DISCOVERED',
  'QUALIFIED',
  'READY_FOR_AUTOMATION',
  'SESSION_REQUIRED',
  'APPLICATION_OPENED',
  'FORM_INSPECTED',
  'FORM_COMPLETED',
  'VALIDATION_PASSED',
  'SUBMIT_CONTROL_RESOLVED',
  'SUBMIT_CLICKED',
  'SUBMISSION_CONFIRMED',
  'WAITING_ON_USER',
  'RETRYABLE_FAILURE',
  'TERMINAL_FAILURE',
];

export type AtsPhase =
  | 'detect'
  | 'normalizeJobUrl'
  | 'openApplication'
  | 'authenticate'
  | 'uploadResume'
  | 'inspectApplication'
  | 'mapFields'
  | 'fillFields'
  | 'answerQuestions'
  | 'validate'
  | 'locateSubmitControl'
  | 'clickSubmit'
  | 'verifySubmission'
  | 'captureEvidence'
  | 'classifyFailure';

export type AtsPhaseStatus =
  | 'not_started'
  | 'running'
  | 'succeeded'
  | 'skipped'
  | 'paused'
  | 'failed'
  | 'unsupported';

export type AtsEvidenceKind =
  | 'detector_signal'
  | 'normalized_url'
  | 'page_snapshot'
  | 'field_scan'
  | 'field_mapping'
  | 'validation'
  | 'submit_control'
  | 'submit_click'
  | 'confirmation'
  | 'screenshot'
  | 'failure'
  | 'unsupported';

export type UserGateCategory =
  | 'AUTHENTICATION_REQUIRED'
  | 'ACCOUNT_CREATION_REQUIRED'
  | 'MFA_REQUIRED'
  | 'CAPTCHA_REQUIRED'
  | 'SALARY_DECISION_REQUIRED'
  | 'RELOCATION_DECISION_REQUIRED'
  | 'SPONSORSHIP_DECISION_REQUIRED'
  | 'LEGAL_CONSENT_REQUIRED'
  | 'BACKGROUND_CHECK_CONSENT_REQUIRED'
  | 'DRUG_SCREEN_CONSENT_REQUIRED'
  | 'ARBITRATION_CONSENT_REQUIRED'
  | 'DEMOGRAPHIC_DECISION_REQUIRED'
  | 'DISABILITY_SELF_ID_REQUIRED'
  | 'VETERAN_SELF_ID_REQUIRED'
  | 'CONFLICT_DISCLOSURE_REQUIRED'
  | 'LOW_CONFIDENCE_ANSWER'
  | 'MISSING_VERIFIED_FACT';

export type RetryClassification =
  | 'none'
  | 'transient_navigation'
  | 'transient_upload'
  | 'stale_session'
  | 'rate_limited'
  | 'manual_resume_required'
  | 'unsupported'
  | 'terminal';

export type FailureClassificationCode =
  | 'unsupported_ats'
  | 'missing_verified_fact'
  | 'policy_gate'
  | 'authentication_gate'
  | 'captcha_gate'
  | 'validation_failed'
  | 'submit_control_missing'
  | 'submit_not_confirmed'
  | 'job_unavailable'
  | 'runtime_error';

export type AtsAdapterCapabilities = {
  supportsResumeUpload: boolean;
  supportsResumeParsing: boolean;
  supportsSavedProfile: boolean;
  supportsAccountCreation: boolean;
  supportsAuthenticatedSessions: boolean;
  supportsMultiStepApplications: boolean;
  supportsRepeatedWorkHistory: boolean;
  supportsRepeatedEducation: boolean;
  supportsDynamicQuestions: boolean;
  supportsSubmissionVerification: boolean;
  supportsEvidenceScreenshots: boolean;
  requiresCandidateAccount: boolean;
  supportsAnonymousApplication: boolean;
  supportsPauseAndResume: boolean;
};

export type AtsAdapterMetadata = {
  adapterId: string;
  adapterVersion: string;
  supportedPlatforms: AtsPlatform[];
  lastValidatedAt: string | null;
  implementationStatus: AtsImplementationStatus;
  runtimeType: AtsRuntimeType;
  notes: string[];
};

export type AtsEvidenceItem = {
  kind: AtsEvidenceKind;
  label: string;
  value?: string;
  url?: string;
  screenshotPath?: string;
  capturedAt: string;
  metadata?: JsonRecord;
};

export type EvidenceBundle = {
  items: AtsEvidenceItem[];
  summary: string;
};

export type UserGate = {
  category: UserGateCategory;
  label: string;
  reason: string;
  requiredEvidence?: string[];
  suggestedAction?: string;
  rawSignals?: JsonRecord;
};

export type RetryPolicy = {
  classification: RetryClassification;
  retryable: boolean;
  maxAttempts?: number;
  delayMs?: number;
  reason: string;
};

export type FailureClassification = {
  code: FailureClassificationCode;
  message: string;
  retryPolicy: RetryPolicy;
  terminal: boolean;
  userGate?: UserGate;
  rawSignals?: JsonRecord;
};

export type AdapterPhaseResult<T = JsonRecord> = {
  status: AtsPhaseStatus;
  phase: AtsPhase;
  canonicalState: AtsCanonicalState;
  adapterId: string;
  adapterVersion: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  currentUrl?: string;
  evidence: AtsEvidenceItem[];
  unknowns: string[];
  userGate?: UserGate;
  retryPolicy?: RetryPolicy;
  failure?: FailureClassification;
  rawSignals?: JsonRecord;
  data?: T;
};

export type AtsDetectionInput = {
  sourceUrl?: string;
  platformHint?: string;
  rawJobRecord?: JsonRecord;
  pageSignals?: JsonRecord;
};

export type NormalizedJobUrl = {
  platform: AtsPlatform;
  sourceUrl: string;
  normalizedUrl: string;
  tenant?: string;
  jobId?: string;
  urlKind: 'hosted_application' | 'embedded_application' | 'job_posting' | 'api' | 'unknown';
};

export type NormalizedAtsContext = {
  detectedPlatform: AtsPlatform;
  sourceUrl: string;
  normalizedUrl: string;
  platformHint?: string | null;
  tenant?: string | null;
  jobId?: string | null;
  applicationId?: string | null;
  confidence: number;
  matchedSignals: string[];
  conflictingSignals: string[];
  unknowns: string[];
  detectorVersion: string;
  adapterId: string;
  adapterVersion: string;
  implementationStatus: AtsImplementationStatus;
  supported: boolean;
  routingReason?: string | null;
  originalTask: unknown;
};

export type AtsDetectionResult = {
  platform: AtsPlatform;
  tenant?: string;
  jobId?: string;
  normalized: NormalizedJobUrl;
  confidence: number;
  matchedSignals: string[];
  conflictingSignals: string[];
  unknowns: string[];
  detectorVersion: string;
  detectedAt: string;
  rawSignals?: JsonRecord;
};

export type SubmitControlMetadata = {
  selectorType: 'role' | 'css' | 'text' | 'xpath' | 'unknown';
  selectorValue: string;
  visible: boolean;
  enabled: boolean;
  text?: string;
};

export type ApplicationOpenResult = AdapterPhaseResult<{
  opened: boolean;
  normalizedUrl?: NormalizedJobUrl;
}>;

export type AuthResult = AdapterPhaseResult<{
  authenticated: boolean;
  sessionRequired: boolean;
}>;

export type UploadResult = AdapterPhaseResult<{
  uploaded: boolean;
  fileName?: string;
}>;

export type FormInspectionResult = AdapterPhaseResult<{
  fieldsDetected: number;
  requiredFields: number;
  requestedFields?: JsonRecord[];
}>;

export type FieldMappingResult = AdapterPhaseResult<{
  fieldsMapped: number;
  unresolvedFields: string[];
}>;

export type FillResult = AdapterPhaseResult<{
  fieldsCompleted: number;
  unresolvedFields: string[];
}>;

export type QuestionAnswerResult = AdapterPhaseResult<{
  questionsAnswered: number;
  unresolvedQuestions: string[];
}>;

export type ValidationResult = AdapterPhaseResult<{
  requiredFieldInspectionCompleted: boolean;
  unresolvedRequiredFields: number;
  validationErrors: string[];
}>;

export type SubmitControlResult = AdapterPhaseResult<{
  submitControl?: SubmitControlMetadata;
}>;

export type SubmitClickResult = AdapterPhaseResult<{
  clicked: boolean;
  clickedAt?: string;
  submitControl?: SubmitControlMetadata;
}>;

export type SubmissionVerificationResult = AdapterPhaseResult<{
  confirmed: boolean;
  confirmationText?: string;
  confirmationUrl?: string;
  confirmationNumber?: string;
  employerAcknowledgement?: string;
}>;

export type AtsExecutionContext = {
  applicationId?: string;
  ownerEmail?: string;
  employer?: string;
  position?: string;
  sourceUrl?: string;
  platformHint?: string;
  rawJobRecord?: JsonRecord;
  candidateProfile?: JsonRecord;
  approvedAnswers?: JsonRecord;
  resume?: JsonRecord;
  fixtureName?: string;
  fixturePath?: string;
  mode: AtsExecutionMode;
  dryRun?: boolean;
  page?: unknown;
  runtime?: unknown;
  now?: () => Date;
};

export interface AtsAdapter {
  metadata: AtsAdapterMetadata;
  capabilities: AtsAdapterCapabilities;
  detect(input: AtsDetectionInput): Promise<AtsDetectionResult>;
  normalizeJobUrl(input: AtsDetectionInput): Promise<NormalizedJobUrl>;
  openApplication(context: AtsExecutionContext): Promise<ApplicationOpenResult>;
  authenticate(context: AtsExecutionContext): Promise<AuthResult>;
  uploadResume(context: AtsExecutionContext): Promise<UploadResult>;
  inspectApplication(context: AtsExecutionContext): Promise<FormInspectionResult>;
  mapFields(context: AtsExecutionContext): Promise<FieldMappingResult>;
  fillFields(context: AtsExecutionContext): Promise<FillResult>;
  answerQuestions(context: AtsExecutionContext): Promise<QuestionAnswerResult>;
  validate(context: AtsExecutionContext): Promise<ValidationResult>;
  locateSubmitControl(context: AtsExecutionContext): Promise<SubmitControlResult>;
  clickSubmit(context: AtsExecutionContext): Promise<SubmitClickResult>;
  verifySubmission(context: AtsExecutionContext): Promise<SubmissionVerificationResult>;
  captureEvidence(context: AtsExecutionContext): Promise<AdapterPhaseResult<EvidenceBundle>>;
  classifyFailure(context: AtsExecutionContext, error: unknown): Promise<AdapterPhaseResult<FailureClassification>>;
}

export const UNSUPPORTED_CAPABILITIES: AtsAdapterCapabilities = {
  supportsResumeUpload: false,
  supportsResumeParsing: false,
  supportsSavedProfile: false,
  supportsAccountCreation: false,
  supportsAuthenticatedSessions: false,
  supportsMultiStepApplications: false,
  supportsRepeatedWorkHistory: false,
  supportsRepeatedEducation: false,
  supportsDynamicQuestions: false,
  supportsSubmissionVerification: false,
  supportsEvidenceScreenshots: false,
  requiresCandidateAccount: false,
  supportsAnonymousApplication: false,
  supportsPauseAndResume: false,
};

export function createEvidenceItem(input: Omit<AtsEvidenceItem, 'capturedAt'> & { capturedAt?: string }): AtsEvidenceItem {
  return {
    ...input,
    capturedAt: input.capturedAt || new Date().toISOString(),
  };
}

export function createPhaseResult<T = JsonRecord>(input: {
  phase: AtsPhase;
  status: AtsPhaseStatus;
  canonicalState: AtsCanonicalState;
  metadata: AtsAdapterMetadata;
  startedAt?: string;
  completedAt?: string;
  currentUrl?: string;
  evidence?: AtsEvidenceItem[];
  unknowns?: string[];
  userGate?: UserGate;
  retryPolicy?: RetryPolicy;
  failure?: FailureClassification;
  rawSignals?: JsonRecord;
  data?: T;
}): AdapterPhaseResult<T> {
  const startedAt = input.startedAt || new Date().toISOString();
  const completedAt = input.completedAt || new Date().toISOString();
  return {
    status: input.status,
    phase: input.phase,
    canonicalState: input.canonicalState,
    adapterId: input.metadata.adapterId,
    adapterVersion: input.metadata.adapterVersion,
    startedAt,
    completedAt,
    durationMs: Math.max(0, Date.parse(completedAt) - Date.parse(startedAt)) || 0,
    currentUrl: input.currentUrl,
    evidence: input.evidence || [],
    unknowns: input.unknowns || [],
    userGate: input.userGate,
    retryPolicy: input.retryPolicy,
    failure: input.failure,
    rawSignals: input.rawSignals,
    data: input.data,
  };
}
