import type {
  AdapterPhaseResult,
  AtsAdapter,
  AtsCanonicalState,
  AtsExecutionContext,
  AtsPhase,
  FailureClassification,
  JsonRecord,
} from './contracts';
import { createPhaseResult } from './contracts';

export type AtsTransitionValidationInput = {
  from: AtsCanonicalState;
  to: AtsCanonicalState;
  result?: AdapterPhaseResult;
  evidence?: JsonRecord;
};

export type AtsTransitionValidationResult = {
  ok: boolean;
  errors: string[];
  requiredEvidence: string[];
};

export type AtsOrchestrationOptions = {
  allowSubmit?: boolean;
  mode?: AtsExecutionContext['mode'];
  maxSteps?: number;
};

export type AtsOrchestrationResult = {
  adapterId: string;
  adapterVersion: string;
  finalState: AtsCanonicalState;
  phases: AdapterPhaseResult[];
  stoppedReason: string;
  failure?: FailureClassification;
};

export const ATS_ORCHESTRATOR_VERSION = 'career-os-ats-orchestrator-2026-07-24-phase-2';

export const ATS_PHASE_SEQUENCE: AtsPhase[] = [
  'openApplication',
  'authenticate',
  'uploadResume',
  'inspectApplication',
  'mapFields',
  'fillFields',
  'answerQuestions',
  'validate',
  'locateSubmitControl',
  'clickSubmit',
  'verifySubmission',
  'captureEvidence',
];

export const ATS_TRANSITION_EVIDENCE_REQUIREMENTS: Record<string, string[]> = {
  'FORM_COMPLETED->VALIDATION_PASSED': [
    'required-field inspection completed',
    'unresolved required fields equals 0',
    'no blocking user gate',
    'validation evidence recorded',
  ],
  'VALIDATION_PASSED->SUBMIT_CONTROL_RESOLVED': [
    'submit-capable control identified',
    'selector metadata captured',
    'control visible',
    'control enabled',
    'no unresolved policy gate',
  ],
  'SUBMIT_CONTROL_RESOLVED->SUBMIT_CLICKED': [
    'real click action executed',
    'clicked equals true',
    'timestamp recorded',
    'adapter id and version recorded',
    'selector metadata recorded',
  ],
  'SUBMIT_CLICKED->SUBMISSION_CONFIRMED': [
    'external confirmation text, page, URL, application identifier, employer acknowledgement, or screenshot evidence',
  ],
};

export function validateCanonicalTransition(input: AtsTransitionValidationInput): AtsTransitionValidationResult {
  const key = `${input.from}->${input.to}`;
  const requiredEvidence = ATS_TRANSITION_EVIDENCE_REQUIREMENTS[key] || [];
  const errors: string[] = [];
  const data = asRecord(input.result?.data || input.evidence);

  if (input.result?.userGate) errors.push(`blocking user gate: ${input.result.userGate.category}`);

  if (key === 'FORM_COMPLETED->VALIDATION_PASSED') {
    if (data.requiredFieldInspectionCompleted !== true) errors.push('required-field inspection was not completed');
    if (Number(data.unresolvedRequiredFields) !== 0) errors.push('unresolved required fields remain');
    if (!input.result?.evidence.length) errors.push('validation evidence is missing');
  }

  if (key === 'VALIDATION_PASSED->SUBMIT_CONTROL_RESOLVED') {
    const submitControl = asRecord(data.submitControl);
    if (!submitControl.selectorType || !submitControl.selectorValue) errors.push('selector metadata is missing');
    if (submitControl.visible !== true) errors.push('submit control is not visible');
    if (submitControl.enabled !== true) errors.push('submit control is not enabled');
  }

  if (key === 'SUBMIT_CONTROL_RESOLVED->SUBMIT_CLICKED') {
    const submitControl = asRecord(data.submitControl);
    if (data.clicked !== true) errors.push('clicked is not true');
    if (!data.clickedAt) errors.push('click timestamp is missing');
    if (!input.result?.adapterId || !input.result.adapterVersion) errors.push('adapter metadata is missing');
    if (!submitControl.selectorType || !submitControl.selectorValue) errors.push('selector metadata is missing');
  }

  if (key === 'SUBMIT_CLICKED->SUBMISSION_CONFIRMED' && !hasExternalConfirmationEvidence(input.result, data)) {
    errors.push('external confirmation evidence is missing');
  }

  return {
    ok: errors.length === 0,
    errors,
    requiredEvidence,
  };
}

export function classifyPhaseResultOutcome(result: AdapterPhaseResult): AtsCanonicalState {
  if (result.userGate) return 'WAITING_ON_USER';
  if (result.failure?.terminal) return 'TERMINAL_FAILURE';
  if (result.retryPolicy?.retryable || result.failure?.retryPolicy.retryable) return 'RETRYABLE_FAILURE';
  if (result.status === 'unsupported') return 'TERMINAL_FAILURE';
  if (result.status === 'failed') return 'RETRYABLE_FAILURE';
  return result.canonicalState;
}

export async function orchestrateAtsApplication(
  adapter: AtsAdapter,
  context: AtsExecutionContext,
  options: AtsOrchestrationOptions = {},
): Promise<AtsOrchestrationResult> {
  const phases: AdapterPhaseResult[] = [];
  const maxSteps = options.maxSteps ?? ATS_PHASE_SEQUENCE.length;
  const allowSubmit = options.allowSubmit === true && context.mode === 'live';
  const executionContext = {
    ...context,
    mode: options.mode || context.mode,
    dryRun: context.dryRun || !allowSubmit,
  };

  for (const phase of ATS_PHASE_SEQUENCE.slice(0, maxSteps)) {
    if (phase === 'clickSubmit' && !allowSubmit) {
      return {
        adapterId: adapter.metadata.adapterId,
        adapterVersion: adapter.metadata.adapterVersion,
        finalState: phases[phases.length - 1]?.canonicalState || 'READY_FOR_AUTOMATION',
        phases,
        stoppedReason: 'dry_run_submit_blocked',
      };
    }

    const result = guardPhaseResult(adapter, phase, await invokePhase(adapter, phase, executionContext));
    phases.push(result);
    const classified = classifyPhaseResultOutcome(result);
    if (classified === 'WAITING_ON_USER' || classified === 'RETRYABLE_FAILURE' || classified === 'TERMINAL_FAILURE') {
      return {
        adapterId: adapter.metadata.adapterId,
        adapterVersion: adapter.metadata.adapterVersion,
        finalState: classified,
        phases,
        stoppedReason: result.userGate?.reason || result.failure?.message || result.status,
        failure: result.failure,
      };
    }
  }

  const last = phases[phases.length - 1];
  return {
    adapterId: adapter.metadata.adapterId,
    adapterVersion: adapter.metadata.adapterVersion,
    finalState: last?.canonicalState || 'READY_FOR_AUTOMATION',
    phases,
    stoppedReason: 'phase_sequence_completed',
    failure: last?.failure,
  };
}

function guardPhaseResult(adapter: AtsAdapter, phase: AtsPhase, result: AdapterPhaseResult): AdapterPhaseResult {
  if (result.canonicalState === 'SUBMISSION_CONFIRMED' && phase !== 'verifySubmission') {
    return transitionFailureResult(adapter, phase, result, {
      ok: false,
      errors: ['submission confirmation can only be claimed by verifySubmission'],
      requiredEvidence: ATS_TRANSITION_EVIDENCE_REQUIREMENTS['SUBMIT_CLICKED->SUBMISSION_CONFIRMED'],
    });
  }

  const validation = validationForPhaseResult(phase, result);
  if (!validation || validation.ok) return result;
  return transitionFailureResult(adapter, phase, result, validation);
}

function validationForPhaseResult(
  phase: AtsPhase,
  result: AdapterPhaseResult,
): AtsTransitionValidationResult | undefined {
  if (phase === 'validate' && result.canonicalState === 'VALIDATION_PASSED') {
    return validateCanonicalTransition({
      from: 'FORM_COMPLETED',
      to: 'VALIDATION_PASSED',
      result,
    });
  }

  if (phase === 'locateSubmitControl' && result.canonicalState === 'SUBMIT_CONTROL_RESOLVED') {
    return validateCanonicalTransition({
      from: 'VALIDATION_PASSED',
      to: 'SUBMIT_CONTROL_RESOLVED',
      result,
    });
  }

  if (phase === 'clickSubmit' && result.canonicalState === 'SUBMIT_CLICKED') {
    return validateCanonicalTransition({
      from: 'SUBMIT_CONTROL_RESOLVED',
      to: 'SUBMIT_CLICKED',
      result,
    });
  }

  if (phase === 'verifySubmission' && result.canonicalState === 'SUBMISSION_CONFIRMED') {
    return validateCanonicalTransition({
      from: 'SUBMIT_CLICKED',
      to: 'SUBMISSION_CONFIRMED',
      result,
    });
  }

  return undefined;
}

function transitionFailureResult(
  adapter: AtsAdapter,
  phase: AtsPhase,
  result: AdapterPhaseResult,
  validation: AtsTransitionValidationResult,
): AdapterPhaseResult {
  const failure: FailureClassification = {
    code: 'runtime_error',
    message: `Adapter result failed orchestrator transition guard: ${validation.errors.join('; ')}`,
    retryPolicy: {
      classification: 'terminal',
      retryable: false,
      reason: 'Unsafe canonical transition was rejected by the ATS orchestrator.',
    },
    terminal: true,
    rawSignals: {
      phase,
      rejectedCanonicalState: result.canonicalState,
      requiredEvidence: validation.requiredEvidence,
      validationErrors: validation.errors,
    },
  };

  return createPhaseResult({
    phase,
    status: 'failed',
    canonicalState: 'TERMINAL_FAILURE',
    metadata: adapter.metadata,
    currentUrl: result.currentUrl,
    evidence: result.evidence,
    unknowns: [...result.unknowns, ...validation.errors],
    failure,
    rawSignals: failure.rawSignals,
    data: {
      rejectedCanonicalState: result.canonicalState,
      transitionGuardErrors: validation.errors,
      requiredEvidence: validation.requiredEvidence,
    },
  });
}

async function invokePhase(adapter: AtsAdapter, phase: AtsPhase, context: AtsExecutionContext): Promise<AdapterPhaseResult> {
  switch (phase) {
    case 'openApplication':
      return adapter.openApplication(context);
    case 'authenticate':
      return adapter.authenticate(context);
    case 'uploadResume':
      return adapter.uploadResume(context);
    case 'inspectApplication':
      return adapter.inspectApplication(context);
    case 'mapFields':
      return adapter.mapFields(context);
    case 'fillFields':
      return adapter.fillFields(context);
    case 'answerQuestions':
      return adapter.answerQuestions(context);
    case 'validate':
      return adapter.validate(context);
    case 'locateSubmitControl':
      return adapter.locateSubmitControl(context);
    case 'clickSubmit':
      return adapter.clickSubmit(context);
    case 'verifySubmission':
      return adapter.verifySubmission(context);
    case 'captureEvidence':
      return adapter.captureEvidence(context);
    case 'classifyFailure':
      return adapter.classifyFailure(context, new Error('classifyFailure invoked by orchestrator'));
    case 'detect':
    case 'normalizeJobUrl':
    default:
      throw new Error(`Unsupported orchestrator phase ${phase}.`);
  }
}

function hasExternalConfirmationEvidence(result: AdapterPhaseResult | undefined, data: JsonRecord) {
  if (!result) return false;
  if (data.confirmationText || data.confirmationUrl || data.confirmationNumber || data.employerAcknowledgement) return true;
  return result.evidence.some((item) => item.kind === 'confirmation' || item.kind === 'screenshot');
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}
