import {
  createEvidenceItem,
  createPhaseResult,
  type AdapterPhaseResult,
  type AtsAdapter,
  type AtsAdapterCapabilities,
  type AtsAdapterMetadata,
  type AtsDetectionInput,
  type AtsExecutionContext,
  type AtsPhase,
  type EvidenceBundle,
  type FailureClassification,
  type JsonRecord,
  type NormalizedJobUrl,
} from '../contracts';
import { detectAts } from '../detector';

export const greenhouseAdapterMetadata: AtsAdapterMetadata = {
  adapterId: 'greenhouse',
  adapterVersion: 'career-os-greenhouse-compat-2026-07-24-phase-2',
  supportedPlatforms: ['greenhouse'],
  lastValidatedAt: null,
  implementationStatus: 'compatibility',
  runtimeType: 'compatibility_bridge',
  notes: [
    'Represents the existing Greenhouse browser-companion behavior through the Phase 2 typed contract.',
    'Selectors and submit behavior remain in the legacy runtime path for this phase.',
  ],
};

export const greenhouseCapabilities: AtsAdapterCapabilities = {
  supportsResumeUpload: true,
  supportsResumeParsing: false,
  supportsSavedProfile: false,
  supportsAccountCreation: false,
  supportsAuthenticatedSessions: false,
  supportsMultiStepApplications: false,
  supportsRepeatedWorkHistory: false,
  supportsRepeatedEducation: false,
  supportsDynamicQuestions: true,
  supportsSubmissionVerification: true,
  supportsEvidenceScreenshots: true,
  requiresCandidateAccount: false,
  supportsAnonymousApplication: true,
  supportsPauseAndResume: true,
};

export const greenhouseCompatibilityAdapter: AtsAdapter = {
  metadata: greenhouseAdapterMetadata,
  capabilities: greenhouseCapabilities,
  async detect(input: AtsDetectionInput) {
    return detectAts(input);
  },
  async normalizeJobUrl(input: AtsDetectionInput): Promise<NormalizedJobUrl> {
    return detectAts(input).normalized;
  },
  async openApplication(context: AtsExecutionContext) {
    return compatibilityPhase(context, 'openApplication', 'APPLICATION_OPENED', {
      opened: false,
      compatibilityBehavior: 'delegated_to_legacy_greenhouse_browser_companion',
    });
  },
  async authenticate(context: AtsExecutionContext) {
    return compatibilityPhase(context, 'authenticate', 'APPLICATION_OPENED', {
      authenticated: false,
      sessionRequired: false,
      compatibilityBehavior: 'greenhouse_current_flow_is_anonymous_when_supported',
    });
  },
  async uploadResume(context: AtsExecutionContext) {
    return compatibilityPhase(context, 'uploadResume', 'APPLICATION_OPENED', {
      uploaded: false,
      compatibilityBehavior: 'delegated_to_legacy_greenhouse_resume_upload',
    });
  },
  async inspectApplication(context: AtsExecutionContext) {
    return compatibilityPhase(context, 'inspectApplication', 'FORM_INSPECTED', {
      fieldsDetected: 0,
      requiredFields: 0,
      compatibilityBehavior: 'delegated_to_legacy_greenhouse_field_scan',
    });
  },
  async mapFields(context: AtsExecutionContext) {
    return compatibilityPhase(context, 'mapFields', 'FORM_INSPECTED', {
      fieldsMapped: 0,
      unresolvedFields: [],
      compatibilityBehavior: 'delegated_to_current_question_catalog_and_field_engine',
    });
  },
  async fillFields(context: AtsExecutionContext) {
    return compatibilityPhase(context, 'fillFields', 'FORM_COMPLETED', {
      fieldsCompleted: 0,
      unresolvedFields: [],
      compatibilityBehavior: 'delegated_to_legacy_greenhouse_fill_logic',
    });
  },
  async answerQuestions(context: AtsExecutionContext) {
    return compatibilityPhase(context, 'answerQuestions', 'FORM_COMPLETED', {
      questionsAnswered: 0,
      unresolvedQuestions: [],
      compatibilityBehavior: 'delegated_to_current_greenhouse_question_mappings',
    });
  },
  async validate(context: AtsExecutionContext) {
    return compatibilityPhase(context, 'validate', 'VALIDATION_PASSED', {
      requiredFieldInspectionCompleted: false,
      unresolvedRequiredFields: 0,
      validationErrors: [],
      compatibilityBehavior: 'delegated_to_legacy_greenhouse_required_field_detection',
    });
  },
  async locateSubmitControl(context: AtsExecutionContext) {
    return compatibilityPhase(context, 'locateSubmitControl', 'SUBMIT_CONTROL_RESOLVED', {
      submitControl: undefined,
      compatibilityBehavior: 'delegated_to_legacy_greenhouse_submit_locator',
    });
  },
  async clickSubmit(context: AtsExecutionContext) {
    return compatibilityPhase(context, 'clickSubmit', 'SUBMIT_CONTROL_RESOLVED', {
      clicked: false,
      compatibilityBehavior: 'legacy_path_checks_duplicate_safety_before_clicking',
    });
  },
  async verifySubmission(context: AtsExecutionContext) {
    return compatibilityPhase(context, 'verifySubmission', 'SUBMIT_CLICKED', {
      confirmed: false,
      compatibilityBehavior: 'delegated_to_legacy_greenhouse_confirmation_detection',
    });
  },
  async captureEvidence(context: AtsExecutionContext): Promise<AdapterPhaseResult<EvidenceBundle>> {
    const evidence = compatibilityEvidence(context);
    return createPhaseResult<EvidenceBundle>({
      phase: 'captureEvidence',
      status: 'skipped',
      canonicalState: 'APPLICATION_OPENED',
      metadata: greenhouseAdapterMetadata,
      currentUrl: context.sourceUrl,
      evidence,
      unknowns: ['runtime_evidence_is_emitted_by_legacy_browser_worker'],
      data: {
        items: evidence,
        summary: 'Greenhouse evidence remains emitted by the current browser-worker report path.',
      },
    });
  },
  async classifyFailure(context: AtsExecutionContext, error: unknown): Promise<AdapterPhaseResult<FailureClassification>> {
    const message = error instanceof Error ? error.message : String(error || 'Unknown Greenhouse compatibility failure.');
    const failure: FailureClassification = {
      code: 'runtime_error',
      message,
      retryPolicy: {
        classification: 'manual_resume_required',
        retryable: false,
        reason: 'Legacy Greenhouse runtime classification remains authoritative in Phase 2.',
      },
      terminal: false,
    };
    return createPhaseResult<FailureClassification>({
      phase: 'classifyFailure',
      status: 'skipped',
      canonicalState: 'RETRYABLE_FAILURE',
      metadata: greenhouseAdapterMetadata,
      currentUrl: context.sourceUrl,
      evidence: compatibilityEvidence(context),
      unknowns: [],
      failure,
      data: failure,
    });
  },
};

function compatibilityPhase<T extends JsonRecord>(
  context: AtsExecutionContext,
  phase: AtsPhase,
  canonicalState: AdapterPhaseResult<T>['canonicalState'],
  data: T,
): AdapterPhaseResult<T> {
  return createPhaseResult<T>({
    phase,
    status: 'skipped',
    canonicalState,
    metadata: greenhouseAdapterMetadata,
    currentUrl: context.sourceUrl,
    evidence: compatibilityEvidence(context),
    unknowns: ['phase_implemented_by_legacy_browser_companion'],
    data,
  });
}

function compatibilityEvidence(context: AtsExecutionContext) {
  return [
    createEvidenceItem({
      kind: 'detector_signal',
      label: 'Greenhouse compatibility adapter selected',
      value: context.sourceUrl || context.platformHint || 'greenhouse',
      url: context.sourceUrl,
      metadata: {
        compatibilityBridge: true,
      },
    }),
  ];
}
