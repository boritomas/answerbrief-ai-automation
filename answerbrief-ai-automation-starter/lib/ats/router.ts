import type {
  AtsAdapter,
  AtsAdapterMetadata,
  AtsDetectionInput,
  AtsDetectionResult,
  AtsPlatform,
  NormalizedAtsContext,
} from './contracts';
import { detectAts } from './detector';
import {
  defaultAtsAdapterRegistry,
  type AtsAdapterRegistry,
} from './registry';

export type AtsRoutingInput = AtsDetectionInput & {
  applicationId?: string;
  employer?: string;
  originalTask?: unknown;
  position?: string;
};

export type AtsRoutingResult = {
  detection: AtsDetectionResult;
  adapter: AtsAdapter;
  adapterMetadata: AtsAdapterMetadata;
  supported: boolean;
  reason: string;
  normalizedUrl: string;
  tenant?: string;
  jobId?: string;
  confidence: number;
  matchedSignals: string[];
  conflictingSignals: string[];
  unknowns: string[];
  normalizedContext: NormalizedAtsContext;
};

export function routeAtsApplication(
  input: AtsRoutingInput,
  registry: AtsAdapterRegistry = defaultAtsAdapterRegistry,
): AtsRoutingResult {
  const detection = detectAts(input);
  const adapter = registry.getAdapter(detection.platform);
  const supported = adapter.metadata.implementationStatus !== 'unsupported';
  const reason = reasonForRoute(detection.platform, supported, detection.conflictingSignals);
  const normalizedContext = createNormalizedAtsContext({
    adapterMetadata: adapter.metadata,
    detection,
    input,
    reason,
    supported,
  });
  return {
    detection,
    adapter,
    adapterMetadata: adapter.metadata,
    supported,
    reason,
    normalizedUrl: detection.normalized.normalizedUrl,
    tenant: detection.tenant,
    jobId: detection.jobId,
    confidence: detection.confidence,
    matchedSignals: detection.matchedSignals,
    conflictingSignals: detection.conflictingSignals,
    unknowns: detection.unknowns,
    normalizedContext,
  };
}

export function createNormalizedAtsContext(input: {
  adapterMetadata: AtsAdapterMetadata;
  detection: AtsDetectionResult;
  input: AtsRoutingInput;
  reason: string;
  supported: boolean;
}): NormalizedAtsContext {
  return {
    detectedPlatform: input.detection.platform,
    sourceUrl: input.detection.normalized.sourceUrl,
    normalizedUrl: input.detection.normalized.normalizedUrl,
    platformHint: input.input.platformHint ?? null,
    tenant: input.detection.tenant ?? null,
    jobId: input.detection.jobId ?? null,
    applicationId: input.input.applicationId ?? null,
    confidence: input.detection.confidence,
    matchedSignals: [...input.detection.matchedSignals],
    conflictingSignals: [...input.detection.conflictingSignals],
    unknowns: [...input.detection.unknowns],
    detectorVersion: input.detection.detectorVersion,
    adapterId: input.adapterMetadata.adapterId,
    adapterVersion: input.adapterMetadata.adapterVersion,
    implementationStatus: input.adapterMetadata.implementationStatus,
    supported: input.supported,
    routingReason: input.reason,
    originalTask: input.input.originalTask,
  };
}

function reasonForRoute(platform: AtsPlatform, supported: boolean, conflicts: string[]) {
  if (conflicts.length) {
    return `ATS detection selected ${platform} with conflict evidence: ${conflicts.join('; ')}.`;
  }
  if (supported) return `ATS detection selected supported ${platform} adapter.`;
  return 'ATS detection resolved to unsupported; Career OS will not attempt generic submission.';
}
