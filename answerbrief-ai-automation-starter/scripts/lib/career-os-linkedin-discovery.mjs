import crypto from 'node:crypto';
import fs from 'node:fs';

import {
  classifyCompensationPolicy,
} from './career-os-compensation-policy.mjs';
import { parseWorkdayJobUrl } from './career-os-workday-production.mjs';

const LINKEDIN_SOURCE_LABEL = 'linkedin_discovery';
const DEFAULT_LINKEDIN_FEED_URL = 'https://www.linkedin.com/jobs/';
const LINKEDIN_AUTH_PATTERN = /sign in|join linkedin|authwall|verify|checkpoint|login/i;
export const DEFAULT_LINKEDIN_SEARCH_TERMS = [
  'Director Product Management platform',
  'Director Product Management AI',
  'Director Digital Product Management',
  'Senior Director Product Management',
  'Principal Product Manager platform',
  'Lead Product Manager telecom',
  'Product Director customer experience',
  'AI Product Manager enterprise',
  'Platform Product Manager telecom',
  'Technical Product Manager BSS',
  'Director CX Product',
  'Product Owner platform',
  'Director Business Systems product',
  'Agentic AI Product Manager',
];
export const DEFAULT_LINKEDIN_SEARCH_LOCATIONS = [
  'Dallas-Fort Worth Metroplex',
  'Texas, United States',
  'Remote',
  'United States',
];

export function parseLinkedInJobUrl(value) {
  const text = clean(value);
  if (!text) return { generic: false, jobId: '', ok: false, reason: 'missing_url', url: '' };
  let url;
  try {
    url = new URL(text);
  } catch {
    return { generic: false, jobId: '', ok: false, reason: 'invalid_url', url: text };
  }
  if (!/(\.|^)linkedin\.com$/i.test(url.hostname)) {
    return { generic: false, jobId: '', ok: false, reason: 'not_linkedin', url: url.href };
  }
  const path = url.pathname.replace(/\/+$/g, '');
  const viewMatch = path.match(/\/jobs\/view\/(\d+)/i);
  const currentJobId = clean(url.searchParams.get('currentJobId') || url.searchParams.get('jobId'));
  const jobId = clean(viewMatch?.[1] || currentJobId);
  const generic = /^\/jobs$/i.test(path) || /^\/jobs\/search$/i.test(path) || path === '';
  if (!jobId) {
    return {
      generic,
      jobId: '',
      ok: false,
      reason: generic ? 'generic_linkedin_jobs_page_requires_specific_job_records' : 'linkedin_job_id_not_found',
      url: url.href,
    };
  }
  return { generic: false, jobId, ok: true, reason: '', url: url.href };
}

export function buildLinkedInSearchUrl({ keywords, location, datePosted = 'r604800' } = {}) {
  const url = new URL('https://www.linkedin.com/jobs/search/');
  if (clean(keywords)) url.searchParams.set('keywords', clean(keywords));
  if (clean(location)) url.searchParams.set('location', clean(location));
  if (clean(datePosted)) url.searchParams.set('f_TPR', clean(datePosted));
  url.searchParams.set('sortBy', 'R');
  return url.href;
}

export function defaultLinkedInSearchInputs(options = {}) {
  const maxInputs = Math.max(1, Number(options.maxInputs || 12));
  const terms = nonEmptyList(options.terms).length ? nonEmptyList(options.terms) : DEFAULT_LINKEDIN_SEARCH_TERMS;
  const locations = nonEmptyList(options.locations).length ? nonEmptyList(options.locations) : DEFAULT_LINKEDIN_SEARCH_LOCATIONS;
  const inputs = [];
  for (let index = 0; index < terms.length && inputs.length < maxInputs; index += 1) {
    const keywords = terms[index];
    const location = locations[index % locations.length];
    inputs.push({
      keywords,
      location,
      url: buildLinkedInSearchUrl({ keywords, location, datePosted: options.datePosted || 'r604800' }),
    });
  }
  return inputs;
}

export function classifyLinkedInApplyDestination(input = {}) {
  const record = asRecord(input);
  const applyType = normalized(record.applyButtonType || record.apply_button_type || record.buttonText);
  const rawUrl = clean(record.externalApplyFinalUrl || record.external_apply_final_url || record.finalEmployerApplyUrl || record.final_employer_apply_url || record.resolvedApplyUrl || record.resolved_apply_url || record.externalApplyUrl || record.external_apply_url || record.applyUrl || record.apply_url || record.employerApplyUrl || record.employer_apply_url);
  const combined = normalized(`${rawUrl} ${record.destinationText || ''} ${record.pageText || ''} ${applyType}`);
  if (/closed|no longer accepting|unavailable|expired/.test(combined)) {
    return { classification: 'closed_or_unavailable', platform: 'closed', reason: 'LinkedIn or the employer indicates the posting is closed.' };
  }
  if (/easy apply|linkedin apply/.test(applyType) && !rawUrl) {
    return { classification: 'linkedin_easy_apply_deferred', platform: 'linkedin_easy_apply', reason: 'LinkedIn Easy Apply is deferred for this phase.' };
  }
  if (!rawUrl) {
    return { classification: 'employer_site_unknown', platform: 'unknown', reason: 'No external employer apply URL was captured from the LinkedIn record.' };
  }
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return { classification: 'manual_review_required', platform: 'unknown', reason: 'External apply destination is not a valid URL.' };
  }
  const host = url.hostname.toLowerCase();
  const text = `${host} ${url.pathname}`.toLowerCase();
  if (/myworkdayjobs\.com$/.test(host)) {
    const identity = parseWorkdayJobUrl(url.href);
    return {
      classification: identity.ok ? 'workday_resolved' : 'manual_review_required',
      identity,
      platform: 'workday',
      reason: identity.ok ? 'LinkedIn external apply destination resolves to Workday.' : 'Workday destination was found, but tenant or job identity was incomplete.',
      tenant: identity.ok ? identity.tenant : '',
    };
  }
  if (/greenhouse\.io$/.test(host) || host.includes('.greenhouse.io')) {
    return { classification: 'greenhouse_resolved_deferred', platform: 'greenhouse', reason: 'Greenhouse is preserved but deferred during Workday-first production.' };
  }
  if (/lever\.co$/.test(host) || host.includes('.lever.co')) {
    return { classification: 'lever_deferred', platform: 'lever', reason: 'Lever is preserved but deferred during Workday-first production.' };
  }
  if (/icims\.com|icimscloud\.com/.test(text)) {
    return { classification: 'icims_deferred', platform: 'icims', reason: 'iCIMS is preserved but deferred during Workday-first production.' };
  }
  if (/smartrecruiters\.com|jobs\.smartrecruiters\.com/.test(text)) {
    return { classification: 'smartrecruiters_deferred', platform: 'smartrecruiters', reason: 'SmartRecruiters is preserved but deferred during Workday-first production.' };
  }
  if (/oraclecloud\.com|oracle\.com/.test(text)) {
    return { classification: 'oracle_deferred', platform: 'oracle', reason: 'Oracle is out of scope for this Workday-first phase.' };
  }
  if (/successfactors|jobs\.sap\.com/.test(text)) {
    return { classification: 'successfactors_deferred', platform: 'successfactors', reason: 'SuccessFactors is out of scope for this phase.' };
  }
  if (/phenompeople|phenom\.com/.test(text)) {
    return { classification: 'phenom_deferred', platform: 'phenom', reason: 'Phenom is preserved but deferred during Workday-first production.' };
  }
  if (/linkedin\.com/.test(host)) {
    return { classification: 'linkedin_easy_apply_deferred', platform: 'linkedin_easy_apply', reason: 'LinkedIn-hosted application flow is deferred.' };
  }
  return { classification: 'employer_site_unknown', platform: 'unknown', reason: 'Employer destination is not currently a supported Workday URL.' };
}

export function loadLinkedInDiscoveryRecordsFromEnv(env = process.env) {
  const records = [];
  const errors = [];
  const filePath = clean(env.CAREER_OS_LINKEDIN_RECORDS_FILE);
  const jsonValue = clean(env.CAREER_OS_LINKEDIN_JOB_RECORDS_JSON);
  const urlsValue = String(env.CAREER_OS_LINKEDIN_JOB_URLS || env.CAREER_OS_LINKEDIN_SOURCE_URLS || '').trim();

  if (filePath) {
    try {
      records.push(...coerceRecordArray(JSON.parse(fs.readFileSync(filePath, 'utf8'))));
    } catch (error) {
      errors.push(`linkedin_records_file: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (jsonValue) {
    try {
      records.push(...coerceRecordArray(JSON.parse(jsonValue)));
    } catch (error) {
      errors.push(`linkedin_records_json: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (urlsValue) {
    for (const url of urlsValue.split(/[\n,]+/).map(clean).filter(Boolean)) {
      records.push({ linkedinJobUrl: url });
    }
  }

  return {
    errors,
    records: dedupeLinkedInJobRecords(records),
    requested: Boolean(filePath || jsonValue || urlsValue),
    sourceUrl: 'https://www.linkedin.com/jobs/',
  };
}

export function normalizeLinkedInJobRecords(records = [], options = {}) {
  const postings = [];
  const deferred = [];
  const rejected = [];
  const errors = [];
  for (const record of dedupeLinkedInJobRecords(records)) {
    const normalizedRecord = normalizeLinkedInJobRecord(record, options);
    if (normalizedRecord.ok && normalizedRecord.posting) {
      postings.push(normalizedRecord.posting);
      if (normalizedRecord.deferred) deferred.push(normalizedRecord);
    }
    else if (normalizedRecord.deferred) deferred.push(normalizedRecord);
    else {
      rejected.push(normalizedRecord);
      if (normalizedRecord.reason) errors.push(normalizedRecord.reason);
    }
  }
  const summary = summarizeLinkedInDiscovery({ deferred, postings, rejected });
  return { deferred, errors, postings, rejected, summary };
}

export function normalizeLinkedInJobRecord(input = {}, options = {}) {
  const record = asRecord(input);
  const now = clean(options.now) || new Date().toISOString();
  const ownerEmail = clean(options.ownerEmail) || 'tomas@nieves.com';
  const sourceRunId = clean(options.sourceRunId) || `linkedin-discovery-${dateKey(now)}`;
  const linkedin = parseLinkedInJobUrl(record.linkedinJobUrl || record.linkedin_job_url || record.url || record.sourceUrl);
  const title = clean(record.title || record.jobTitle || record.job_title);
  const company = clean(record.company || record.companyName || record.company_name || record.employer);
  const location = clean(record.location || record.locationText || record.location_text);
  const description = htmlToText(clean(record.description || record.jobDescription || record.job_description));
  if (!linkedin.ok && !title && !company) {
    return {
      deferred: false,
      ok: false,
      reason: linkedin.reason || 'linkedin_record_missing_job_identity',
      sourceLabel: LINKEDIN_SOURCE_LABEL,
    };
  }

  const destination = classifyLinkedInApplyDestination(record);
  const compensation = extractCompensation(`${record.salary || ''} ${record.compensation || ''} ${record.compensationText || ''} ${description}`);
  const scoredFromDetail = scoreLinkedInRecord({ title, location, description });
  const score = clampScore(Math.max(Number(record.fitScore || record.fit_score) || 0, scoredFromDetail));
  const quality = classifyLinkedInQuality({ compensation, description, destination, location, score, title });
  const requisition = clean(record.requisition || record.requisitionId || record.jobId || record.job_id || destination.identity?.jobId || linkedin.jobId);
  const canonicalUrl = clean(record.externalApplyUrl || record.external_apply_url || record.applyUrl || record.employerApplyUrl || record.linkedinJobUrl || linkedin.url);
  const workdayIdentity = destination.classification === 'workday_resolved' ? destination.identity : null;
  const routeToWorkday = Boolean(destination.classification === 'workday_resolved' && quality.routeToWorkday && workdayIdentity?.ok);
  const status = routeToWorkday
    ? 'discovered'
    : destination.classification === 'greenhouse_resolved_deferred'
      ? 'deferred_phase_two_greenhouse'
      : destination.classification === 'linkedin_easy_apply_deferred'
        ? 'linkedin_easy_apply_deferred_or_manual'
        : destination.classification !== 'workday_resolved'
          ? destination.classification
          : quality.status;

  const posting = {
    id: linkedInPostingId({ company, destination, linkedinJobId: linkedin.jobId, requisition, title }),
    source_run_id: sourceRunId,
    owner_email: ownerEmail,
    company: company || clean(record.employer) || 'LinkedIn Employer',
    title: title || 'LinkedIn Role',
    location,
    work_arrangement: classifyWorkArrangement(`${location} ${description}`),
    compensation_min_usd: compensation.minUsd,
    compensation_max_usd: compensation.maxUsd,
    compensation_text: compensation.text,
    canonical_url: canonicalUrl,
    external_requisition_id: requisition,
    job_description: description,
    normalized_description: description.slice(0, 12000),
    posting_validation_status: destination.classification === 'closed_or_unavailable' ? 'closed' : 'active',
    last_checked_at: now,
    raw_record: {
      ...redactedRecord(record),
      ats_platform: routeToWorkday ? 'workday' : destination.platform,
      compensation_policy_status: quality.compensationPolicy?.status || '',
      compensation_policy_warnings: quality.compensationPolicy?.warnings || [],
      destination_classification: destination.classification,
      employer_apply_final_url: clean(record.externalApplyFinalUrl || record.external_apply_final_url || record.finalEmployerApplyUrl || record.final_employer_apply_url || record.resolvedApplyUrl || record.resolved_apply_url),
      detail_opened: Boolean(record.detailOpened || record.detail_opened),
      employer_apply_url: clean(record.externalApplyUrl || record.external_apply_url || record.applyUrl || record.employerApplyUrl),
      employer_apply_resolved: Boolean(clean(record.externalApplyUrl || record.external_apply_url || record.applyUrl || record.employerApplyUrl)),
      feed_cards_inspected: Number(record.feedCardsInspected || record.feed_cards_inspected || 0) || null,
      linkedin_job_id: linkedin.jobId,
      linkedin_job_url: linkedin.url || clean(record.linkedinJobUrl || record.linkedin_job_url || record.url),
      linkedin_routing: routeToWorkday ? 'queued_to_workday' : status,
      linkedin_search_location: clean(record.linkedinSearchLocation || record.linkedin_search_location),
      linkedin_search_term: clean(record.linkedinSearchTerm || record.linkedin_search_term),
      quality_gate_status: quality.status,
      requires_tailored_cover_letter: quality.requiresCoverLetter,
      source_capture_type: clean(record.sourceCaptureType || record.source_capture_type),
      source_evidence_path: clean(record.sourceEvidencePath || record.source_evidence_path),
      source_label: LINKEDIN_SOURCE_LABEL,
      source_url: linkedin.url || clean(record.linkedinJobUrl || record.linkedin_job_url || record.url),
      tenant: workdayIdentity?.tenant || '',
      workday_job_id: workdayIdentity?.jobId || '',
    },
    fit_score: score,
    ats_analysis: {
      method: 'linkedin_discovery_destination_resolution_v1',
      risks: quality.holdReasons,
      score,
      signals: linkedInSignals({ title, description }),
    },
    ai_readiness_analysis: {
      method: 'linkedin_discovery_readiness_v1',
      score: scoreAiReadiness(description),
      signals: ['platform', 'ai', 'automation', 'customer experience'].filter((signal) => normalized(description).includes(signal)),
    },
    recruiter_intelligence: {
      decision: routeToWorkday ? 'worth_applying' : 'defer_or_review',
      location: location || 'not published',
      salary: compensation.text || 'not published',
      score,
    },
    hiring_manager_evidence_matrix: buildLinkedInEvidenceMatrix(description),
    selected_for_pilot: false,
    status,
    created_at: now,
    updated_at: now,
  };

  return {
    deferred: !routeToWorkday,
    destination,
    ok: true,
    posting,
    quality,
    reason: routeToWorkday ? '' : destination.reason || quality.holdReasons.join('; '),
    routeToWorkday,
    sourceLabel: LINKEDIN_SOURCE_LABEL,
  };
}

export function summarizeLinkedInDiscovery({ postings = [], deferred = [], rejected = [] } = {}) {
  const all = [...postings, ...rejected.map((item) => item.posting).filter(Boolean)];
  const countByDestination = (classification) => all.filter((posting) => asRecord(posting.raw_record).destination_classification === classification).length;
  const rawRecords = all.map((posting) => asRecord(posting.raw_record));
  const feedCardsInspected = Math.max(0, ...rawRecords.map((record) => Number(record.feed_cards_inspected || 0)));
  const holdReasonCounts = new Map();
  for (const posting of all) {
    const risks = Array.isArray(asRecord(posting.ats_analysis).risks) ? asRecord(posting.ats_analysis).risks : [];
    for (const risk of risks.map(clean).filter(Boolean)) {
      holdReasonCounts.set(risk, (holdReasonCounts.get(risk) || 0) + 1);
    }
  }
  const topHoldReasons = Array.from(holdReasonCounts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 8)
    .map(([reason, count]) => ({ count, reason }));
  const searchTermsUsed = uniqueList(rawRecords.map((record) => record.linkedin_search_term));
  const searchLocationsUsed = uniqueList(rawRecords.map((record) => record.linkedin_search_location));
  const compensationStatusCount = (status) => rawRecords.filter((record) => clean(record.compensation_policy_status) === status).length;
  return {
    captured: all.length,
    compBelowFloorReject: compensationStatusCount('comp_below_floor_reject'),
    compNearFloorReview: compensationStatusCount('comp_near_floor_review'),
    compUnknownHold: compensationStatusCount('comp_unknown_hold') + compensationStatusCount('comp_not_posted') + compensationStatusCount('comp_parse_uncertain'),
    compUnknownStrongFit: compensationStatusCount('comp_unknown_strong_fit'),
    deferred: deferred.length,
    easyApplyDeferred: countByDestination('linkedin_easy_apply_deferred'),
    employerApplyLinksResolved: rawRecords.filter((record) => Boolean(clean(record.employer_apply_url))).length,
    feedCardsInspected,
    feedJobsClicked: rawRecords.filter((record) => Boolean(record.detail_opened)).length,
    greenhouseDeferred: countByDestination('greenhouse_resolved_deferred'),
    inspected: all.length + rejected.length,
    rejected: rejected.length,
    rejectedByQualityGate: all.filter((posting) => asRecord(posting.raw_record).linkedin_routing !== 'queued_to_workday').length,
    searchLocationsUsed,
    searchTermsUsed,
    topHoldReasons,
    workdayQueued: all.filter((posting) => asRecord(posting.raw_record).linkedin_routing === 'queued_to_workday').length,
    workdayResolved: countByDestination('workday_resolved'),
  };
}

export function buildLinkedInSourceStatus({ errors = [], records = [], summary = {}, sourceUrl = 'https://www.linkedin.com/jobs/' } = {}) {
  return {
    ats: 'linkedin_discovery',
    board: 'linkedin_jobs',
    business_type: 'market discovery',
    category: 'linkedin_discovery',
    employer: 'LinkedIn Jobs',
    error: errors.join('; '),
    feed_cards_inspected: Number(summary.feedCardsInspected || 0),
    feed_jobs_clicked: Number(summary.feedJobsClicked || 0),
    jobs_reviewed: Number(summary.inspected || records.length || 0),
    linkedin_comp_below_floor_reject: Number(summary.compBelowFloorReject || 0),
    linkedin_comp_near_floor_review: Number(summary.compNearFloorReview || 0),
    linkedin_comp_unknown_strong_fit: Number(summary.compUnknownStrongFit || 0),
    linkedin_employer_apply_links_resolved: Number(summary.employerApplyLinksResolved || 0),
    source: LINKEDIN_SOURCE_LABEL,
    source_url: sourceUrl,
    status: errors.length && !Number(summary.inspected || 0) ? 'failed' : 'succeeded',
    search_locations_used: Array.isArray(summary.searchLocationsUsed) ? summary.searchLocationsUsed : [],
    search_terms_used: Array.isArray(summary.searchTermsUsed) ? summary.searchTermsUsed : [],
    top_hold_reasons: Array.isArray(summary.topHoldReasons) ? summary.topHoldReasons : [],
  };
}

export function isLinkedInDiscoveryPosting(posting = {}) {
  const raw = asRecord(posting.raw_record);
  return clean(raw.source_label) === LINKEDIN_SOURCE_LABEL || Boolean(clean(raw.linkedin_job_url));
}

export function dedupeLinkedInJobRecords(records = []) {
  const seen = new Set();
  const deduped = [];
  for (const record of records.map(asRecord)) {
    const linkedin = parseLinkedInJobUrl(record.linkedinJobUrl || record.linkedin_job_url || record.url || record.sourceUrl);
    const key = linkedin.jobId
      || clean(record.externalApplyUrl || record.external_apply_url || record.applyUrl || record.employerApplyUrl)
      || linkedin.url
      || clean(record.linkedinJobUrl || record.linkedin_job_url || record.url || record.sourceUrl)
      || `${normalized(record.company || record.employer)}:${normalized(record.title)}:${normalized(record.location)}`;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    deduped.push(record);
  }
  return deduped;
}

export function scoreLinkedInFeedRecord(input = {}) {
  const record = asRecord(input);
  return clampScore(Number(record.fitScore || record.fit_score) || scoreLinkedInRecord({
    description: htmlToText(clean(record.description || record.jobDescription || record.job_description || record.cardText || record.card_text)),
    location: clean(record.location || record.locationText || record.location_text),
    title: clean(record.title || record.jobTitle || record.job_title),
  }));
}

export function rankLinkedInFeedRecords(records = [], options = {}) {
  const limit = Number(options.limit || records.length || 0) || records.length;
  return dedupeLinkedInJobRecords(records)
    .map((record) => ({ ...record, fitScore: scoreLinkedInFeedRecord(record) }))
    .sort((a, b) => Number(b.fitScore || 0) - Number(a.fitScore || 0)
      || clean(a.company || a.employer).localeCompare(clean(b.company || b.employer))
      || clean(a.title || a.jobTitle).localeCompare(clean(b.title || b.jobTitle)))
    .slice(0, limit || undefined);
}

export async function extractLinkedInFeedCardsFromPage(page, options = {}) {
  const limit = Math.max(1, Number(options.limit || options.maxCards || 25));
  const now = clean(options.now) || new Date().toISOString();
  const sourceEvidencePath = clean(options.sourceEvidencePath || options.source_evidence_path);
  const sourceUrl = clean(options.sourceUrl || await safePageUrl(page) || DEFAULT_LINKEDIN_FEED_URL);
  const searchTerm = clean(options.searchTerm || options.linkedinSearchTerm || options.linkedin_search_term);
  const searchLocation = clean(options.searchLocation || options.linkedinSearchLocation || options.linkedin_search_location);
  const records = await page.evaluate(({ limit: evaluateLimit, now: evaluatedAt, searchLocation: evaluatedSearchLocation, searchTerm: evaluatedSearchTerm, sourceEvidencePath: evidencePath, sourceUrl: evaluatedSourceUrl }) => {
    const cleanText = (value) => String(value || '').replace(/\s+/g, ' ').trim();
    const normalize = (value) => cleanText(value).toLowerCase();
    const cleanTitle = (value) => {
      const title = cleanText(value).replace(/\(Verified job\)/gi, '').replace(/\bVerified job\b/gi, '');
      return /^0 notifications$/i.test(title) || /^skip to /i.test(title) ? '' : title;
    };
    const visible = (element) => {
      if (!element || typeof element.getBoundingClientRect !== 'function') return false;
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
    };
    const absoluteUrl = (value) => {
      try {
        const url = new URL(value, window.location.href);
        url.hash = '';
        return url.href;
      } catch {
        return '';
      }
    };
    const linkedinJobId = (value) => {
      const url = absoluteUrl(value);
      if (!url) return '';
      try {
        const parsed = new URL(url);
        const viewMatch = parsed.pathname.match(/\/jobs\/view\/(\d+)/i);
        return cleanText(viewMatch?.[1] || parsed.searchParams.get('currentJobId') || parsed.searchParams.get('jobId'));
      } catch {
        return '';
      }
    };
    const canonicalJobUrl = (value) => {
      const id = linkedinJobId(value);
      if (id) return `https://www.linkedin.com/jobs/view/${id}/`;
      return absoluteUrl(value);
    };
    const firstText = (root, selectors) => {
      for (const selector of selectors) {
        const element = root.querySelector(selector);
        const text = cleanText(element?.innerText || element?.textContent || element?.getAttribute?.('aria-label'));
        if (text) return text;
      }
      return '';
    };
    const usefulLines = (text) => cleanText(text).split(/\n| {2,}/).map(cleanText).filter(Boolean);
    const cardIdentityFromText = (text) => {
      const rawCleaned = cleanText(text);
      const verifiedTitle = cleanText((rawCleaned.match(/^(.+?)\s*(?:\(|\b)Verified job(?:\)|\b)/i) || [])[1] || '');
      const cleaned = rawCleaned.replace(/\(Verified job\)/gi, '').replace(/\bVerified job\b/gi, '');
      const rawLines = String(text || '').split(/\n+/).map((line) => cleanText(line).replace(/\(Verified job\)/gi, '').replace(/\bVerified job\b/gi, '')).filter(Boolean);
      const skipped = new Set(['posted', 'promoted', 'applied', 'you’d be a top applicant', 'you would be a top applicant']);
      const lines = rawLines.filter((line) => !Array.from(skipped).some((token) => normalize(line).startsWith(token)));
      const title = cleanText(verifiedTitle || lines[0] || cleaned.split('•')[0] || '');
      let company = '';
      if (lines.length >= 3 && normalize(lines[1]) === normalize(title)) {
        company = cleanText(lines[2].split('•')[0]);
      } else if (lines.length >= 2 && !normalize(lines[1]).includes(normalize(title))) {
        company = cleanText(lines[1].split('•')[0]);
      } else if (title && cleaned.includes(title)) {
        const afterTitle = cleanText(cleaned.slice(cleaned.indexOf(title) + title.length));
        const afterRepeat = normalize(afterTitle).startsWith(normalize(title))
          ? cleanText(afterTitle.slice(title.length))
          : afterTitle;
        company = cleanText(afterRepeat.split('•')[0]);
      }
      const location = cleanText((cleaned.split('•')[1] || '').replace(/\b(?:401\(k\)|medical|vision|dental|benefits?).*$/i, ''));
      return { company, location, title };
    };
    const titleFromAnchor = (anchor) => {
      const raw = cleanText(anchor.innerText || anchor.textContent || anchor.getAttribute('aria-label'));
      if (!raw) return '';
      const labelMatch = raw.match(/^(.+?)\s+at\s+.+$/i);
      return cleanText(labelMatch?.[1] || cardIdentityFromText(raw).title || raw.replace(/\bwith verification\b/ig, ''));
    };
    const companyFromAnchorLabel = (anchor) => {
      const raw = cleanText(anchor.getAttribute('aria-label') || anchor.innerText || anchor.textContent);
      const match = raw.match(/^.+?\s+at\s+(.+?)(?:\s+with verification)?$/i);
      return cleanText(match?.[1] || '');
    };
    const postedDate = (text) => {
      const match = cleanText(text).match(/\b(?:reposted\s+)?(?:just now|\d+\s+(?:minute|hour|day|week|month)s?\s+ago)\b/i);
      return cleanText(match?.[0] || '');
    };
    const salary = (text) => {
      const match = cleanText(text).match(/\$[0-9][0-9,]*(?:\.\d+)?\s*(?:k|K)?(?:\s*[-–]\s*\$?[0-9][0-9,]*(?:\.\d+)?\s*(?:k|K)?)?/);
      return cleanText(match?.[0] || '');
    };
    const selectorFor = (element) => {
      if (!element) return '';
      const testId = element.getAttribute('data-job-id') || element.getAttribute('data-occludable-job-id');
      if (testId) return `[data-job-id="${testId}"]`;
      const id = element.id ? `#${CSS.escape(element.id)}` : '';
      if (id) return id;
      const className = cleanText(String(element.className || '')).split(' ').filter(Boolean).slice(0, 3).map((name) => `.${CSS.escape(name)}`).join('');
      return `${element.tagName.toLowerCase()}${className}`;
    };
    const anchors = Array.from(document.querySelectorAll('a[href*="/jobs/view/"], a[href*="currentJobId="]')).filter(visible);
    const seen = new Set();
    const records = [];
    for (const anchor of anchors) {
      const url = canonicalJobUrl(anchor.getAttribute('href') || anchor.href);
      const jobId = linkedinJobId(url);
      if (!jobId || seen.has(jobId)) continue;
      const card = anchor.closest('[data-job-id], [data-occludable-job-id], li.jobs-search-results__list-item, li.scaffold-layout__list-item, .job-card-container, .jobs-job-board-list__item, li') || anchor;
      if (!visible(card)) continue;
      const text = cleanText(card.innerText || card.textContent);
      const lines = usefulLines(card.innerText || card.textContent);
      const anchorIdentity = cardIdentityFromText(anchor.innerText || anchor.textContent || anchor.getAttribute('aria-label'));
      const cardIdentity = cardIdentityFromText(card.innerText || card.textContent || anchor.innerText || anchor.textContent);
      const title = cleanTitle(anchorIdentity.title) || firstText(card, [
        '.job-card-list__title',
        '.job-card-list__title--link',
        '.artdeco-entity-lockup__title',
        '[class*="title"]',
      ]) || titleFromAnchor(anchor) || cleanTitle(cardIdentity.title) || lines[0] || '';
      const company = anchorIdentity.company || cardIdentity.company || firstText(card, [
        '.job-card-container__company-name',
        '.job-card-container__primary-description',
        '.artdeco-entity-lockup__subtitle',
        '[class*="company"]',
        '[class*="subtitle"]',
      ]) || companyFromAnchorLabel(anchor) || lines.find((line) => line !== title && !/promoted|reposted|easy apply|viewed|ago/i.test(line)) || '';
      const location = anchorIdentity.location || cardIdentity.location || firstText(card, [
        '.job-card-container__metadata-item',
        '.job-card-container__metadata-wrapper',
        '.artdeco-entity-lockup__caption',
        '[class*="metadata"]',
        '[class*="location"]',
      ]) || lines.find((line) => /remote|hybrid|onsite|on-site|united states|, [A-Z]{2}\b|texas|california|new york|washington|florida|georgia|illinois|virginia/i.test(line)) || '';
      const applyButtonType = /easy apply/i.test(text) ? 'Easy Apply' : '';
      const arrangement = /remote/i.test(`${location} ${text}`) ? 'remote' : /hybrid/i.test(`${location} ${text}`) ? 'hybrid' : /on[- ]?site/i.test(`${location} ${text}`) ? 'onsite' : '';
      seen.add(jobId);
      records.push({
        applyButtonType,
        cardSelector: selectorFor(card),
        cardText: text.slice(0, 1200),
        company,
        discoveredAt: evaluatedAt,
        feedCardsInspected: 0,
        jobId,
        linkedinJobId: jobId,
        linkedinJobUrl: url,
        linkedinSearchLocation: evaluatedSearchLocation,
        linkedinSearchTerm: evaluatedSearchTerm,
        location,
        postedDate: postedDate(text),
        promoted: /promoted/i.test(text),
        remoteHybridOnsite: arrangement,
        reposted: /reposted/i.test(text),
        salary: salary(text),
        sourceCaptureType: 'authenticated_linkedin_feed_card',
        sourceEvidencePath: evidencePath,
        sourceUrl: evaluatedSourceUrl,
        title,
      });
      if (records.length >= evaluateLimit) break;
    }
    return records.map((record) => ({ ...record, feedCardsInspected: records.length }));
  }, { limit, now, searchLocation, searchTerm, sourceEvidencePath, sourceUrl });
  return dedupeLinkedInJobRecords(records).slice(0, limit);
}

export async function extractLinkedInJobDetailFromPage(page, seed = {}, options = {}) {
  const now = clean(options.now) || clean(asRecord(seed).discoveredAt) || new Date().toISOString();
  const sourceEvidencePath = clean(options.sourceEvidencePath || asRecord(seed).sourceEvidencePath || asRecord(seed).source_evidence_path);
  const sourceUrl = clean(options.sourceUrl || asRecord(seed).sourceUrl || await safePageUrl(page));
  const detail = await page.evaluate(({ now: evaluatedAt, sourceEvidencePath: evidencePath, sourceUrl: evaluatedSourceUrl }) => {
    const cleanText = (value) => String(value || '').replace(/\s+/g, ' ').trim();
    const visible = (element) => {
      if (!element || typeof element.getBoundingClientRect !== 'function') return false;
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
    };
    const firstText = (selectors) => {
      for (const selector of selectors) {
        const element = document.querySelector(selector);
        const text = cleanText(element?.innerText || element?.textContent || element?.getAttribute?.('aria-label'));
        if (text) return text;
      }
      return '';
    };
    const firstHref = (selectors) => {
      for (const selector of selectors) {
        const element = document.querySelector(selector);
        const href = element?.getAttribute?.('href') || element?.href;
        if (!href) continue;
        try {
          const url = new URL(href, window.location.href);
          url.hash = '';
          return url.href;
        } catch {}
      }
      return '';
    };
    const jobIdFromUrl = (value) => {
      try {
        const url = new URL(value, window.location.href);
        const viewMatch = url.pathname.match(/\/jobs\/view\/(\d+)/i);
        return cleanText(viewMatch?.[1] || url.searchParams.get('currentJobId') || url.searchParams.get('jobId'));
      } catch {
        return '';
      }
    };
    const applyCandidates = Array.from(document.querySelectorAll('a[href], button')).filter(visible).map((element) => {
      const text = cleanText(element.innerText || element.textContent || element.getAttribute('aria-label') || element.getAttribute('title'));
      const href = element.getAttribute('href') || element.href || element.closest?.('a[href]')?.href || '';
      return { href, text, tag: element.tagName.toLowerCase() };
    }).filter((item) => /apply|no longer accepting|unavailable/i.test(`${item.text} ${item.href}`));
    const primaryApply = applyCandidates.find((item) => /easy apply/i.test(item.text))
      || applyCandidates.find((item) => /apply/i.test(item.text))
      || applyCandidates[0]
      || {};
    const externalApplyUrl = firstHref([
      'a[href*="myworkdayjobs.com"]',
      'a[href*="greenhouse.io"]',
      'a[href*="oraclecloud.com"]',
      'a[href*="successfactors"]',
      'a[href*="jobs.sap.com"]',
      'a[href*="workdayjobs.com"]',
    ]) || (primaryApply.href && !/linkedin\.com/i.test(primaryApply.href) ? primaryApply.href : '');
    const description = firstText([
      '.jobs-description__content',
      '.jobs-description-content__text',
      '.jobs-box__html-content',
      '.jobs-description',
      '[class*="jobs-description"]',
      'main',
    ]);
    const pageText = cleanText(document.body?.innerText || '');
    const company = firstText([
      '.job-details-jobs-unified-top-card__company-name',
      '.jobs-unified-top-card__company-name',
      '.topcard__org-name-link',
      '[class*="company-name"]',
    ]);
    const location = firstText([
      '.job-details-jobs-unified-top-card__primary-description-container',
      '.jobs-unified-top-card__bullet',
      '.topcard__flavor--bullet',
      '[class*="location"]',
    ]);
    const title = firstText([
      '.job-details-jobs-unified-top-card__job-title',
      '.jobs-unified-top-card__job-title',
      '.topcard__title',
      'h1',
      'h2',
    ]);
    return {
      applicationUnavailable: /no longer accepting applications|job is no longer available|expired|closed/i.test(pageText),
      applyButtonType: cleanText(primaryApply.text || ''),
      description,
      detailOpened: true,
      discoveredAt: evaluatedAt,
      externalApplyUrl,
      jobId: jobIdFromUrl(window.location.href),
      linkedinJobId: jobIdFromUrl(window.location.href),
      linkedinJobUrl: jobIdFromUrl(window.location.href) ? `https://www.linkedin.com/jobs/view/${jobIdFromUrl(window.location.href)}/` : window.location.href,
      sourceCaptureType: 'authenticated_linkedin_detail_pane',
      sourceEvidencePath: evidencePath,
      sourceUrl: evaluatedSourceUrl,
      title,
      company,
      location,
    };
  }, { now, sourceEvidencePath, sourceUrl });
  return mergeLinkedInRecords(asRecord(seed), detail);
}

export async function discoverLinkedInFeedFromAuthenticatedPage(page, options = {}) {
  const feedUrl = clean(options.feedUrl || DEFAULT_LINKEDIN_FEED_URL);
  const maxCards = Math.max(1, Number(options.maxCards || 25));
  const maxDetails = Math.max(0, Number(options.maxDetails || 10));
  const maxWorkdayRoutes = Math.max(0, Number(options.maxWorkdayRoutes || 5));
  const now = clean(options.now) || new Date().toISOString();
  const sourceEvidencePath = clean(options.sourceEvidencePath);
  const errors = [];
  if (options.navigate !== false && feedUrl) {
    await page.goto(feedUrl, { waitUntil: 'domcontentloaded', timeout: Number(options.navigationTimeoutMs || 30000) });
  }
  await page.waitForLoadState('domcontentloaded', { timeout: Number(options.navigationTimeoutMs || 30000) }).catch(() => {});
  await page.waitForTimeout(Number(options.hydrationDelayMs || 1500)).catch(() => {});
  const pageText = await safeBodyText(page);
  if (LINKEDIN_AUTH_PATTERN.test(pageText) && !/jobs that match|jobs for you|top applicant|easy apply|promoted/i.test(pageText)) {
    return {
      cards: [],
      details: [],
      errors: ['LinkedIn authenticated jobs feed was not visible.'],
      ok: false,
      reason: 'linkedin_authenticated_session_required',
      records: [],
      sourceUrl: feedUrl,
      summary: {
        captured: 0,
        employerApplyLinksResolved: 0,
        feedCardsInspected: 0,
        feedJobsClicked: 0,
      },
    };
  }
  const cards = await extractLinkedInFeedCardsFromPage(page, {
    limit: maxCards,
    now,
    searchLocation: options.searchLocation,
    searchTerm: options.searchTerm,
    sourceEvidencePath,
    sourceUrl: feedUrl,
  });
  if (!cards.length) {
    return {
      cards,
      details: [],
      errors: ['No visible LinkedIn job cards with /jobs/view/ links were captured from the authenticated feed.'],
      ok: false,
      reason: 'linkedin_page_structure_not_supported',
      records: [],
      sourceUrl: feedUrl,
      summary: {
        captured: 0,
        employerApplyLinksResolved: 0,
        feedCardsInspected: 0,
        feedJobsClicked: 0,
      },
    };
  }

  const ranked = rankLinkedInFeedRecords(cards, { limit: maxDetails });
  const details = [];
  let workdayRoutes = 0;
  for (const card of ranked) {
    if (workdayRoutes >= maxWorkdayRoutes) break;
    try {
      const context = page.context();
      const detailPage = await context.newPage();
      try {
        await detailPage.goto(clean(card.linkedinJobUrl), { waitUntil: 'domcontentloaded', timeout: Number(options.detailNavigationTimeoutMs || 30000) });
        await detailPage.waitForTimeout(Number(options.detailHydrationDelayMs || 1000)).catch(() => {});
        let detail = await extractLinkedInJobDetailFromPage(detailPage, card, {
          now,
          sourceEvidencePath,
          sourceUrl: feedUrl,
        });
        detail = await resolveLinkedInExternalApplyUrl(detailPage, detail, {
          clickExternalApply: options.clickExternalApply !== false,
          timeoutMs: Number(options.applyResolutionTimeoutMs || 6000),
        });
        details.push(detail);
        if (classifyLinkedInApplyDestination(detail).classification === 'workday_resolved') workdayRoutes += 1;
      } finally {
        await detailPage.close().catch(() => {});
      }
    } catch (error) {
      errors.push(`${clean(card.title || card.linkedinJobUrl)}: ${error instanceof Error ? error.message : String(error)}`);
      details.push({
        ...card,
        detailOpened: false,
        detailError: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const openedIds = new Set(details.map((record) => clean(record.linkedinJobId || record.jobId)).filter(Boolean));
  const records = dedupeLinkedInJobRecords([
    ...details,
    ...cards.filter((card) => !openedIds.has(clean(card.linkedinJobId || card.jobId))),
  ]).map((record) => ({
    ...record,
    feedCardsInspected: cards.length,
    sourceEvidencePath,
  }));
  const normalizedRecords = normalizeLinkedInJobRecords(records, { now });
  return {
    cards,
    details,
    errors,
    ok: true,
    records,
    sourceUrl: feedUrl,
    summary: {
      ...normalizedRecords.summary,
      captured: records.length,
      employerApplyLinksResolved: records.filter((record) => clean(record.externalApplyUrl || record.external_apply_url || record.applyUrl || record.employerApplyUrl)).length,
      feedCardsInspected: cards.length,
      feedJobsClicked: details.filter((record) => record.detailOpened !== false).length,
    },
  };
}

export async function resolveLinkedInExternalApplyUrl(page, input = {}, options = {}) {
  const record = asRecord(input);
  if (clean(record.externalApplyFinalUrl || record.external_apply_final_url || record.finalEmployerApplyUrl || record.final_employer_apply_url || record.resolvedApplyUrl || record.resolved_apply_url)) return record;
  const applyButtonType = clean(record.applyButtonType || record.apply_button_type);
  if (/easy apply/i.test(applyButtonType)) return record;
  const clickExternalApply = options.clickExternalApply !== false;
  const timeoutMs = Math.max(1000, Number(options.timeoutMs || 6000));
  const direct = await page.evaluate(() => {
    const cleanText = (value) => String(value || '').replace(/\s+/g, ' ').trim();
    const visible = (element) => {
      if (!element || typeof element.getBoundingClientRect !== 'function') return false;
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
    };
    const buttons = Array.from(document.querySelectorAll('a[href], button')).filter(visible).map((element, index) => {
      const text = cleanText(element.innerText || element.textContent || element.getAttribute('aria-label') || element.getAttribute('title'));
      const href = element.getAttribute('href') || element.href || element.closest?.('a[href]')?.href || '';
      return { href, index, text };
    }).filter((item) => /apply/i.test(item.text));
    const easyApply = buttons.find((item) => /easy apply/i.test(item.text));
    if (easyApply) return { applyButtonType: cleanText(easyApply.text), externalApplyUrl: '', index: easyApply.index, shouldClick: false };
    const external = buttons.find((item) => item.href && !/linkedin\.com/i.test(item.href));
    if (external) return { applyButtonType: cleanText(external.text), externalApplyUrl: external.href, index: external.index, shouldClick: false };
    const apply = buttons.find((item) => /apply/i.test(item.text));
    return { applyButtonType: cleanText(apply?.text || ''), externalApplyUrl: '', index: apply?.index ?? -1, shouldClick: Boolean(apply) };
  });
  const merged = mergeLinkedInRecords(record, {
    applyButtonType: clean(direct.applyButtonType) || applyButtonType,
    externalApplyUrl: clean(direct.externalApplyUrl),
  });
  if (clean(merged.externalApplyUrl)) {
    return resolveEmployerApplyDestination(page.context(), merged, { timeoutMs });
  }
  if (!clickExternalApply || !direct.shouldClick) return merged;

  const beforeUrl = await safePageUrl(page);
  const context = page.context();
  const popupPromise = context.waitForEvent('page', { timeout: timeoutMs }).catch(() => null);
  const navigationPromise = page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: timeoutMs }).catch(() => null);
  const clicked = await clickFirstExternalLinkedInApplyButton(page, timeoutMs);
  if (!clicked) return merged;
  const popup = await popupPromise;
  if (popup) {
    try {
      await popup.waitForLoadState('domcontentloaded', { timeout: timeoutMs }).catch(() => {});
      await popup.waitForURL((url) => !/(\.|^)linkedin\.com$/i.test(url.hostname), { timeout: timeoutMs }).catch(() => {});
      const popupUrl = await safePageUrl(popup);
      const withPopupUrl = mergeLinkedInRecords(merged, { externalApplyUrl: isNonLinkedInUrl(popupUrl) ? popupUrl : '' });
      return resolveEmployerApplyDestination(context, withPopupUrl, { activePage: popup, timeoutMs });
    } finally {
      await popup.close().catch(() => {});
    }
  }
  await navigationPromise;
  const afterUrl = await safePageUrl(page);
  if (afterUrl && afterUrl !== beforeUrl && isNonLinkedInUrl(afterUrl)) {
    const navigated = mergeLinkedInRecords(merged, { externalApplyUrl: afterUrl });
    return resolveEmployerApplyDestination(context, navigated, { activePage: page, timeoutMs });
  }
  return merged;
}

export async function resolveEmployerApplyDestination(context, input = {}, options = {}) {
  const record = asRecord(input);
  const initialUrl = clean(record.externalApplyUrl || record.external_apply_url || record.applyUrl || record.employerApplyUrl);
  if (!initialUrl || !isNonLinkedInUrl(initialUrl)) return record;
  const timeoutMs = Math.max(1000, Number(options.timeoutMs || 6000));
  let page = options.activePage || null;
  let closePage = false;
  try {
    if (!page) {
      page = await context.newPage();
      closePage = true;
      await page.goto(initialUrl, { waitUntil: 'domcontentloaded', timeout: timeoutMs }).catch(() => {});
    }
    await page.waitForLoadState('domcontentloaded', { timeout: timeoutMs }).catch(() => {});
    await page.waitForTimeout(Math.min(1200, timeoutMs)).catch(() => {});
    let resolved = await inspectEmployerApplyPage(page);
    if (!resolved.finalUrl) resolved.finalUrl = await safePageUrl(page);
    if (!supportedDestinationUrl(resolved.finalUrl) && !supportedDestinationUrl(resolved.atsUrl)) {
      const clicked = await clickEmployerApplyProgression(page, timeoutMs);
      if (clicked) {
        await page.waitForLoadState('domcontentloaded', { timeout: timeoutMs }).catch(() => {});
        await page.waitForTimeout(Math.min(1000, timeoutMs)).catch(() => {});
        const afterClick = await inspectEmployerApplyPage(page);
        resolved = {
          ...resolved,
          ...afterClick,
          clickProgressed: true,
          finalUrl: afterClick.finalUrl || await safePageUrl(page) || resolved.finalUrl,
        };
      }
    }
    const finalUrl = clean(supportedDestinationUrl(resolved.atsUrl) ? resolved.atsUrl : resolved.finalUrl);
    return mergeLinkedInRecords(record, {
      destinationText: resolved.destinationText,
      externalApplyFinalUrl: finalUrl,
      finalEmployerApplyUrl: finalUrl,
      resolvedApplyUrl: finalUrl,
    });
  } catch (error) {
    return mergeLinkedInRecords(record, {
      employerApplyResolutionError: error instanceof Error ? error.message : String(error),
    });
  } finally {
    if (closePage && page) await page.close().catch(() => {});
  }
}

async function inspectEmployerApplyPage(page) {
  return page.evaluate(() => {
    const cleanText = (value) => String(value || '').replace(/\s+/g, ' ').trim();
    const absoluteUrl = (value) => {
      try {
        const url = new URL(value, window.location.href);
        url.hash = '';
        return url.href;
      } catch {
        return '';
      }
    };
    const supportedPattern = /myworkdayjobs\.com|greenhouse\.io|lever\.co|icims\.com|icimscloud\.com|oraclecloud\.com|successfactors|jobs\.sap\.com|smartrecruiters\.com|phenompeople|phenom\.com/i;
    const links = Array.from(document.querySelectorAll('a[href], form[action], iframe[src]')).map((element) => (
      absoluteUrl(element.getAttribute('href') || element.getAttribute('action') || element.getAttribute('src') || '')
    )).filter(Boolean);
    const atsUrl = links.find((url) => supportedPattern.test(url)) || '';
    const metaRefresh = Array.from(document.querySelectorAll('meta[http-equiv]')).map((element) => {
      const httpEquiv = cleanText(element.getAttribute('http-equiv'));
      const content = cleanText(element.getAttribute('content'));
      if (!/refresh/i.test(httpEquiv)) return '';
      const match = content.match(/url=(.+)$/i);
      return absoluteUrl(match?.[1] || '');
    }).find(Boolean) || '';
    return {
      atsUrl: atsUrl || metaRefresh,
      destinationText: cleanText(document.body?.innerText || '').slice(0, 4000),
      finalUrl: absoluteUrl(window.location.href),
    };
  }).catch(() => ({ atsUrl: '', destinationText: '', finalUrl: '' }));
}

async function clickEmployerApplyProgression(page, timeoutMs) {
  const beforeUrl = await safePageUrl(page);
  const handles = await page.$$('a[href], button');
  for (const handle of handles) {
    try {
      const candidate = await handle.evaluate((element) => {
        const cleanText = (value) => String(value || '').replace(/\s+/g, ' ').trim();
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        const text = cleanText(element.innerText || element.textContent || element.getAttribute('aria-label') || element.getAttribute('title'));
        return {
          text,
          type: cleanText(element.getAttribute('type')),
          visible: style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0,
        };
      });
      if (!candidate.visible || !/^(apply|apply now|apply for this job|continue|start application)$/i.test(candidate.text)) continue;
      if (/submit/i.test(candidate.type) || /submit/i.test(candidate.text)) continue;
      await Promise.race([
        handle.click({ timeout: timeoutMs }),
        page.waitForTimeout(timeoutMs),
      ]);
      const afterUrl = await safePageUrl(page);
      return Boolean(afterUrl && afterUrl !== beforeUrl);
    } catch {}
  }
  return false;
}

function supportedDestinationUrl(value) {
  const text = clean(value);
  if (!text) return '';
  return /myworkdayjobs\.com|greenhouse\.io|lever\.co|icims\.com|icimscloud\.com|oraclecloud\.com|successfactors|jobs\.sap\.com|smartrecruiters\.com|phenompeople|phenom\.com/i.test(text)
    ? text
    : '';
}

async function clickFirstExternalLinkedInApplyButton(page, timeoutMs) {
  const handles = await page.$$('a[href], button');
  for (const handle of handles) {
    try {
      const candidate = await handle.evaluate((element) => {
        const cleanText = (value) => String(value || '').replace(/\s+/g, ' ').trim();
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        const text = cleanText(element.innerText || element.textContent || element.getAttribute('aria-label') || element.getAttribute('title'));
        return {
          easy: /easy apply/i.test(text),
          text,
          visible: style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0,
        };
      });
      if (!candidate.visible || !/apply/i.test(candidate.text) || candidate.easy) continue;
      await handle.click({ timeout: timeoutMs });
      return true;
    } catch {}
  }
  return false;
}

function mergeLinkedInRecords(base = {}, patch = {}) {
  const output = { ...asRecord(base) };
  for (const [key, value] of Object.entries(asRecord(patch))) {
    if (value === undefined || value === null) continue;
    if (typeof value === 'string' && !clean(value)) continue;
    if (/title/i.test(key) && isLinkedInNoiseTitle(value)) continue;
    output[key] = value;
  }
  return output;
}

function isLinkedInNoiseTitle(value) {
  const text = normalized(value);
  return text === '0 notifications' || text.startsWith('skip to ');
}

function classifyLinkedInQuality({ compensation, description, destination, location, score, title }) {
  const holdReasons = [];
  const compensationPolicy = classifyCompensationPolicy({
    maxUsd: compensation.maxUsd,
    description,
    location,
    score,
    text: compensation.text,
    title,
  });
  const compensationOk = compensationPolicy.eligible;
  if (compensationPolicy.holdReason) holdReasons.push(compensationPolicy.holdReason);
  holdReasons.push(...compensationPolicy.warnings);
  if (destination.classification !== 'workday_resolved') holdReasons.push(destination.classification);
  if (score < 65) holdReasons.push('fit_score_below_65');
  else if (score < 75) holdReasons.push('fit_score_65_74_review_required');
  else if (score < 85) holdReasons.push('fit_score_75_84_requires_tailored_cover_letter_rationale');
  return {
    compensationOk,
    compensationPolicy,
    holdReasons,
    requiresCoverLetter: score >= 75,
    routeToWorkday: destination.classification === 'workday_resolved' && score >= 85 && compensationOk,
    status: !compensationOk
      ? compensationPolicy.status
      : score >= 85 ? 'quality_ready' : score >= 75 ? 'needs_tailored_cover_letter_rationale' : score >= 65 ? 'quality_review_required' : 'poor_fit',
  };
}

function scoreLinkedInRecord({ title, location, description }) {
  const text = normalized(`${title} ${location} ${description}`);
  const heading = normalized(title);
  let score = 32;
  if (/senior director|sr director|director/.test(heading)) score += 18;
  else if (/principal|group product|senior|sr\./.test(heading)) score += 14;
  if (/product management|product manager|product owner|product/.test(heading)) score += 22;
  if (/platform|roadmap|portfolio|strategy|transformation/.test(text)) score += 12;
  if (/ai|automation|machine learning|analytics|data/.test(text)) score += 8;
  if (/customer experience|customer journey|contact center|commerce|payments|broadband|wireless|telecom|communications/.test(text)) score += 8;
  if (/remote|texas|dallas|plano|irving|austin|fort worth/.test(text)) score += 5;
  if (/account executive|sales|intern|engineer|developer|designer|finance|legal|counsel|marketing/.test(heading) && !/product/.test(heading)) score -= 30;
  return score;
}

function linkedInPostingId({ company, destination, linkedinJobId, requisition, title }) {
  const identity = destination.identity?.ok
    ? `workday:${destination.identity.tenant}:${destination.identity.jobId}`
    : linkedinJobId || requisition || `${company}:${title}`;
  return `linkedin-${slug(identity)}-${simpleHash(identity).slice(0, 8)}`;
}

function linkedInSignals({ title, description }) {
  const text = normalized(`${title} ${description}`);
  return [
    ['product leadership', /product/.test(text)],
    ['platform strategy', /platform|roadmap|strategy/.test(text)],
    ['customer experience', /customer experience|customer journey|contact center/.test(text)],
    ['ai or automation', /ai|automation|machine learning/.test(text)],
    ['telecom or connectivity', /wireless|telecom|broadband|connectivity|communications/.test(text)],
  ].filter(([, present]) => present).map(([label]) => label);
}

function buildLinkedInEvidenceMatrix(description) {
  const text = normalized(description);
  return [
    'product management leadership',
    'platform roadmap ownership',
    'cross-functional stakeholder execution',
    'customer or digital experience',
    'AI, automation, analytics, or transformation',
  ].map((requirement) => ({
    evidence_reference: text.includes(requirement.split(' ')[0]) ? 'linkedin_job_description' : 'profile_evidence_required',
    requirement,
    verification_state: 'requires_profile_mapping',
  }));
}

function extractCompensation(text) {
  const value = clean(text);
  const values = [];
  const addRangeMatches = (regex) => {
    for (const match of value.matchAll(regex)) {
      const range = clean(match[1] || match[0]);
      if (!range) continue;
      const index = match.index || 0;
      const context = clean(value.slice(Math.max(0, index - 120), Math.min(value.length, index + range.length + 140)));
      if (!hasCompensationKeyword(context) && rejectCompensationContext(context)) continue;
      const numbers = range.match(/\$?\s*[0-9][0-9,]*(?:\.\d+)?\s*(?:k|K|USD)?/g) || [];
      if (numbers.length >= 2) {
        const min = moneyToNumber(numbers[0]);
        const max = moneyToNumber(numbers[1]);
        if (min > 0 && max > 0) values.push({ min: Math.min(min, max), max: Math.max(min, max), text: range });
      }
    }
  };
  addRangeMatches(/(?:salary(?:\s+range)?|base salary(?:\s+range)?|base pay(?:\s+range)?|pay range|compensation(?:\s+range)?|reasonable estimate(?:\s+of)?(?:\s+the)?(?:\s+base salary range)?)[^$0-9]{0,80}((?:\$?\s*[0-9][0-9,]*(?:\.\d+)?\s*(?:k|K|USD)?)\s*[-–]\s*(?:\$?\s*[0-9][0-9,]*(?:\.\d+)?\s*(?:k|K|USD)?))/gi);
  addRangeMatches(/((?:\$[0-9][0-9,]*(?:\.\d+)?\s*(?:k|K)?)\s*[-–]\s*(?:\$?\s*[0-9][0-9,]*(?:\.\d+)?\s*(?:k|K)?))/g);
  const singles = value.match(/\$[0-9][0-9,]*(?:\.\d+)?\s*(?:k|K)?/g) || [];
  if (!values.length) {
    for (const single of singles) {
      const index = value.indexOf(single);
      const context = clean(value.slice(Math.max(0, index - 120), Math.min(value.length, index + single.length + 140)));
      if (!hasCompensationKeyword(context) && rejectCompensationContext(context)) continue;
      values.push({ min: null, max: moneyToNumber(single), text: single });
    }
  }
  const valid = values.filter((item) => Number(item.max) > 0);
  if (!valid.length) return { maxUsd: null, minUsd: null, text: '' };
  return {
    maxUsd: Math.max(...valid.map((item) => Number(item.max))),
    minUsd: Math.min(...valid.map((item) => Number(item.min || item.max))),
    text: valid.map((item) => item.text).join('; '),
  };
}

function hasCompensationKeyword(value) {
  return /salary|compensation|base pay|pay range|reasonable estimate|eligible bonus|incentive/.test(normalized(value));
}

function rejectCompensationContext(value) {
  const text = normalized(value);
  return /401\(k\)|company stock|stock at a discount|charity match|match up to|followers|employees|employee growth|revenue|billion|million|locations|clicked apply|applicant education|applicant seniority|benefits found|medical|vision|dental/.test(text);
}

function moneyToNumber(value) {
  const text = clean(value).replace(/\$/g, '').replace(/,/g, '').replace(/\bUSD\b/ig, '').trim();
  const number = Number(text.replace(/[kK]$/g, ''));
  if (!Number.isFinite(number)) return 0;
  return /k$/i.test(text) ? Math.round(number * 1000) : Math.round(number);
}

function scoreAiReadiness(description) {
  const text = normalized(description);
  let score = 66;
  if (/ai|automation|machine learning/.test(text)) score += 12;
  if (/platform|system|workflow/.test(text)) score += 8;
  if (/analytics|data/.test(text)) score += 5;
  return Math.min(score, 95);
}

function classifyWorkArrangement(text) {
  if (/remote/i.test(text)) return 'remote';
  if (/hybrid/i.test(text)) return 'hybrid';
  if (/on[- ]?site/i.test(text)) return 'onsite';
  return 'unknown';
}

function redactedRecord(record) {
  const clone = { ...asRecord(record) };
  for (const key of Object.keys(clone)) {
    if (/password|token|cookie|secret|otp|code|credential/i.test(key)) clone[key] = '[redacted]';
  }
  return clone;
}

async function safePageUrl(page) {
  try {
    return clean(typeof page.url === 'function' ? page.url() : page.url);
  } catch {
    return '';
  }
}

async function safeBodyText(page) {
  try {
    return clean(await page.locator('body').innerText({ timeout: 3000 }));
  } catch {
    try {
      return clean(await page.evaluate(() => document.body?.innerText || ''));
    } catch {
      return '';
    }
  }
}

function isNonLinkedInUrl(value) {
  try {
    const url = new URL(clean(value));
    return !/(\.|^)linkedin\.com$/i.test(url.hostname);
  } catch {
    return false;
  }
}

function coerceRecordArray(value) {
  if (Array.isArray(value)) return value.map(asRecord);
  const record = asRecord(value);
  if (Array.isArray(record.records)) return record.records.map(asRecord);
  if (Array.isArray(record.jobs)) return record.jobs.map(asRecord);
  if (Object.keys(record).length) return [record];
  return [];
}

function dateKey(value) {
  return clean(value).slice(0, 10) || new Date().toISOString().slice(0, 10);
}

function htmlToText(value) {
  return clean(value)
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+\n/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function clampScore(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function simpleHash(value) {
  return crypto.createHash('sha256').update(clean(value)).digest('hex');
}

function slug(value) {
  return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 96) || 'record';
}

function normalized(value) {
  return clean(value).toLowerCase();
}

function nonEmptyList(value) {
  if (Array.isArray(value)) return value.map(clean).filter(Boolean);
  return String(value || '').split(/[\n,;]+/).map(clean).filter(Boolean);
}

function uniqueList(values = []) {
  return Array.from(new Set(values.map(clean).filter(Boolean)));
}

function clean(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function asRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}
