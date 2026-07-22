import {
  normalizeEmployer,
  normalizeId,
  normalizeTitle,
  normalizeUrl,
} from './career-os-duplicate-lock';

type JsonRecord = Record<string, unknown>;

export type CanonicalOpportunityIdentity = {
  applyDestinationKey: string;
  atsId: string;
  atsPlatform: string;
  canonicalOpportunityId: string;
  canonicalUrl: string;
  descriptionFingerprint: string;
  employer: string;
  employerKey: string;
  exactIdentityKeys: string[];
  location: string;
  locationKey: string;
  possibleDuplicateKey: string;
  primaryAtsJobId: string;
  primaryRequisitionId: string;
  sourceId: string;
  sourceSighting: CanonicalSourceSighting;
  tenantKey: string;
  title: string;
  titleKey: string;
};

export type CanonicalSourceSighting = {
  active: boolean;
  canonicalUrl: string;
  descriptionFingerprint: string;
  employerUrl: string;
  firstSeenAt: string;
  lastSeenAt: string;
  locationPublished: string;
  postingDate: string;
  postingStatus: string;
  source: string;
  sourceId: string;
  sourceUrl: string;
  titlePublished: string;
};

export function canonicalOpportunityIdentity(record: JsonRecord, sourceType: 'posting' | 'opportunity'): CanonicalOpportunityIdentity {
  const raw = asRecord(record.raw_record);
  const employer = String(sourceType === 'posting' ? record.company || raw.company || raw.employer || '' : record.employer || raw.company || raw.employer || '').trim();
  const title = String(sourceType === 'posting' ? record.title || raw.title || raw.position || '' : record.position || raw.position || raw.title || '').trim();
  const canonicalUrl = String(sourceType === 'posting' ? record.canonical_url || raw.canonical_url || raw.job_url || raw.application_url || '' : record.job_url || raw.job_url || raw.canonical_url || raw.application_url || '').trim();
  const requisition = String(sourceType === 'posting' ? record.external_requisition_id || raw.external_requisition_id || raw.requisition_id || '' : record.requisition || raw.requisition || raw.external_requisition_id || '').trim();
  const atsPlatform = normalizeAtsPlatform(sourceType === 'posting' ? record.ats_platform || raw.ats_platform || asRecord(record.ats_analysis).platform || record.source || raw.platform : record.source || raw.ats_platform || raw.platform);
  const atsId = String(
    sourceType === 'posting'
      ? raw.oracle_job_id || raw.ats_job_id || raw.job_id || raw.id || atsIdFromUrl(canonicalUrl)
      : raw.ats_job_id || raw.job_id || raw.oracle_job_id || atsIdFromUrl(canonicalUrl) || record.id,
  ).trim();
  const applyDestinationKey = normalizeUrl(raw.application_url || raw.apply_url || canonicalUrl || raw.job_url || '');
  const tenantKey = tenantKeyForUrl(canonicalUrl || applyDestinationKey, atsPlatform);
  const employerKey = normalizeEmployer(employer);
  const titleKey = normalizeTitle(title);
  const location = String(record.location || raw.location || '').trim();
  const locationKey = normalizeLocation(location);
  const descriptionFingerprint = canonicalDescriptionFingerprint(
    String(record.normalized_description || record.job_description || raw.normalized_description || raw.job_description || record.evidence || ''),
  );
  const primaryRequisitionId = normalizeId(requisition);
  const primaryAtsJobId = normalizeId(atsId);

  const exactIdentityKeys = [
    employerKey && atsPlatform && tenantKey && primaryRequisitionId ? `${employerKey}:${atsPlatform}:${tenantKey}:req:${primaryRequisitionId}` : '',
    employerKey && atsPlatform && tenantKey && primaryAtsJobId ? `${employerKey}:${atsPlatform}:${tenantKey}:job:${primaryAtsJobId}` : '',
    canonicalUrl ? `url:${normalizeUrl(canonicalUrl)}` : '',
    applyDestinationKey ? `apply:${applyDestinationKey}` : '',
    employerKey && titleKey && locationKey && descriptionFingerprint ? `${employerKey}:strong:${titleKey}:${locationKey}:${descriptionFingerprint}` : '',
  ].filter(Boolean);

  const canonicalOpportunityId = exactIdentityKeys[0]
    || (employerKey && atsPlatform && primaryRequisitionId ? `${employerKey}:${atsPlatform}:req:${primaryRequisitionId}` : '')
    || (employerKey && titleKey && locationKey && descriptionFingerprint ? `${employerKey}:strong:${titleKey}:${locationKey}:${descriptionFingerprint}` : '')
    || String(record.id || '');

  return {
    applyDestinationKey,
    atsId: primaryAtsJobId,
    atsPlatform,
    canonicalOpportunityId,
    canonicalUrl: normalizeUrl(canonicalUrl),
    descriptionFingerprint,
    employer,
    employerKey,
    exactIdentityKeys,
    location,
    locationKey,
    possibleDuplicateKey: [employerKey, titleKey, locationKey].filter(Boolean).join(':'),
    primaryAtsJobId,
    primaryRequisitionId,
    sourceId: String(record.id || ''),
    sourceSighting: buildSourceSighting(record, sourceType, {
      canonicalUrl,
      descriptionFingerprint,
      employerUrl: canonicalUrl,
      location,
      sourceId: String(record.id || ''),
      title,
    }),
    tenantKey,
    title,
    titleKey,
  };
}

export function mergeCanonicalSourceSightings(records: JsonRecord[], sourceType?: 'posting' | 'opportunity') {
  const seen = new Map<string, CanonicalSourceSighting>();
  for (const record of records) {
    const recordType = sourceType || inferSourceType(record);
    const identity = canonicalOpportunityIdentity(record, recordType);
    const key = sourceSightingKey(identity.sourceSighting);
    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, identity.sourceSighting);
      continue;
    }
    seen.set(key, {
      ...existing,
      active: existing.active || identity.sourceSighting.active,
      lastSeenAt: maxTimestamp(existing.lastSeenAt, identity.sourceSighting.lastSeenAt),
      postingStatus: identity.sourceSighting.postingStatus || existing.postingStatus,
    });
  }
  return Array.from(seen.values()).sort((left, right) => left.source.localeCompare(right.source) || left.sourceId.localeCompare(right.sourceId));
}

function inferSourceType(record: JsonRecord): 'posting' | 'opportunity' {
  return Object.prototype.hasOwnProperty.call(record, 'company') || Object.prototype.hasOwnProperty.call(record, 'canonical_url')
    ? 'posting'
    : 'opportunity';
}

export function applicationMatchesCanonicalOpportunity(application: JsonRecord, identity: CanonicalOpportunityIdentity, sourceIds: Set<string>) {
  const raw = asRecord(application.raw_record);
  const opportunityId = String(application.opportunity_id || '');
  if (sourceIds.has(opportunityId)) return true;
  if (sourceIds.has(String(raw.canonical_job_posting_id || ''))) return true;

  const candidateKeys = new Set([
    normalizeId(raw.external_requisition_id || raw.requisition_id || ''),
    normalizeId(raw.ats_job_id || raw.job_id || raw.oracle_job_id || raw.token || ''),
    normalizeUrl(raw.canonical_url || raw.application_url || raw.job_url || raw.posting_url || ''),
    normalizeUrl(raw.apply_url || ''),
  ].filter(Boolean));

  return (
    (identity.primaryRequisitionId && candidateKeys.has(identity.primaryRequisitionId))
    || (identity.primaryAtsJobId && candidateKeys.has(identity.primaryAtsJobId))
    || (identity.canonicalUrl && candidateKeys.has(identity.canonicalUrl))
    || (identity.applyDestinationKey && candidateKeys.has(identity.applyDestinationKey))
  );
}

export function canonicalDescriptionFingerprint(value: string) {
  const normalized = value
    .replace(/<[^>]+>/g, ' ')
    .replace(/\b(equal opportunity employer|privacy policy|candidate privacy notice|benefits include|applicants with disabilities|all qualified applicants.*?)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  return simpleHash(normalized);
}

export function sourceSightingKey(sighting: CanonicalSourceSighting) {
  return [sighting.source, sighting.sourceId, sighting.canonicalUrl || sighting.sourceUrl].filter(Boolean).join(':');
}

function buildSourceSighting(
  record: JsonRecord,
  sourceType: 'posting' | 'opportunity',
  base: {
    canonicalUrl: string;
    descriptionFingerprint: string;
    employerUrl: string;
    location: string;
    sourceId: string;
    title: string;
  },
): CanonicalSourceSighting {
  const raw = asRecord(record.raw_record);
  return {
    active: !String(record.status || record.posting_validation_status || '').toLowerCase().includes('inactive'),
    canonicalUrl: normalizeUrl(base.canonicalUrl),
    descriptionFingerprint: base.descriptionFingerprint,
    employerUrl: normalizeUrl(base.employerUrl),
    firstSeenAt: String(record.created_at || record.discovered_at || record.updated_at || ''),
    lastSeenAt: String(record.updated_at || record.last_checked_at || record.discovered_at || record.created_at || ''),
    locationPublished: base.location,
    postingDate: String(record.created_at || record.discovered_at || ''),
    postingStatus: String(record.posting_validation_status || record.status || ''),
    source: String(sourceType === 'posting' ? raw.source || raw.platform || record.source_run_id || record.ats_platform || 'job_posting' : record.source || raw.source || 'opportunity'),
    sourceId: base.sourceId,
    sourceUrl: normalizeUrl(base.canonicalUrl || String(raw.source_url || raw.posting_url || '')),
    titlePublished: base.title,
  };
}

function normalizeAtsPlatform(value: unknown) {
  return String(value || 'unknown')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    || 'unknown';
}

function tenantKeyForUrl(value: string, atsPlatform: string) {
  const text = String(value || '').trim();
  if (!text) return atsPlatform || 'unknown';
  try {
    const url = new URL(text);
    const host = url.hostname.toLowerCase();
    const segments = url.pathname.split('/').filter(Boolean);
    if (atsPlatform.includes('greenhouse')) return `${host}:${segments[0] || 'default'}`;
    if (atsPlatform.includes('oracle')) return `${host}:${segments.find((segment) => segment.toLowerCase().startsWith('cx_')) || 'default'}`;
    if (atsPlatform.includes('workday')) return `${host}:${segments.slice(0, 2).join('/') || 'default'}`;
    return `${host}:${segments[0] || 'default'}`;
  } catch {
    return atsPlatform || 'unknown';
  }
}

function atsIdFromUrl(value: string) {
  const text = String(value || '').trim();
  if (!text) return '';
  const patterns = [
    /\/job\/([a-z0-9_-]+)$/i,
    /[?&](?:gh_jid|jobSeqNo|jobId|job_id|token)=([a-z0-9_-]+)/i,
    /\/jobs\/([0-9]+)/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1];
  }
  return '';
}

function normalizeLocation(value: string) {
  return String(value || '')
    .toLowerCase()
    .replace(/,\s*united states\b/g, '')
    .replace(/,\s*usa\b/g, '')
    .replace(/\bremote\b/g, 'remote')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function simpleHash(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash).toString(36);
}

function maxTimestamp(left: string, right: string) {
  const leftTime = Date.parse(left || '') || 0;
  const rightTime = Date.parse(right || '') || 0;
  return rightTime >= leftTime ? right : left;
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}
