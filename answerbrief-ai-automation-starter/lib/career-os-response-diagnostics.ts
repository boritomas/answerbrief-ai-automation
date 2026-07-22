import {
  getCareerOsStatus,
  summarizeCareerOsStatus,
  type CareerOsStatus,
} from './career-os-status';

type JsonRecord = Record<string, unknown>;

type TraceMarkName =
  | 'handler_entered'
  | 'data_load_started'
  | 'data_load_completed'
  | 'dashboard_build_completed'
  | 'serialization_started'
  | 'serialization_completed'
  | 'response_object_created'
  | 'return_statement_reached'
  | 'handler_completed';

type TraceMark = {
  elapsedMs: number;
  name: TraceMarkName;
};

type PayloadSectionInventory = {
  applicationsBytes: number;
  checkpointsBytes: number;
  diagnosticsBytes: number;
  duplicatedDataBytes: number;
  evidenceBytes: number;
  largestPayloadSection: string;
  largestSingleRecord: {
    bytes: number;
    id?: string;
    path: string;
  };
  lifecycleEventsBytes: number;
  opportunitiesBytes: number;
  recordCount: number;
  totalBytes: number;
};

type SerializationScan = {
  circularReferenceFound: boolean;
  deepestNestingLevel: number;
  nonSerializableValuesFound: string[];
  topLevelKeyCount: number;
};

export type ResponseDiagnostics = {
  arrayLengths: Record<string, number>;
  inventory: PayloadSectionInventory;
  memoryAfterSerializationBytes: number;
  memoryBeforeSerializationBytes: number;
  originMs: number;
  payloadBytes: number;
  processRuntime: string;
  scan: SerializationScan;
  timings: TraceMark[];
};

type StatusBundle = {
  diagnostics: ResponseDiagnostics;
  payload: {
    status: CareerOsStatus;
    summary: ReturnType<typeof summarizeCareerOsStatus>;
  };
  status: CareerOsStatus;
};

const HEADER_PREFIX = 'x-career-os-';

export async function buildCareerOsStatusBundle(): Promise<StatusBundle> {
  const startedAt = performance.now();
  const timings: TraceMark[] = [];
  const mark = (name: TraceMarkName) => {
    timings.push({ name, elapsedMs: Number((performance.now() - startedAt).toFixed(3)) });
  };

  mark('handler_entered');
  mark('data_load_started');
  const status = await getCareerOsStatus();
  mark('data_load_completed');

  const payload = {
    status,
    summary: summarizeCareerOsStatus(status),
  };
  mark('dashboard_build_completed');

  return {
    diagnostics: {
      arrayLengths: {
        applications: status.evidence.applications.length,
        artifacts: status.evidence.artifacts.length,
        automationRuns: status.evidence.automationRuns.length,
        jobPostings: status.evidence.jobPostings.length,
        opportunities: status.evidence.seededOpportunities.length,
        sourceRuns: status.evidence.sourceRuns.length,
        tasks: status.evidence.tasks.length,
        workflowEvents: status.evidence.workflowEvents.length,
      },
      inventory: emptyInventory(),
      memoryAfterSerializationBytes: 0,
      memoryBeforeSerializationBytes: 0,
      originMs: startedAt,
      payloadBytes: 0,
      processRuntime: process.version,
      scan: {
        circularReferenceFound: false,
        deepestNestingLevel: 0,
        nonSerializableValuesFound: [],
        topLevelKeyCount: 0,
      },
      timings,
    },
    payload,
    status,
  };
}

export function serializeCareerOsPayload(payload: unknown, diagnostics: ResponseDiagnostics) {
  const nextDiagnostics: ResponseDiagnostics = {
    ...diagnostics,
    inventory: isFullStatusPayload(payload) ? buildPayloadInventory(payload) : emptyInventory(),
    scan: scanForSerializationIssues(payload),
    timings: [...diagnostics.timings],
  };
  nextDiagnostics.memoryBeforeSerializationBytes = process.memoryUsage().heapUsed;
  markTrace(nextDiagnostics, 'serialization_started');
  const serializedPayload = JSON.stringify(payload);
  markTrace(nextDiagnostics, 'serialization_completed');
  nextDiagnostics.memoryAfterSerializationBytes = process.memoryUsage().heapUsed;
  nextDiagnostics.payloadBytes = Buffer.byteLength(serializedPayload);
  return { diagnostics: nextDiagnostics, serializedPayload };
}

export function createCareerOsJsonResponse(serializedPayload: string, diagnostics: ResponseDiagnostics) {
  const response = new Response(serializedPayload, {
    status: 200,
    headers: {
      'cache-control': 'no-store',
      'content-length': String(Buffer.byteLength(serializedPayload)),
      'content-type': 'application/json; charset=utf-8',
    },
  });

  addDiagnosticHeaders(response, diagnostics);
  markTrace(diagnostics, 'response_object_created');
  markTrace(diagnostics, 'return_statement_reached');
  response.headers.set(`${HEADER_PREFIX}trace`, compactTrace(diagnostics.timings));
  return response;
}

export function buildSmallStatusPayload(bundle: StatusBundle) {
  const { status } = bundle;
  return {
    applicationCount: status.evidence.applications.length,
    durationMs: bundle.diagnostics.timings.at(-1)?.elapsedMs ?? 0,
    opportunityCount: status.totalUniqueOpportunities,
    status: status.environment,
    taskCount: status.evidence.tasks.length,
  };
}

export function buildPingPayload() {
  return {
    buildTimestamp: new Date().toISOString(),
    deployment: process.env.VERCEL_URL || process.env.NEXT_PUBLIC_BASE_URL || '',
    ok: true,
    runtime: 'nodejs',
    timestamp: new Date().toISOString(),
  };
}

function addDiagnosticHeaders(response: Response, diagnostics: ResponseDiagnostics) {
  response.headers.set(`${HEADER_PREFIX}payload-bytes`, String(diagnostics.payloadBytes));
  response.headers.set(`${HEADER_PREFIX}serialization-ms`, String(traceElapsed(diagnostics.timings, 'serialization_started', 'serialization_completed')));
  response.headers.set(`${HEADER_PREFIX}top-level-keys`, String(diagnostics.scan.topLevelKeyCount));
  response.headers.set(`${HEADER_PREFIX}largest-section`, diagnostics.inventory.largestPayloadSection);
  response.headers.set(`${HEADER_PREFIX}memory-before`, String(diagnostics.memoryBeforeSerializationBytes));
  response.headers.set(`${HEADER_PREFIX}memory-after`, String(diagnostics.memoryAfterSerializationBytes));
  response.headers.set(`${HEADER_PREFIX}trace`, compactTrace(diagnostics.timings));
}

function compactTrace(timings: TraceMark[]) {
  return timings.map((mark) => `${mark.name}:${mark.elapsedMs}`).join(',');
}

function markTrace(diagnostics: ResponseDiagnostics, name: TraceMarkName) {
  diagnostics.timings.push({
    name,
    elapsedMs: Number((performance.now() - diagnostics.originMs).toFixed(3)),
  });
}

function traceElapsed(timings: TraceMark[], start: TraceMarkName, end: TraceMarkName) {
  const startMark = timings.find((mark) => mark.name === start);
  const endMark = timings.find((mark) => mark.name === end);
  if (!startMark || !endMark) return 0;
  return Number((endMark.elapsedMs - startMark.elapsedMs).toFixed(3));
}

function buildPayloadInventory(payload: { status: CareerOsStatus; summary: ReturnType<typeof summarizeCareerOsStatus> }): PayloadSectionInventory {
  const opportunitiesBytes = bytesFor([
    payload.status.evidence.jobPostings,
    payload.status.evidence.seededOpportunities,
  ]);
  const applicationsBytes = bytesFor(payload.status.evidence.applications);
  const checkpointsBytes = bytesFor(payload.status.evidence.artifacts);
  const lifecycleEventsBytes = bytesFor(payload.status.evidence.workflowEvents);
  const diagnosticsBytes = bytesFor(payload.status.evidence.diagnostics);
  const evidenceBytes = bytesFor({
    automationRuns: payload.status.evidence.automationRuns,
    dailyReport: payload.status.evidence.dailyReport,
    employerKnowledgeBase: payload.status.evidence.employerKnowledgeBase,
    profile: payload.status.evidence.profile,
    sourceRuns: payload.status.evidence.sourceRuns,
    tasks: payload.status.evidence.tasks,
  });
  const duplicatedDataBytes = Math.max(0, bytesFor(payload) - bytesFor(payload.status.evidence) - bytesFor(payload.summary));
  const sections = [
    ['opportunities', opportunitiesBytes],
    ['applications', applicationsBytes],
    ['checkpoints', checkpointsBytes],
    ['evidence', evidenceBytes],
    ['lifecycle_events', lifecycleEventsBytes],
    ['diagnostics', diagnosticsBytes],
  ] as const;
  const largestPayloadSection = [...sections].sort((left, right) => right[1] - left[1])[0]?.[0] || 'unknown';

  const candidates: Array<{ bytes: number; id?: string; path: string }> = [];
  recordLargestCandidates(candidates, 'status.evidence.jobPostings', payload.status.evidence.jobPostings);
  recordLargestCandidates(candidates, 'status.evidence.seededOpportunities', payload.status.evidence.seededOpportunities);
  recordLargestCandidates(candidates, 'status.evidence.applications', payload.status.evidence.applications);
  recordLargestCandidates(candidates, 'status.evidence.artifacts', payload.status.evidence.artifacts);
  recordLargestCandidates(candidates, 'status.evidence.workflowEvents', payload.status.evidence.workflowEvents);

  return {
    applicationsBytes,
    checkpointsBytes,
    diagnosticsBytes,
    duplicatedDataBytes,
    evidenceBytes,
    largestPayloadSection,
    largestSingleRecord: candidates.sort((left, right) => right.bytes - left.bytes)[0] || { bytes: 0, path: 'none' },
    lifecycleEventsBytes,
    opportunitiesBytes,
    recordCount: (
      payload.status.evidence.jobPostings.length
      + payload.status.evidence.seededOpportunities.length
      + payload.status.evidence.applications.length
      + payload.status.evidence.artifacts.length
      + payload.status.evidence.workflowEvents.length
      + payload.status.evidence.tasks.length
    ),
    totalBytes: bytesFor(payload),
  };
}

function recordLargestCandidates(candidates: Array<{ bytes: number; id?: string; path: string }>, path: string, values: unknown[]) {
  values.forEach((value, index) => {
    const record = asRecord(value);
    candidates.push({
      bytes: bytesFor(value),
      id: typeof record.id === 'string' ? record.id : undefined,
      path: `${path}[${index}]`,
    });
  });
}

function scanForSerializationIssues(value: unknown): SerializationScan {
  const visited = new WeakSet<object>();
  const nonSerializableValues = new Set<string>();
  let circularReferenceFound = false;
  let deepestNestingLevel = 0;

  const visit = (candidate: unknown, path: string, depth: number) => {
    deepestNestingLevel = Math.max(deepestNestingLevel, depth);
    if (candidate === null) return;
    if (typeof candidate === 'bigint') {
      nonSerializableValues.add(`BigInt at ${path}`);
      return;
    }
    if (typeof candidate === 'function') {
      nonSerializableValues.add(`Function at ${path}`);
      return;
    }
    if (typeof candidate === 'symbol') {
      nonSerializableValues.add(`Symbol at ${path}`);
      return;
    }
    if (candidate instanceof Promise) {
      nonSerializableValues.add(`Promise at ${path}`);
      return;
    }
    if (candidate instanceof Map) {
      nonSerializableValues.add(`Map at ${path}`);
      return;
    }
    if (candidate instanceof Set) {
      nonSerializableValues.add(`Set at ${path}`);
      return;
    }
    if (candidate instanceof Error) {
      nonSerializableValues.add(`Error at ${path}`);
      return;
    }
    if (!candidate || typeof candidate !== 'object') return;
    if (candidate instanceof Date) return;
    if (typeof Response !== 'undefined' && candidate instanceof Response) {
      nonSerializableValues.add(`Response at ${path}`);
      return;
    }
    if (typeof Request !== 'undefined' && candidate instanceof Request) {
      nonSerializableValues.add(`Request at ${path}`);
      return;
    }
    if (typeof Headers !== 'undefined' && candidate instanceof Headers) {
      nonSerializableValues.add(`Headers at ${path}`);
      return;
    }
    if (visited.has(candidate)) {
      circularReferenceFound = true;
      return;
    }
    visited.add(candidate);
    const prototype = Object.getPrototypeOf(candidate);
    if (!Array.isArray(candidate) && prototype !== Object.prototype && prototype !== null) {
      nonSerializableValues.add(`Class instance ${prototype?.constructor?.name || 'unknown'} at ${path}`);
    }
    if (Array.isArray(candidate)) {
      candidate.forEach((item, index) => visit(item, `${path}[${index}]`, depth + 1));
      return;
    }
    Object.entries(candidate).forEach(([key, nested]) => visit(nested, `${path}.${key}`, depth + 1));
  };

  visit(value, 'payload', 1);
  return {
    circularReferenceFound,
    deepestNestingLevel,
    nonSerializableValuesFound: Array.from(nonSerializableValues).slice(0, 25),
    topLevelKeyCount: Object.keys(asRecord(value)).length,
  };
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}

function bytesFor(value: unknown) {
  const serialized = JSON.stringify(value);
  return Buffer.byteLength(serialized ?? 'null');
}

function emptyInventory(): PayloadSectionInventory {
  return {
    applicationsBytes: 0,
    checkpointsBytes: 0,
    diagnosticsBytes: 0,
    duplicatedDataBytes: 0,
    evidenceBytes: 0,
    largestPayloadSection: 'none',
    largestSingleRecord: {
      bytes: 0,
      path: 'none',
    },
    lifecycleEventsBytes: 0,
    opportunitiesBytes: 0,
    recordCount: 0,
    totalBytes: 0,
  };
}

function isFullStatusPayload(value: unknown): value is { status: CareerOsStatus; summary: ReturnType<typeof summarizeCareerOsStatus> } {
  const record = asRecord(value);
  return Boolean(record.status && record.summary);
}
