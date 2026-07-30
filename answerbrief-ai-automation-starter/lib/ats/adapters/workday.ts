import {
  createEvidenceItem,
  createPhaseResult,
  type AdapterPhaseResult,
  type AtsAdapter,
  type AtsAdapterCapabilities,
  type AtsAdapterMetadata,
  type AtsCanonicalState,
  type AtsDetectionInput,
  type AtsExecutionContext,
  type AtsPhase,
  type AtsPhaseStatus,
  type EvidenceBundle,
  type FailureClassification,
  type JsonRecord,
  type NormalizedJobUrl,
  type UserGate,
} from '../contracts';
import { detectAts } from '../detector';
import {
  classifyWorkdayFixtureFailure,
  createWorkdayEvidenceBundle,
  createWorkdayFixtureEvidence,
  inspectWorkdayFixture,
  isWorkdayFixtureInspectionContext,
  mapWorkdayFixtureFields,
  type WorkdayFailureCode,
  type WorkdayFieldMappingSummary,
  type WorkdayInspectionSnapshot,
} from '../workday-fixture-inspector';

export const workdayAdapterMetadata: AtsAdapterMetadata = {
  adapterId: 'workday',
  adapterVersion: 'career-os-workday-compat-2026-07-24-phase-3-fixture-poc',
  supportedPlatforms: ['workday'],
  lastValidatedAt: null,
  implementationStatus: 'experimental',
  runtimeType: 'compatibility_bridge',
  notes: [
    'Represents the existing partial Workday browser-companion behavior through the typed contract.',
    'Phase 3 adds fixture-only native inspection phases for Workday POC coverage.',
    'No live Workday navigation, account creation, authentication, resume upload, or submit click is added by this adapter.',
  ],
};

export const workdayCapabilities: AtsAdapterCapabilities = {
  supportsResumeUpload: true,
  supportsResumeParsing: false,
  supportsSavedProfile: false,
  supportsAccountCreation: false,
  supportsAuthenticatedSessions: true,
  supportsMultiStepApplications: true,
  supportsRepeatedWorkHistory: false,
  supportsRepeatedEducation: false,
  supportsDynamicQuestions: true,
  supportsSubmissionVerification: true,
  supportsEvidenceScreenshots: true,
  requiresCandidateAccount: true,
  supportsAnonymousApplication: false,
  supportsPauseAndResume: true,
};

export const workdayCompatibilityAdapter: AtsAdapter = {
  metadata: workdayAdapterMetadata,
  capabilities: workdayCapabilities,
  async detect(input: AtsDetectionInput) {
    return detectAts(input);
  },
  async normalizeJobUrl(input: AtsDetectionInput): Promise<NormalizedJobUrl> {
    return detectAts(input).normalized;
  },
  async openApplication(context: AtsExecutionContext) {
    if (!usesNativeFixturePhase(context)) {
      return compatibilityPhase(context, 'openApplication', 'APPLICATION_OPENED', {
        opened: false,
        compatibilityBehavior: 'delegated_to_legacy_workday_browser_companion',
      });
    }

    try {
      const snapshot = inspectWorkdayFixture(context);
      if (snapshot.failureCode === 'UNSUPPORTED_WORKDAY_STATE') {
        return snapshotFailureResult(context, 'openApplication', snapshot, 'UNSUPPORTED_WORKDAY_STATE');
      }
      return createPhaseResult({
        phase: 'openApplication',
        status: 'succeeded',
        canonicalState: 'APPLICATION_OPENED',
        metadata: workdayAdapterMetadata,
        currentUrl: snapshot.normalizedUrl,
        evidence: createWorkdayFixtureEvidence(snapshot, 'openApplication'),
        unknowns: snapshot.unknowns,
        rawSignals: fixtureRawSignals(snapshot),
        data: {
          opened: true,
          normalizedUrl: normalizedUrlFromSnapshot(snapshot),
          fixture: fixtureIdentity(snapshot),
          pageState: snapshot.pageState,
          noLiveNavigation: true,
        },
      });
    } catch (error) {
      return fixtureErrorResult(context, 'openApplication', error);
    }
  },
  async authenticate(context: AtsExecutionContext) {
    if (!usesNativeFixturePhase(context)) {
      return compatibilityPhase(context, 'authenticate', 'SESSION_REQUIRED', {
        authenticated: false,
        sessionRequired: true,
        compatibilityBehavior: 'delegated_to_existing_workday_account_gate_detection',
      });
    }

    try {
      const snapshot = inspectWorkdayFixture(context);
      const gate = firstGate(snapshot.userGates);
      if (gate) {
        const code: WorkdayFailureCode = gate.category === 'ACCOUNT_CREATION_REQUIRED'
          ? 'ACCOUNT_GATE'
          : 'AUTHENTICATION_REQUIRED';
        return snapshotFailureResult(context, 'authenticate', snapshot, code, gate.reason, {
          authenticated: false,
          sessionRequired: true,
          userGates: snapshot.userGates,
          noCredentialEntry: true,
        }, gate);
      }
      return createPhaseResult({
        phase: 'authenticate',
        status: 'succeeded',
        canonicalState: 'APPLICATION_OPENED',
        metadata: workdayAdapterMetadata,
        currentUrl: snapshot.normalizedUrl,
        evidence: createWorkdayFixtureEvidence(snapshot, 'authenticate'),
        unknowns: snapshot.unknowns,
        rawSignals: fixtureRawSignals(snapshot),
        data: {
          authenticated: false,
          sessionRequired: false,
          fixtureOnlyInspection: true,
          noCredentialEntry: true,
        },
      });
    } catch (error) {
      return fixtureErrorResult(context, 'authenticate', error);
    }
  },
  async uploadResume(context: AtsExecutionContext) {
    if (!usesNativeFixturePhase(context)) {
      return compatibilityPhase(context, 'uploadResume', 'APPLICATION_OPENED', {
        uploaded: false,
        compatibilityBehavior: 'delegated_to_existing_workday_resume_upload',
      });
    }

    try {
      const snapshot = inspectWorkdayFixture(context);
      if (!snapshot.resumeUploadControl) {
        return snapshotFailureResult(context, 'uploadResume', snapshot, 'RESUME_CONTROL_NOT_FOUND', undefined, {
          uploaded: false,
          noRealResumeUpload: true,
        });
      }
      return createPhaseResult({
        phase: 'uploadResume',
        status: 'succeeded',
        canonicalState: 'APPLICATION_OPENED',
        metadata: workdayAdapterMetadata,
        currentUrl: snapshot.normalizedUrl,
        evidence: createWorkdayFixtureEvidence(snapshot, 'uploadResume'),
        unknowns: snapshot.unknowns,
        rawSignals: fixtureRawSignals(snapshot),
        data: {
          uploaded: false,
          fileName: clean(asRecord(context.resume).fileName),
          resumeUploadControl: snapshot.resumeUploadControl,
          noRealResumeUpload: true,
          uploadPermitted: false,
        },
      });
    } catch (error) {
      return fixtureErrorResult(context, 'uploadResume', error);
    }
  },
  async inspectApplication(context: AtsExecutionContext) {
    if (!usesNativeFixturePhase(context)) {
      return compatibilityPhase(context, 'inspectApplication', 'FORM_INSPECTED', {
        fieldsDetected: 0,
        requiredFields: 0,
        compatibilityBehavior: 'delegated_to_existing_workday_visible_field_scan',
      });
    }

    try {
      const snapshot = inspectWorkdayFixture(context);
      if (snapshot.failureCode === 'UNSUPPORTED_WORKDAY_STATE') {
        return snapshotFailureResult(context, 'inspectApplication', snapshot, 'UNSUPPORTED_WORKDAY_STATE');
      }
      return createPhaseResult({
        phase: 'inspectApplication',
        status: 'succeeded',
        canonicalState: 'FORM_INSPECTED',
        metadata: workdayAdapterMetadata,
        currentUrl: snapshot.normalizedUrl,
        evidence: createWorkdayFixtureEvidence(snapshot, 'inspectApplication'),
        unknowns: snapshot.unknowns,
        rawSignals: fixtureRawSignals(snapshot),
        data: {
          fieldsDetected: snapshot.fields.length,
          requiredFields: snapshot.validation.requiredFields.length,
          requestedFields: snapshot.fields as unknown as JsonRecord[],
          pageState: snapshot.pageState,
          validation: snapshot.validation,
          noProductionAction: true,
        },
      });
    } catch (error) {
      return fixtureErrorResult(context, 'inspectApplication', error);
    }
  },
  async mapFields(context: AtsExecutionContext) {
    if (!usesNativeFixturePhase(context)) {
      return compatibilityPhase(context, 'mapFields', 'FORM_INSPECTED', {
        fieldsMapped: 0,
        unresolvedFields: [],
        compatibilityBehavior: 'delegated_to_current_workday_question_mappings',
      });
    }

    try {
      const snapshot = inspectWorkdayFixture(context);
      const mapping = mapWorkdayFixtureFields(snapshot, asRecord(context.candidateProfile));
      if (mapping.failureCode) {
        return mappingGateResult(context, 'mapFields', snapshot, mapping, {
          fieldsMapped: mapping.fieldsMapped,
          unresolvedFields: mapping.unresolvedFields,
          mappings: mapping.mappings as unknown as JsonRecord[],
          userGates: mapping.userGates,
          noAutofillPerformed: true,
        });
      }
      return createPhaseResult({
        phase: 'mapFields',
        status: 'succeeded',
        canonicalState: 'FORM_INSPECTED',
        metadata: workdayAdapterMetadata,
        currentUrl: snapshot.normalizedUrl,
        evidence: createWorkdayFixtureEvidence(snapshot, 'mapFields', { mapping }),
        unknowns: snapshot.unknowns,
        rawSignals: fixtureRawSignals(snapshot, mapping),
        data: {
          fieldsMapped: mapping.fieldsMapped,
          unresolvedFields: mapping.unresolvedFields,
          mappings: mapping.mappings as unknown as JsonRecord[],
          userGates: mapping.userGates,
          noAutofillPerformed: true,
        },
      });
    } catch (error) {
      return fixtureErrorResult(context, 'mapFields', error);
    }
  },
  async fillFields(context: AtsExecutionContext) {
    if (!usesNativeFixturePhase(context)) {
      return compatibilityPhase(context, 'fillFields', 'FORM_COMPLETED', {
        fieldsCompleted: 0,
        unresolvedFields: [],
        compatibilityBehavior: 'delegated_to_existing_workday_fill_logic',
      });
    }

    try {
      const snapshot = inspectWorkdayFixture(context);
      const mapping = mapWorkdayFixtureFields(snapshot, asRecord(context.candidateProfile));
      if (mapping.failureCode) {
        return mappingGateResult(context, 'fillFields', snapshot, mapping, {
          fieldsCompleted: 0,
          unresolvedFields: mapping.unresolvedFields,
          mappings: mapping.mappings as unknown as JsonRecord[],
          userGates: mapping.userGates,
          noAutofillPerformed: true,
        });
      }
      return createPhaseResult({
        phase: 'fillFields',
        status: 'skipped',
        canonicalState: 'FORM_INSPECTED',
        metadata: workdayAdapterMetadata,
        currentUrl: snapshot.normalizedUrl,
        evidence: createWorkdayFixtureEvidence(snapshot, 'fillFields', { mapping }),
        unknowns: snapshot.unknowns,
        rawSignals: fixtureRawSignals(snapshot, mapping),
        data: {
          fieldsCompleted: 0,
          unresolvedFields: [],
          eligibleFields: mapping.fieldsMapped,
          noAutofillPerformed: true,
          fixtureOnlyInspection: true,
        },
      });
    } catch (error) {
      return fixtureErrorResult(context, 'fillFields', error);
    }
  },
  async answerQuestions(context: AtsExecutionContext) {
    if (!usesNativeFixturePhase(context)) {
      return compatibilityPhase(context, 'answerQuestions', 'FORM_COMPLETED', {
        questionsAnswered: 0,
        unresolvedQuestions: [],
        compatibilityBehavior: 'delegated_to_current_workday_question_mappings',
      });
    }

    try {
      const snapshot = inspectWorkdayFixture(context);
      const mapping = mapWorkdayFixtureFields(snapshot, asRecord(context.candidateProfile));
      const questionMappings = mapping.mappings.filter((entry) => {
        const section = clean(entry.requestedField.surroundingContext).toLowerCase();
        return section.includes('question') || section.includes('disclosure');
      });
      const unresolvedQuestions = questionMappings
        .filter((entry) => entry.requestedField.required && !entry.canAutofill)
        .map((entry) => entry.requestedField.visibleLabel);
      return createPhaseResult({
        phase: 'answerQuestions',
        status: unresolvedQuestions.length ? 'paused' : 'skipped',
        canonicalState: unresolvedQuestions.length ? 'WAITING_ON_USER' : 'FORM_INSPECTED',
        metadata: workdayAdapterMetadata,
        currentUrl: snapshot.normalizedUrl,
        evidence: createWorkdayFixtureEvidence(snapshot, 'answerQuestions', { mapping }),
        unknowns: snapshot.unknowns,
        userGate: firstGate(mapping.userGates),
        rawSignals: fixtureRawSignals(snapshot, mapping),
        data: {
          questionsAnswered: 0,
          unresolvedQuestions,
          userGates: mapping.userGates,
          noAutofillPerformed: true,
          fixtureOnlyInspection: true,
        },
      });
    } catch (error) {
      return fixtureErrorResult(context, 'answerQuestions', error);
    }
  },
  async validate(context: AtsExecutionContext) {
    if (!usesNativeFixturePhase(context)) {
      return compatibilityPhase(context, 'validate', 'VALIDATION_PASSED', {
        requiredFieldInspectionCompleted: false,
        unresolvedRequiredFields: 0,
        validationErrors: [],
        compatibilityBehavior: 'delegated_to_existing_workday_missing_required_field_detection',
      });
    }

    try {
      const snapshot = inspectWorkdayFixture(context);
      const mapping = mapWorkdayFixtureFields(snapshot, asRecord(context.candidateProfile));
      const validationErrors = snapshot.validation.validationMessages;
      if (validationErrors.length) {
        return snapshotFailureResult(context, 'validate', snapshot, 'VALIDATION_ERROR', validationErrors.join('; '), {
          requiredFieldInspectionCompleted: true,
          unresolvedRequiredFields: mapping.unresolvedFields.length,
          validationErrors,
          userGates: mapping.userGates,
        });
      }
      if (mapping.failureCode) {
        return mappingGateResult(context, 'validate', snapshot, mapping, {
          requiredFieldInspectionCompleted: true,
          unresolvedRequiredFields: mapping.unresolvedFields.length,
          validationErrors,
          userGates: mapping.userGates,
        });
      }
      return createPhaseResult({
        phase: 'validate',
        status: 'succeeded',
        canonicalState: 'VALIDATION_PASSED',
        metadata: workdayAdapterMetadata,
        currentUrl: snapshot.normalizedUrl,
        evidence: createWorkdayFixtureEvidence(snapshot, 'validate', { mapping }).concat(createEvidenceItem({
          kind: 'validation',
          label: 'Workday fixture validation clear',
          value: 'required fields resolved in fixture mapping',
          url: snapshot.normalizedUrl,
          metadata: {
            fixtureName: snapshot.fixture.name,
            requiredFieldInspectionCompleted: true,
            unresolvedRequiredFields: 0,
            noProductionAction: true,
          },
        })),
        unknowns: snapshot.unknowns,
        rawSignals: fixtureRawSignals(snapshot, mapping),
        data: {
          requiredFieldInspectionCompleted: true,
          unresolvedRequiredFields: 0,
          validationErrors: [],
          userGates: [],
          noProductionAction: true,
        },
      });
    } catch (error) {
      return fixtureErrorResult(context, 'validate', error);
    }
  },
  async locateSubmitControl(context: AtsExecutionContext) {
    if (!usesNativeFixturePhase(context)) {
      return compatibilityPhase(context, 'locateSubmitControl', 'SUBMIT_CONTROL_RESOLVED', {
        submitControl: undefined,
        compatibilityBehavior: 'delegated_to_existing_workday_submit_review_next_controls',
      });
    }

    try {
      const snapshot = inspectWorkdayFixture(context);
      if (!snapshot.submitControl) {
        return snapshotFailureResult(context, 'locateSubmitControl', snapshot, 'SUBMIT_CONTROL_NOT_FOUND');
      }
      return createPhaseResult({
        phase: 'locateSubmitControl',
        status: 'succeeded',
        canonicalState: 'SUBMIT_CONTROL_RESOLVED',
        metadata: workdayAdapterMetadata,
        currentUrl: snapshot.normalizedUrl,
        evidence: createWorkdayFixtureEvidence(snapshot, 'locateSubmitControl'),
        unknowns: snapshot.unknowns,
        rawSignals: fixtureRawSignals(snapshot),
        data: {
          submitControl: snapshot.submitControl,
          noSubmitClick: true,
          submissionReady: false,
          fixtureOnlyInspection: true,
        },
      });
    } catch (error) {
      return fixtureErrorResult(context, 'locateSubmitControl', error);
    }
  },
  async clickSubmit(context: AtsExecutionContext) {
    if (!usesNativeFixturePhase(context)) {
      return compatibilityPhase(context, 'clickSubmit', 'SUBMIT_CONTROL_RESOLVED', {
        clicked: false,
        compatibilityBehavior: 'legacy_path_checks_duplicate_safety_before_workday_submit_click',
      });
    }

    try {
      const snapshot = inspectWorkdayFixture(context);
      return createPhaseResult({
        phase: 'clickSubmit',
        status: 'skipped',
        canonicalState: 'SUBMIT_CONTROL_RESOLVED',
        metadata: workdayAdapterMetadata,
        currentUrl: snapshot.normalizedUrl,
        evidence: createWorkdayFixtureEvidence(snapshot, 'clickSubmit'),
        unknowns: snapshot.unknowns,
        rawSignals: {
          ...fixtureRawSignals(snapshot),
          submitClickAttempted: false,
          workdayFailureCode: undefined,
        },
        data: {
          clicked: false,
          submitControl: snapshot.submitControl,
          submitClickAttempted: false,
          noSubmitClick: true,
          fixtureOnlyInspection: true,
        },
      });
    } catch (error) {
      return fixtureErrorResult(context, 'clickSubmit', error);
    }
  },
  async verifySubmission(context: AtsExecutionContext) {
    if (!usesNativeFixturePhase(context)) {
      return compatibilityPhase(context, 'verifySubmission', 'SUBMIT_CLICKED', {
        confirmed: false,
        compatibilityBehavior: 'delegated_to_existing_confirmation_detection_without_expansion',
      });
    }

    try {
      const snapshot = inspectWorkdayFixture(context);
      return createPhaseResult({
        phase: 'verifySubmission',
        status: 'skipped',
        canonicalState: 'SUBMIT_CONTROL_RESOLVED',
        metadata: workdayAdapterMetadata,
        currentUrl: snapshot.normalizedUrl,
        evidence: createWorkdayFixtureEvidence(snapshot, 'verifySubmission'),
        unknowns: snapshot.unknowns,
        rawSignals: fixtureRawSignals(snapshot),
        data: {
          confirmed: false,
          confirmationClassifiedOnly: snapshot.pageState === 'CONFIRMATION',
          fixturePageState: snapshot.pageState,
          noSubmissionProof: true,
          noSubmitClick: true,
        },
      });
    } catch (error) {
      return fixtureErrorResult(context, 'verifySubmission', error);
    }
  },
  async captureEvidence(context: AtsExecutionContext): Promise<AdapterPhaseResult<EvidenceBundle>> {
    if (!usesNativeFixturePhase(context)) {
      const evidence = compatibilityEvidence(context);
      return createPhaseResult<EvidenceBundle>({
        phase: 'captureEvidence',
        status: 'skipped',
        canonicalState: 'APPLICATION_OPENED',
        metadata: workdayAdapterMetadata,
        currentUrl: context.sourceUrl,
        evidence,
        unknowns: ['runtime_evidence_is_emitted_by_legacy_browser_worker'],
        data: {
          items: evidence,
          summary: 'Workday evidence remains emitted by the current browser-worker report path.',
        },
      });
    }

    try {
      const snapshot = inspectWorkdayFixture(context);
      const bundle = createWorkdayEvidenceBundle(snapshot, 'captureEvidence');
      return createPhaseResult<EvidenceBundle>({
        phase: 'captureEvidence',
        status: 'succeeded',
        canonicalState: 'FORM_INSPECTED',
        metadata: workdayAdapterMetadata,
        currentUrl: snapshot.normalizedUrl,
        evidence: bundle.items,
        unknowns: snapshot.unknowns,
        rawSignals: fixtureRawSignals(snapshot),
        data: bundle,
      });
    } catch (error) {
      return fixtureErrorResult<EvidenceBundle>(context, 'captureEvidence', error, {
        items: [],
        summary: 'Workday fixture evidence capture failed before a snapshot could be inspected.',
      });
    }
  },
  async classifyFailure(context: AtsExecutionContext, error: unknown): Promise<AdapterPhaseResult<FailureClassification>> {
    if (usesNativeFixturePhase(context)) {
      const failure = classifyWorkdayFixtureFailure(error);
      return createPhaseResult<FailureClassification>({
        phase: 'classifyFailure',
        status: failure.userGate ? 'paused' : 'failed',
        canonicalState: failure.userGate ? 'WAITING_ON_USER' : failure.terminal ? 'TERMINAL_FAILURE' : 'RETRYABLE_FAILURE',
        metadata: workdayAdapterMetadata,
        currentUrl: context.sourceUrl,
        evidence: fixtureFailureEvidence(context, 'classifyFailure', failure),
        unknowns: [],
        userGate: failure.userGate,
        retryPolicy: failure.retryPolicy,
        failure,
        rawSignals: failure.rawSignals,
        data: failure,
      });
    }

    const message = error instanceof Error ? error.message : String(error || 'Unknown Workday compatibility failure.');
    const failure: FailureClassification = {
      code: /account|sign in|login/i.test(message) ? 'authentication_gate' : 'runtime_error',
      message,
      retryPolicy: {
        classification: 'manual_resume_required',
        retryable: false,
        reason: 'Legacy Workday runtime classification remains authoritative outside fixture inspection.',
      },
      terminal: false,
    };
    return createPhaseResult<FailureClassification>({
      phase: 'classifyFailure',
      status: 'skipped',
      canonicalState: 'RETRYABLE_FAILURE',
      metadata: workdayAdapterMetadata,
      currentUrl: context.sourceUrl,
      evidence: compatibilityEvidence(context),
      unknowns: [],
      failure,
      data: failure,
    });
  },
};

function usesNativeFixturePhase(context: AtsExecutionContext) {
  return isWorkdayFixtureInspectionContext(context) || context.mode === 'live';
}

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
    metadata: workdayAdapterMetadata,
    currentUrl: context.sourceUrl,
    evidence: compatibilityEvidence(context),
    unknowns: ['phase_implemented_by_legacy_browser_companion'],
    data,
  });
}

function snapshotFailureResult<T extends JsonRecord>(
  context: AtsExecutionContext,
  phase: AtsPhase,
  snapshot: WorkdayInspectionSnapshot,
  code: WorkdayFailureCode,
  message?: string,
  data?: T,
  userGate?: UserGate,
): AdapterPhaseResult<T> {
  const failure = classifyWorkdayFixtureFailure(code, message, userGate, fixtureRawSignals(snapshot));
  return createPhaseResult<T>({
    phase,
    status: statusForFailure(failure),
    canonicalState: stateForFailure(failure),
    metadata: workdayAdapterMetadata,
    currentUrl: snapshot.normalizedUrl,
    evidence: createWorkdayFixtureEvidence(snapshot, phase, {
      failureCode: code,
      userGates: userGate ? [userGate] : undefined,
      validationMessages: code === 'VALIDATION_ERROR' ? snapshot.validation.validationMessages : undefined,
    }),
    unknowns: snapshot.unknowns,
    userGate: failure.userGate,
    retryPolicy: failure.retryPolicy,
    failure,
    rawSignals: failure.rawSignals,
    data: (data || {}) as T,
  });
}

function mappingGateResult<T extends JsonRecord>(
  context: AtsExecutionContext,
  phase: AtsPhase,
  snapshot: WorkdayInspectionSnapshot,
  mapping: WorkdayFieldMappingSummary,
  data: T,
): AdapterPhaseResult<T> {
  const code = mapping.failureCode || 'REQUIRED_FIELDS_UNRESOLVED';
  const gate = firstGate(mapping.userGates);
  const failure = classifyWorkdayFixtureFailure(code, undefined, gate, fixtureRawSignals(snapshot, mapping));
  return createPhaseResult<T>({
    phase,
    status: statusForFailure(failure),
    canonicalState: stateForFailure(failure),
    metadata: workdayAdapterMetadata,
    currentUrl: snapshot.normalizedUrl,
    evidence: createWorkdayFixtureEvidence(snapshot, phase, { mapping }),
    unknowns: snapshot.unknowns,
    userGate: failure.userGate,
    retryPolicy: failure.retryPolicy,
    failure,
    rawSignals: failure.rawSignals,
    data,
  });
}

function fixtureErrorResult<T>(
  context: AtsExecutionContext,
  phase: AtsPhase,
  error: unknown,
  data?: T,
): AdapterPhaseResult<T> {
  const failure = classifyWorkdayFixtureFailure(error);
  return createPhaseResult<T>({
    phase,
    status: statusForFailure(failure),
    canonicalState: stateForFailure(failure),
    metadata: workdayAdapterMetadata,
    currentUrl: context.sourceUrl,
    evidence: fixtureFailureEvidence(context, phase, failure),
    unknowns: [],
    userGate: failure.userGate,
    retryPolicy: failure.retryPolicy,
    failure,
    rawSignals: failure.rawSignals,
    data,
  });
}

function statusForFailure(failure: FailureClassification): AtsPhaseStatus {
  if (failure.userGate) return 'paused';
  return 'failed';
}

function stateForFailure(failure: FailureClassification): AtsCanonicalState {
  if (failure.userGate) return 'WAITING_ON_USER';
  return failure.terminal ? 'TERMINAL_FAILURE' : 'RETRYABLE_FAILURE';
}

function firstGate(gates: UserGate[]) {
  return gates.length ? gates[0] : undefined;
}

function normalizedUrlFromSnapshot(snapshot: WorkdayInspectionSnapshot): NormalizedJobUrl {
  return {
    platform: 'workday',
    sourceUrl: snapshot.fixture.fixtureUrl,
    normalizedUrl: snapshot.normalizedUrl,
    tenant: snapshot.tenant,
    jobId: snapshot.jobId,
    urlKind: snapshot.normalizedUrl.includes('/job/') ? 'job_posting' : 'hosted_application',
  };
}

function fixtureIdentity(snapshot: WorkdayInspectionSnapshot): JsonRecord {
  return {
    fixtureName: snapshot.fixture.name,
    fixturePath: snapshot.fixture.absolutePath,
    fixtureMetadataPath: snapshot.fixture.metadataPath,
    scenario: snapshot.fixture.scenario,
    fixtureUrl: snapshot.fixture.fixtureUrl,
  };
}

function fixtureRawSignals(
  snapshot: WorkdayInspectionSnapshot,
  mapping?: WorkdayFieldMappingSummary,
): JsonRecord {
  return {
    fixtureName: snapshot.fixture.name,
    fixturePath: snapshot.fixture.absolutePath,
    scenario: snapshot.fixture.scenario,
    pageState: snapshot.pageState,
    mode: snapshot.mode,
    matchedSignals: snapshot.matchedSignals,
    conflictingSignals: snapshot.conflictingSignals,
    workdayFailureCode: mapping?.failureCode || snapshot.failureCode,
    requiredFields: snapshot.validation.requiredFields,
    unresolvedFields: mapping?.unresolvedFields || snapshot.validation.unresolvedRequiredFields,
    userGates: (mapping?.userGates || snapshot.userGates).map((gate) => gate.category),
    noLiveNavigation: true,
    noSubmitClick: true,
    noProductionAction: true,
  };
}

function fixtureFailureEvidence(
  context: AtsExecutionContext,
  phase: AtsPhase,
  failure: FailureClassification,
) {
  return [
    createEvidenceItem({
      kind: 'failure',
      label: 'Workday fixture phase blocked',
      value: clean(asRecord(failure.rawSignals).workdayFailureCode || failure.code),
      url: context.sourceUrl,
      metadata: {
        adapter: 'workday',
        phase,
        mode: context.mode,
        sourceUrl: context.sourceUrl,
        fixtureName: context.fixtureName,
        fixturePath: context.fixturePath,
        failure,
        noLiveNavigation: true,
        noSubmitClick: true,
        noProductionAction: true,
      },
    }),
  ];
}

function compatibilityEvidence(context: AtsExecutionContext) {
  return [
    createEvidenceItem({
      kind: 'detector_signal',
      label: 'Workday compatibility adapter selected',
      value: context.sourceUrl || context.platformHint || 'workday',
      url: context.sourceUrl,
      metadata: {
        compatibilityBridge: true,
        workdayAutomationExpanded: false,
      },
    }),
  ];
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}

function clean(value: unknown) {
  return String(value || '').trim();
}
