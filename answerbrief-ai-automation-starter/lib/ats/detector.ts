import type {
  AtsDetectionInput,
  AtsDetectionResult,
  AtsPlatform,
  JsonRecord,
  NormalizedJobUrl,
} from './contracts';

export const ATS_DETECTOR_VERSION = 'career-os-ats-detector-2026-07-24-phase-2';

type UrlDetection = {
  confidence: number;
  jobId?: string;
  matchedSignals: string[];
  platform: AtsPlatform;
  tenant?: string;
  urlKind: NormalizedJobUrl['urlKind'];
};

export function detectAts(input: AtsDetectionInput): AtsDetectionResult {
  const detectedAt = new Date().toISOString();
  const rawRecord = asRecord(input.rawJobRecord);
  const sourceUrl = clean(input.sourceUrl || rawRecord.application_url || rawRecord.canonical_url || rawRecord.job_url || rawRecord.posting_url);
  const urlDetection = detectFromUrl(sourceUrl);
  const hintPlatform = normalizePlatform(input.platformHint || rawRecord.ats_platform || rawRecord.platform || rawRecord.source);
  const pagePlatform = normalizePlatform(asRecord(input.pageSignals).platform || asRecord(input.pageSignals).atsPlatform);
  const matchedSignals = [...urlDetection.matchedSignals];
  const conflictingSignals: string[] = [];
  const unknowns: string[] = [];

  if (!sourceUrl) unknowns.push('source_url');

  for (const [label, platform] of [['platform_hint', hintPlatform], ['page_signal', pagePlatform]] as Array<[string, AtsPlatform]>) {
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
    detectedAt,
    rawSignals: {
      platformHint: clean(input.platformHint),
      sourceUrl,
      urlPlatform: urlDetection.platform,
    },
  };
}

export function normalizePlatform(value: unknown): AtsPlatform {
  const text = clean(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  if (!text) return 'unknown';
  if (text.includes('greenhouse')) return 'greenhouse';
  if (text.includes('workday') || text.includes('myworkdayjobs')) return 'workday';
  if (text === 'unsupported') return 'unsupported';
  return 'unknown';
}

function detectFromUrl(sourceUrl: string): UrlDetection {
  if (!sourceUrl) {
    return {
      confidence: 0,
      matchedSignals: [],
      platform: 'unknown',
      urlKind: 'unknown',
    };
  }

  let parsed: URL;
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

function choosePlatform(urlPlatform: AtsPlatform, pagePlatform: AtsPlatform, hintPlatform: AtsPlatform): AtsPlatform {
  if (urlPlatform === 'greenhouse' || urlPlatform === 'workday' || urlPlatform === 'unsupported') return urlPlatform;
  if (pagePlatform === 'greenhouse' || pagePlatform === 'workday') return pagePlatform;
  if (hintPlatform === 'greenhouse' || hintPlatform === 'workday') return hintPlatform;
  return 'unsupported';
}

function confidenceFor(urlDetection: UrlDetection, pagePlatform: AtsPlatform, hintPlatform: AtsPlatform, conflicts: string[]) {
  if (conflicts.length) return Math.min(urlDetection.confidence || 0.72, 0.74);
  if (urlDetection.platform !== 'unknown') return urlDetection.confidence;
  if (pagePlatform === 'greenhouse' || pagePlatform === 'workday') return 0.78;
  if (hintPlatform === 'greenhouse' || hintPlatform === 'workday') return 0.68;
  return 0.2;
}

function normalizeJobUrl(sourceUrl: string, platform: AtsPlatform, detection: UrlDetection): NormalizedJobUrl {
  const fallback: NormalizedJobUrl = {
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

function greenhouseTenant(parsed: URL) {
  const fromQuery = clean(parsed.searchParams.get('for'));
  if (fromQuery) return fromQuery.toLowerCase();
  const segments = parsed.pathname.split('/').filter(Boolean);
  if (parsed.hostname.startsWith('job-boards.')) return segments[0]?.toLowerCase();
  if (parsed.hostname === 'boards.greenhouse.io') return segments[0]?.toLowerCase();
  return undefined;
}

function greenhouseJobId(parsed: URL) {
  return clean(parsed.searchParams.get('gh_jid') || parsed.searchParams.get('token'))
    || clean(parsed.pathname.match(/\/jobs\/([^/?#]+)/i)?.[1])
    || clean(parsed.pathname.match(/\/job_app\/([^/?#]+)/i)?.[1])
    || undefined;
}

function greenhouseUrlKind(parsed: URL): NormalizedJobUrl['urlKind'] {
  if (/\/embed\/job_app/i.test(parsed.pathname)) return 'embedded_application';
  if (/\/jobs\//i.test(parsed.pathname)) return 'job_posting';
  return 'hosted_application';
}

function workdayTenant(parsed: URL) {
  const segments = parsed.pathname.split('/').filter(Boolean).slice(0, 2).join('/');
  return `${parsed.hostname.toLowerCase()}:${segments || 'default'}`;
}

function workdayJobId(parsed: URL) {
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

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}

function clean(value: unknown) {
  return String(value || '').trim().replace(/^"|"$/g, '');
}
