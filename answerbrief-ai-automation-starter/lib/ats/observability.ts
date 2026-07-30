import type {
  AdapterPhaseResult,
  AtsCanonicalState,
  AtsPhase,
  JsonRecord,
  UserGate,
} from './contracts';

export type AtsExecutionEvent = {
  eventId: string;
  applicationId?: string;
  jobId?: string;
  adapterId: string;
  adapterVersion: string;
  phase: AtsPhase;
  canonicalState: AtsCanonicalState;
  outcome: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  fieldsDetected?: number;
  fieldsCompleted?: number;
  unresolvedFields?: string[];
  validationErrors?: string[];
  userGate?: UserGate;
  retryClassification?: string;
  selectorType?: string;
  selectorValue?: string;
  currentUrl?: string;
  screenshotPath?: string;
  errorCode?: string;
  errorMessage?: string;
  rawSignals?: JsonRecord;
};

export type CareerOsWorkflowEventPatch = {
  application_id?: string;
  event_type: string;
  evidence_text: string;
  evidence_url?: string | null;
  metadata: JsonRecord;
  occurred_at: string;
  platform: string;
  status: string;
};

export function phaseResultToExecutionEvent(
  result: AdapterPhaseResult,
  input: { applicationId?: string; jobId?: string; eventId?: string } = {},
): AtsExecutionEvent {
  const data = asRecord(result.data);
  const submitControl = asRecord(data.submitControl);
  return {
    eventId: input.eventId || deterministicEventId(result, input.applicationId),
    applicationId: input.applicationId,
    jobId: input.jobId,
    adapterId: result.adapterId,
    adapterVersion: result.adapterVersion,
    phase: result.phase,
    canonicalState: result.canonicalState,
    outcome: result.status,
    startedAt: result.startedAt,
    completedAt: result.completedAt,
    durationMs: result.durationMs,
    fieldsDetected: numberOrUndefined(data.fieldsDetected),
    fieldsCompleted: numberOrUndefined(data.fieldsCompleted),
    unresolvedFields: arrayOfStrings(data.unresolvedFields),
    validationErrors: arrayOfStrings(data.validationErrors),
    userGate: result.userGate,
    retryClassification: result.retryPolicy?.classification || result.failure?.retryPolicy.classification,
    selectorType: stringOrUndefined(submitControl.selectorType),
    selectorValue: stringOrUndefined(submitControl.selectorValue),
    currentUrl: result.currentUrl,
    screenshotPath: result.evidence.find((item) => item.screenshotPath)?.screenshotPath,
    errorCode: result.failure?.code,
    errorMessage: result.failure?.message,
    rawSignals: result.rawSignals,
  };
}

export function executionEventToWorkflowEvent(event: AtsExecutionEvent): CareerOsWorkflowEventPatch {
  return {
    application_id: event.applicationId,
    event_type: `ats_${event.phase}`,
    evidence_text: event.errorMessage || event.userGate?.reason || `${event.adapterId} ${event.phase} ${event.outcome}`,
    evidence_url: event.currentUrl || null,
    metadata: {
      adapter_id: event.adapterId,
      adapter_version: event.adapterVersion,
      canonical_state: event.canonicalState,
      duration_ms: event.durationMs,
      fields_detected: event.fieldsDetected,
      fields_completed: event.fieldsCompleted,
      raw_signals: event.rawSignals,
      retry_classification: event.retryClassification,
      selector_type: event.selectorType,
      selector_value: event.selectorValue,
      user_gate: event.userGate,
      validation_errors: event.validationErrors,
    },
    occurred_at: event.completedAt,
    platform: event.adapterId,
    status: event.outcome,
  };
}

function deterministicEventId(result: AdapterPhaseResult, applicationId?: string) {
  return [
    'ats',
    applicationId || 'application',
    result.adapterId,
    result.phase,
    result.startedAt,
  ].join(':');
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}

function arrayOfStrings(value: unknown) {
  return Array.isArray(value) ? value.map(String) : undefined;
}

function numberOrUndefined(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function stringOrUndefined(value: unknown) {
  const text = String(value || '').trim();
  return text || undefined;
}
