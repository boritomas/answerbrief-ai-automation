import {
  UNSUPPORTED_CAPABILITIES,
  createEvidenceItem,
  createPhaseResult,
  type AdapterPhaseResult,
  type AtsAdapter,
  type AtsAdapterMetadata,
  type AtsDetectionInput,
  type AtsExecutionContext,
  type EvidenceBundle,
  type FailureClassification,
  type JsonRecord,
  type NormalizedJobUrl,
} from '../contracts';
import { detectAts } from '../detector';

export const unsupportedAdapterMetadata: AtsAdapterMetadata = {
  adapterId: 'unsupported',
  adapterVersion: 'career-os-unsupported-2026-07-24-phase-2',
  supportedPlatforms: ['unsupported', 'unknown'],
  lastValidatedAt: null,
  implementationStatus: 'unsupported',
  runtimeType: 'unsupported',
  notes: [
    'Safe fallback for unknown or unsupported ATS platforms.',
    'Never attempts browser submission or generic form automation.',
  ],
};

export const unsupportedAtsAdapter: AtsAdapter = {
  metadata: unsupportedAdapterMetadata,
  capabilities: UNSUPPORTED_CAPABILITIES,
  async detect(input: AtsDetectionInput) {
    return detectAts(input);
  },
  async normalizeJobUrl(input: AtsDetectionInput): Promise<NormalizedJobUrl> {
    return detectAts(input).normalized;
  },
  async openApplication(context: AtsExecutionContext) {
    return unsupportedPhase(context, 'openApplication', {
      opened: false,
      reason: 'No supported ATS adapter is available for this platform.',
    });
  },
  async authenticate(context: AtsExecutionContext) {
    return unsupportedPhase(context, 'authenticate', {
      authenticated: false,
      sessionRequired: false,
      reason: 'Authentication is not attempted for unsupported ATS platforms.',
    });
  },
  async uploadResume(context: AtsExecutionContext) {
    return unsupportedPhase(context, 'uploadResume', {
      uploaded: false,
      reason: 'Resume upload is not attempted for unsupported ATS platforms.',
    });
  },
  async inspectApplication(context: AtsExecutionContext) {
    return unsupportedPhase(context, 'inspectApplication', {
      fieldsDetected: 0,
      requiredFields: 0,
      reason: 'Application inspection is not attempted for unsupported ATS platforms.',
    });
  },
  async mapFields(context: AtsExecutionContext) {
    return unsupportedPhase(context, 'mapFields', {
      fieldsMapped: 0,
      unresolvedFields: [],
      reason: 'Field mapping is not attempted for unsupported ATS platforms.',
    });
  },
  async fillFields(context: AtsExecutionContext) {
    return unsupportedPhase(context, 'fillFields', {
      fieldsCompleted: 0,
      unresolvedFields: [],
      reason: 'Field filling is not attempted for unsupported ATS platforms.',
    });
  },
  async answerQuestions(context: AtsExecutionContext) {
    return unsupportedPhase(context, 'answerQuestions', {
      questionsAnswered: 0,
      unresolvedQuestions: [],
      reason: 'Question answering is not attempted for unsupported ATS platforms.',
    });
  },
  async validate(context: AtsExecutionContext) {
    return unsupportedPhase(context, 'validate', {
      requiredFieldInspectionCompleted: false,
      unresolvedRequiredFields: 0,
      validationErrors: ['unsupported_ats'],
      reason: 'Validation cannot proceed without a supported ATS adapter.',
    });
  },
  async locateSubmitControl(context: AtsExecutionContext) {
    return unsupportedPhase(context, 'locateSubmitControl', {
      submitControl: undefined,
      reason: 'Submit controls are never located generically for unsupported ATS platforms.',
    });
  },
  async clickSubmit(context: AtsExecutionContext) {
    return unsupportedPhase(context, 'clickSubmit', {
      clicked: false,
      reason: 'Submission is blocked for unsupported ATS platforms.',
    });
  },
  async verifySubmission(context: AtsExecutionContext) {
    return unsupportedPhase(context, 'verifySubmission', {
      confirmed: false,
      reason: 'Submission cannot be verified because submission is never attempted.',
    });
  },
  async captureEvidence(context: AtsExecutionContext): Promise<AdapterPhaseResult<EvidenceBundle>> {
    const evidence = unsupportedEvidence(context);
    return createPhaseResult<EvidenceBundle>({
      phase: 'captureEvidence',
      status: 'unsupported',
      canonicalState: 'TERMINAL_FAILURE',
      metadata: unsupportedAdapterMetadata,
      currentUrl: context.sourceUrl,
      evidence,
      unknowns: [],
      failure: unsupportedFailure(context),
      data: {
        items: evidence,
        summary: 'Unsupported ATS was classified safely; no application action was attempted.',
      },
    });
  },
  async classifyFailure(context: AtsExecutionContext, error: unknown): Promise<AdapterPhaseResult<FailureClassification>> {
    return createPhaseResult<FailureClassification>({
      phase: 'classifyFailure',
      status: 'unsupported',
      canonicalState: 'TERMINAL_FAILURE',
      metadata: unsupportedAdapterMetadata,
      currentUrl: context.sourceUrl,
      evidence: unsupportedEvidence(context),
      unknowns: [],
      failure: unsupportedFailure(context, error),
      data: unsupportedFailure(context, error),
    });
  },
};

function unsupportedPhase<T extends JsonRecord>(context: AtsExecutionContext, phase: AdapterPhaseResult<T>['phase'], data: T): AdapterPhaseResult<T> {
  return createPhaseResult<T>({
    phase,
    status: 'unsupported',
    canonicalState: 'TERMINAL_FAILURE',
    metadata: unsupportedAdapterMetadata,
    currentUrl: context.sourceUrl,
    evidence: unsupportedEvidence(context),
    unknowns: [],
    failure: unsupportedFailure(context),
    data,
  });
}

function unsupportedEvidence(context: AtsExecutionContext) {
  return [
    createEvidenceItem({
      kind: 'unsupported',
      label: 'Unsupported ATS route',
      value: context.sourceUrl || context.platformHint || 'unknown',
      url: context.sourceUrl,
      metadata: {
        platformHint: context.platformHint,
      },
    }),
  ];
}

function unsupportedFailure(context: AtsExecutionContext, error?: unknown): FailureClassification {
  const message = error instanceof Error
    ? error.message
    : 'Career OS does not have a supported ATS adapter for this platform.';
  return {
    code: 'unsupported_ats',
    message,
    retryPolicy: {
      classification: 'unsupported',
      retryable: false,
      reason: 'Unsupported ATS platforms require explicit product support before automation can run.',
    },
    terminal: true,
    rawSignals: {
      platformHint: context.platformHint,
      sourceUrl: context.sourceUrl,
    },
  };
}
