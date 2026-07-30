export const ATS_DETECTOR_VERSION = 'career-os-ats-detector-2026-07-24-phase-2';

/**
 * JSON-compatible mirror of lib/ats/contracts.ts NormalizedAtsContext.
 * Keep this facade shape aligned with the typed router until the runtime has a
 * compiled TypeScript entrypoint.
 *
 * @typedef {Object} NormalizedAtsContext
 * @property {'greenhouse'|'workday'|'unsupported'|'unknown'} detectedPlatform
 * @property {string} sourceUrl
 * @property {string} normalizedUrl
 * @property {string|null} platformHint
 * @property {string|null} tenant
 * @property {string|null} jobId
 * @property {string|null} applicationId
 * @property {number} confidence
 * @property {string[]} matchedSignals
 * @property {string[]} conflictingSignals
 * @property {string[]} unknowns
 * @property {string} detectorVersion
 * @property {string} adapterId
 * @property {string} adapterVersion
 * @property {string} implementationStatus
 * @property {boolean} supported
 * @property {string|null} routingReason
 * @property {unknown} originalTask
 */

const GREENHOUSE_METADATA = {
  adapterId: 'greenhouse',
  adapterVersion: 'career-os-greenhouse-compat-2026-07-24-phase-2',
  supportedPlatforms: ['greenhouse'],
  implementationStatus: 'compatibility',
};

const WORKDAY_METADATA = {
  adapterId: 'workday',
  adapterVersion: 'career-os-workday-compat-2026-07-24-phase-3-fixture-poc',
  supportedPlatforms: ['workday'],
  implementationStatus: 'experimental',
};

const UNSUPPORTED_METADATA = {
  adapterId: 'unsupported',
  adapterVersion: 'career-os-unsupported-2026-07-24-phase-2',
  supportedPlatforms: ['unsupported', 'unknown'],
  implementationStatus: 'unsupported',
};

export function createCareerOsAtsFacade({ legacyAdapters = {} } = {}) {
  const registry = createAtsAdapterRegistry();
  const legacyByPlatform = normalizeLegacyAdapters(legacyAdapters);

  return {
    routeTask(task) {
      return routeLegacyAtsExecution(task, registry);
    },
    getRoutedAtsAdapter(task) {
      const route = routeLegacyAtsExecution(task, registry);
      if (!route.supported) return createUnsupportedCompatibilityAdapter(route);

      const legacyAdapter = legacyByPlatform[route.adapterId];
      const legacyMatches = Boolean(legacyAdapter?.matches?.(task));
      if (!legacyAdapter || !legacyMatches) {
        return createUnsupportedCompatibilityAdapter({
          ...route,
          supported: false,
          reason: legacyAdapter
            ? `Routed ${route.adapterId} adapter was not accepted by the legacy adapter match contract.`
            : `No legacy adapter is registered for routed platform ${route.adapterId}.`,
          adapterId: 'unsupported',
          adapterVersion: UNSUPPORTED_METADATA.adapterVersion,
          implementationStatus: UNSUPPORTED_METADATA.implementationStatus,
        });
      }

      return createLegacyAdapterBridge(route.adapter, {
        legacyAdapter,
        route,
      });
    },
  };
}

export function routeLegacyAtsExecution(task, registry = createAtsAdapterRegistry()) {
  const detection = detectAts(taskToDetectionInput(task));
  const adapter = registry.getAdapter(detection.platform);
  const supported = adapter.metadata.implementationStatus !== 'unsupported';
  const reason = routeReason(detection.platform, supported, detection.conflictingSignals);
  const normalizedContext = createNormalizedAtsContext({
    adapterMetadata: adapter.metadata,
    detection,
    reason,
    supported,
    task,
  });
  const route = {
    ...normalizedContext,
    reason,
    supported,
    detection,
    adapter,
    normalizedContext,
  };
  return route;
}

export function createNormalizedAtsContext({ adapterMetadata, detection, reason, supported, task }) {
  return {
    detectedPlatform: detection.platform,
    sourceUrl: detection.normalized.sourceUrl,
    normalizedUrl: detection.normalized.normalizedUrl,
    platformHint: task?.platform ?? null,
    tenant: detection.tenant ?? null,
    jobId: detection.jobId ?? null,
    applicationId: task?.applicationId ?? null,
    confidence: detection.confidence,
    matchedSignals: [...detection.matchedSignals],
    conflictingSignals: [...detection.conflictingSignals],
    unknowns: [...detection.unknowns],
    detectorVersion: detection.detectorVersion,
    adapterId: adapterMetadata.adapterId,
    adapterVersion: adapterMetadata.adapterVersion,
    implementationStatus: adapterMetadata.implementationStatus,
    supported,
    routingReason: reason,
    originalTask: task,
  };
}

export function createLegacyAdapterBridge(nativeAdapter, { legacyAdapter, route } = {}) {
  return {
    id: nativeAdapter.metadata.adapterId,
    routingMetadata: routeToMetadata(route),
    matches(task) {
      const nextRoute = routeLegacyAtsExecution(task);
      return nextRoute.adapterId === nativeAdapter.metadata.adapterId
        && Boolean(legacyAdapter?.matches?.(task));
    },
    async execute(page, task, runtime) {
      return legacyAdapter.execute(page, task, runtime);
    },
  };
}

export function detectAts(input = {}) {
  const rawRecord = asRecord(input.rawJobRecord);
  const sourceUrl = clean(input.sourceUrl || rawRecord.application_url || rawRecord.canonical_url || rawRecord.job_url || rawRecord.posting_url);
  const urlDetection = detectFromUrl(sourceUrl);
  const hintPlatform = normalizePlatform(input.platformHint || rawRecord.ats_platform || rawRecord.platform || rawRecord.source);
  const pagePlatform = normalizePlatform(asRecord(input.pageSignals).platform || asRecord(input.pageSignals).atsPlatform);
  const matchedSignals = [...urlDetection.matchedSignals];
  const conflictingSignals = [];
  const unknowns = [];

  if (!sourceUrl) unknowns.push('source_url');

  for (const [label, platform] of [['platform_hint', hintPlatform], ['page_signal', pagePlatform]]) {
    if (platform === 'unknown') continue;
    if (platform === 'unsupported') {
      matchedSignals.push(`${label}:unsupported`);
      continue;
    }
    if (urlDetection.platform !== 'unknown' && urlDetection.platform !== platform) {
      conflictingSignals.push(`${label}:${platform}_conflicts_with_url:${urlDetection.platform}`);
      continue;
    }
    matchedSignals.push(`${label}:${platform}`);
  }

  const platform = choosePlatform(urlDetection.platform, pagePlatform, hintPlatform);
  const confidence = confidenceFor(urlDetection, pagePlatform, hintPlatform, conflictingSignals);
  const normalized = normalizeJobUrl(sourceUrl, platform, urlDetection);
  if (!normalized.tenant) unknowns.push('tenant');
  if (!normalized.jobId) unknowns.push('job_id');

  return {
    platform,
    tenant: normalized.tenant,
    jobId: normalized.jobId,
    normalized,
    confidence,
    matchedSignals: Array.from(new Set(matchedSignals)),
    conflictingSignals,
    unknowns: Array.from(new Set(unknowns)),
    detectorVersion: ATS_DETECTOR_VERSION,
    detectedAt: new Date().toISOString(),
    rawSignals: {
      platformHint: clean(input.platformHint),
      sourceUrl,
      urlPlatform: urlDetection.platform,
    },
  };
}

export function normalizePlatform(value) {
  const text = clean(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  if (!text) return 'unknown';
  if (text.includes('greenhouse')) return 'greenhouse';
  if (text.includes('workday') || text.includes('myworkdayjobs')) return 'workday';
  if (text === 'unsupported') return 'unsupported';
  return 'unknown';
}

export function createAtsAdapterRegistry() {
  const adapters = new Map([
    ['greenhouse', { metadata: GREENHOUSE_METADATA }],
    ['workday', { metadata: WORKDAY_METADATA }],
    ['unsupported', { metadata: UNSUPPORTED_METADATA }],
    ['unknown', { metadata: UNSUPPORTED_METADATA }],
  ]);
  return {
    getAdapter(platform) {
      return adapters.get(platform) || adapters.get('unsupported');
    },
  };
}

function createUnsupportedCompatibilityAdapter(route) {
  return {
    id: 'unsupported',
    routingMetadata: routeToMetadata(route),
    matches(task) {
      return routeLegacyAtsExecution(task).adapterId === 'unsupported';
    },
    async execute(page, task, runtime) {
      await runtime?.report?.({
        status: 'blocked_technical',
        currentUrl: task?.applicationUrl || route.sourceUrl,
        evidenceText: route.reason || 'Career OS does not have a supported ATS adapter for this platform.',
        details: {
          adapter: 'unsupported',
          routing: routeToMetadata(route),
          unsupported: true,
        },
      });
      return false;
    },
  };
}

function routeToMetadata(route) {
  const context = route?.normalizedContext || route;
  return {
    sourceUrl: context?.sourceUrl,
    detectedPlatform: context?.detectedPlatform,
    detectorVersion: context?.detectorVersion,
    confidence: context?.confidence,
    matchedSignals: context?.matchedSignals || [],
    conflictingSignals: context?.conflictingSignals || [],
    normalizedUrl: context?.normalizedUrl,
    tenant: context?.tenant,
    jobId: context?.jobId,
    applicationId: context?.applicationId,
    adapterId: context?.adapterId,
    adapterVersion: context?.adapterVersion,
    implementationStatus: context?.implementationStatus,
    supported: Boolean(context?.supported),
    reason: context?.routingReason || route?.reason,
  };
}

function normalizeLegacyAdapters(legacyAdapters) {
  if (Array.isArray(legacyAdapters)) {
    return Object.fromEntries(legacyAdapters.map((entry) => [entry.platform || entry.adapter?.id, entry.adapter]));
  }
  return legacyAdapters;
}

function taskToDetectionInput(task = {}) {
  return {
    sourceUrl: task.applicationUrl,
    platformHint: task.platform,
    rawJobRecord: {
      application_url: task.applicationUrl,
      platform: task.platform,
      employer: task.employer,
      position: task.position,
    },
  };
}

function routeReason(platform, supported, conflicts) {
  if (conflicts.length) {
    return `ATS detection selected ${platform} with conflict evidence: ${conflicts.join('; ')}.`;
  }
  if (supported) return `ATS detection selected supported ${platform} adapter.`;
  return 'ATS detection resolved to unsupported; Career OS will not attempt generic submission.';
}

function detectFromUrl(sourceUrl) {
  if (!sourceUrl) {
    return {
      confidence: 0,
      matchedSignals: [],
      platform: 'unknown',
      urlKind: 'unknown',
    };
  }

  let parsed;
  try {
    parsed = new URL(sourceUrl);
  } catch {
    return {
      confidence: 0,
      matchedSignals: ['url:unparseable'],
      platform: 'unknown',
      urlKind: 'unknown',
    };
  }

  const host = parsed.hostname.toLowerCase();
  const path = parsed.pathname;
  const lowerUrl = sourceUrl.toLowerCase();

  if (host === 'boards-api.greenhouse.io') {
    return {
      confidence: 0.96,
      jobId: greenhouseJobId(parsed),
      matchedSignals: ['url_host:boards-api.greenhouse.io'],
      platform: 'greenhouse',
      tenant: path.match(/\/boards\/([^/]+)/i)?.[1],
      urlKind: 'api',
    };
  }

  if (/greenhouse\.io$/i.test(host) || host.includes('.greenhouse.io')) {
    return {
      confidence: 0.96,
      jobId: greenhouseJobId(parsed),
      matchedSignals: ['url_host:greenhouse.io'],
      platform: 'greenhouse',
      tenant: greenhouseTenant(parsed),
      urlKind: greenhouseUrlKind(parsed),
    };
  }

  if (host.includes('myworkdayjobs.com') || host.includes('workdayjobs.com')) {
    return {
      confidence: 0.96,
      jobId: workdayJobId(parsed),
      matchedSignals: ['url_host:workdayjobs'],
      platform: 'workday',
      tenant: workdayTenant(parsed),
      urlKind: lowerUrl.includes('/job/') ? 'job_posting' : 'hosted_application',
    };
  }

  if (host.includes('workday') || /\/wday\/cxs\//i.test(path)) {
    return {
      confidence: 0.86,
      jobId: workdayJobId(parsed),
      matchedSignals: ['url_path_or_host:workday'],
      platform: 'workday',
      tenant: workdayTenant(parsed),
      urlKind: lowerUrl.includes('/job/') ? 'job_posting' : 'hosted_application',
    };
  }

  return {
    confidence: 0.2,
    matchedSignals: ['url:unsupported'],
    platform: 'unsupported',
    urlKind: 'unknown',
  };
}

function choosePlatform(urlPlatform, pagePlatform, hintPlatform) {
  if (urlPlatform === 'greenhouse' || urlPlatform === 'workday' || urlPlatform === 'unsupported') return urlPlatform;
  if (pagePlatform === 'greenhouse' || pagePlatform === 'workday') return pagePlatform;
  if (hintPlatform === 'greenhouse' || hintPlatform === 'workday') return hintPlatform;
  return 'unsupported';
}

function confidenceFor(urlDetection, pagePlatform, hintPlatform, conflicts) {
  if (conflicts.length) return Math.min(urlDetection.confidence || 0.72, 0.74);
  if (urlDetection.platform !== 'unknown') return urlDetection.confidence;
  if (pagePlatform === 'greenhouse' || pagePlatform === 'workday') return 0.78;
  if (hintPlatform === 'greenhouse' || hintPlatform === 'workday') return 0.68;
  return 0.2;
}

function normalizeJobUrl(sourceUrl, platform, detection) {
  const fallback = {
    platform,
    sourceUrl,
    normalizedUrl: sourceUrl,
    tenant: detection.tenant,
    jobId: detection.jobId,
    urlKind: detection.urlKind,
  };

  if (!sourceUrl) return fallback;
  try {
    const parsed = new URL(sourceUrl);
    parsed.hash = '';
    const keep = new URLSearchParams();
    const keepKeys = platform === 'greenhouse'
      ? ['for', 'token', 'gh_jid']
      : ['jobId', 'jobPostingId', 'jobReqId', 'requisitionId'];
    for (const key of keepKeys) {
      const value = parsed.searchParams.get(key);
      if (value) keep.set(key, value);
    }
    parsed.search = keep.toString();
    return {
      ...fallback,
      normalizedUrl: parsed.toString().replace(/\/$/, ''),
    };
  } catch {
    return fallback;
  }
}

function greenhouseTenant(parsed) {
  const fromQuery = clean(parsed.searchParams.get('for'));
  if (fromQuery) return fromQuery.toLowerCase();
  const segments = parsed.pathname.split('/').filter(Boolean);
  if (parsed.hostname.startsWith('job-boards.')) return segments[0]?.toLowerCase();
  if (parsed.hostname === 'boards.greenhouse.io') return segments[0]?.toLowerCase();
  return undefined;
}

function greenhouseJobId(parsed) {
  return clean(parsed.searchParams.get('gh_jid') || parsed.searchParams.get('token'))
    || clean(parsed.pathname.match(/\/jobs\/([^/?#]+)/i)?.[1])
    || clean(parsed.pathname.match(/\/job_app\/([^/?#]+)/i)?.[1])
    || undefined;
}

function greenhouseUrlKind(parsed) {
  if (/\/embed\/job_app/i.test(parsed.pathname)) return 'embedded_application';
  if (/\/jobs\//i.test(parsed.pathname)) return 'job_posting';
  return 'hosted_application';
}

function workdayTenant(parsed) {
  const segments = parsed.pathname.split('/').filter(Boolean).slice(0, 2).join('/');
  return `${parsed.hostname.toLowerCase()}:${segments || 'default'}`;
}

function workdayJobId(parsed) {
  const direct = clean(
    parsed.searchParams.get('jobId')
    || parsed.searchParams.get('jobPostingId')
    || parsed.searchParams.get('jobReqId')
    || parsed.searchParams.get('requisitionId'),
  );
  if (direct) return direct;
  const segments = parsed.pathname.split('/').filter(Boolean);
  const jobIndex = segments.findIndex((segment) => segment.toLowerCase() === 'job');
  if (jobIndex >= 0) {
    return clean(segments.slice(jobIndex + 1).filter(Boolean).pop()) || undefined;
  }
  return clean(parsed.pathname.match(/\/([^/]*?(?:jr|req)[a-z0-9_-]+)$/i)?.[1]) || undefined;
}

function asRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function clean(value) {
  return String(value || '').trim().replace(/^"|"$/g, '');
}
