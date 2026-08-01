#!/usr/bin/env node
import crypto from 'node:crypto';

const ownerEmail = process.env.CAREER_OS_OWNER_EMAIL || 'tomas@nieves.com';
const market = argValue('--market', process.env.CAREER_OS_MARKET || 'broader_product_management');
const rolePolicyVersion = 'career-os-role-policy-2026-07-21';
const executiveExclusionTokens = ['vice president', ' head of ', ' chief ', ' executive director', ' managing director', 'svp', 'evp'];
const expandedTelecomBoards = [
  'affirm',
  'bandwidth',
  'boxinc',
  'braze',
  'coreweave',
  'elastic',
  'fivetran',
  'gomotive',
  'rubrik',
  'scaleai',
  'verkada',
  'andurilindustries',
  'cloudflare',
  'datadog',
  'dialpad',
  'five9',
  'googlefiber',
  'mongodb',
  'nice',
  'okta',
  'samsara',
  'toast',
  'twilio',
  'vonage',
];
const dailySourceRegistry = [
  'Greenhouse official board API',
  'Workday official career portals when adapter evidence exists',
  'Lever official postings when adapter evidence exists',
  'Ashby official postings when adapter evidence exists',
  'SmartRecruiters official postings when adapter evidence exists',
  'iCIMS official postings when adapter evidence exists',
  'Phenom official portals when adapter evidence exists',
  'SuccessFactors official portals when adapter evidence exists',
  'Oracle Recruiting official portals when adapter evidence exists',
  'company-hosted official career portals',
];
const dailyEmployerUniverse = [
  'telecommunications, wireless, broadband, fiber, and connectivity employers',
  'satellite, autonomy, edge, and next-generation connectivity employers',
  'banking, fintech, payments, and insurance platforms',
  'enterprise software, AI, infrastructure, customer experience, and automation platforms',
  'retail, healthcare technology, transportation, logistics, energy, and utilities',
  'consulting, digital transformation, and major Dallas-Fort Worth employers',
];
const boards = argValue('--boards', process.env.CAREER_OS_SOURCE_BOARDS || expandedTelecomBoards.join(','))
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);
const googleCareersEnabled = process.env.CAREER_OS_GOOGLE_CAREERS_ENABLED !== '0';
const googleCareerQueries = argValue(
  '--google-career-queries',
  process.env.CAREER_OS_GOOGLE_CAREER_QUERIES || 'product manager,senior product manager,director product management,product operations,ai product'
)
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);
const googleCareersDetailLimit = Number(argValue('--google-careers-detail-limit', process.env.CAREER_OS_GOOGLE_CAREERS_DETAIL_LIMIT || '40'));
const persist = process.argv.includes('--persist') || process.env.CAREER_OS_SOURCE_PERSIST === '1';
const minFitScore = Number(argValue('--min-fit-score', process.env.CAREER_OS_MIN_FIT_SCORE || (market === 'telecom' ? '85' : '70')));
const executedAt = new Date().toISOString();
const runDay = executedAt.slice(0, 10);
const sourceRunId = deterministicUuid(`career-os-source-run:${ownerEmail}:${market}:workday-linkedin-google:${boards.join(',')}:${googleCareerQueries.join(',')}:${runDay}`);

const sourceRun = {
  id: sourceRunId,
  owner_email: ownerEmail,
  source_type: 'expanded_public_source_discovery',
  source_name: 'Expanded Workday, LinkedIn, Google, Greenhouse, and Oracle product-management discovery',
  source_url: 'https://boards-api.greenhouse.io/v1/boards plus Google Careers public pages plus Oracle Candidate Experience official sources',
  status: 'succeeded',
  executed_at: executedAt,
  number_reviewed: 0,
  number_accepted: 0,
  number_skipped: 0,
  search_config: {
    market,
    boards,
    market_scope: market === 'telecom' ? [
      'telecommunications carriers',
      'cable broadband internet providers',
      'wireless network telecom infrastructure',
      'satellite and next-generation connectivity',
      'communications software and cloud platforms',
      'devices connected experiences',
      'telecom consulting and systems integration',
      'adjacent digital platform industries',
    ] : undefined,
    role_keywords: [
      'product manager',
      'senior product manager',
      'group product manager',
      'principal product manager',
      'director of product management',
      'senior director of product management',
      'platform',
      'customer experience',
      'transformation',
      'automation',
      'ai',
    ],
    min_fit_score: minFitScore,
    role_policy_version: rolePolicyVersion,
    production_focus_sources: ['workday', 'linkedin', 'google_careers'],
    greenhouse_status: 'parked_for_rotating_email_code_loop',
    google_careers: {
      enabled: googleCareersEnabled,
      queries: googleCareerQueries,
      source_url: 'https://www.google.com/about/careers/applications/jobs/results/',
      execution_policy: 'discover_and_score; apply only after supported browser route is verified',
    },
    texas_remote_filter: 'remote_us_texas_or_reasonable_texas_markets',
    location_policy: 'verify remote from Texas, employment from Texas, Dallas-Fort Worth, or Texas hybrid before package generation',
    freshness_windows: ['24_hours', '3_days', '7_days', '14_days_if_active_exceptional_fit'],
    source_registry: dailySourceRegistry,
    employer_universe: dailyEmployerUniverse,
    pipeline_targets: {
      newly_identified_daily: 20,
      evaluate_strongest: '10-15',
      qualified_unique_adds_when_available: 5,
      active_qualified_minimum: 15,
    },
    compensation_policy: {
      preferred_minimum_base_salary_usd: 200000,
      open_to_higher_compensation: true,
      open_to_negotiation: true,
      optional_compensation_fields: 'leave_blank',
      required_base_salary: 'use_approved_200000_base_strategy_where_appropriate',
      required_total_compensation: 'pause_pending_tomas_approved_total_compensation_target',
      never_treat_base_and_total_compensation_as_equivalent: true,
      never_invent_bonus_equity_commission_or_total_compensation: true,
    },
    automatic_submission_limit: 3,
    invoked_by: process.env.CAREER_OS_INVOKED_BY || 'manual-codex-run',
    daily_automation_id: process.env.CAREER_OS_DAILY_AUTOMATION_ID || 'daily-tomas-career-os-run',
    idempotency_key: `${ownerEmail}:${market}:greenhouse:${boards.join(',')}:${runDay}`,
    cost_controls: [
      'incremental_discovery_only',
      'official_public_apis_first',
      'deterministic_hard_filters_before_analysis',
      'dedupe_by_company_requisition_and_description_fingerprint',
      'full_analysis_only_for_shortlist',
      'reuse_verified_application_answers',
      'reuse_unchanged_packages_by_fingerprint',
      'batch_status_reporting',
      'cap_external_site_retries',
      'do_not_redeploy_for_data_only_changes',
    ],
  },
  evidence: [],
};

const postings = [];

for (const board of boards) {
  const jobs = await fetchGreenhouseJobs(board);
  sourceRun.number_reviewed += jobs.length;

  for (const job of jobs) {
    const posting = normalizePosting(board, job, executedAt, sourceRunId);
    if (posting.fit_score < minFitScore) {
      sourceRun.number_skipped += 1;
    }
    postings.push(posting);
  }
}

for (const job of await fetchJpmorganOraclePilot(executedAt, sourceRunId)) {
  sourceRun.number_reviewed += 1;
  if (job.fit_score < minFitScore) sourceRun.number_skipped += 1;
  postings.push(job);
}

if (googleCareersEnabled) {
  for (const job of await fetchGoogleCareersPilot(executedAt, sourceRunId)) {
    sourceRun.number_reviewed += 1;
    if (job.fit_score < minFitScore) sourceRun.number_skipped += 1;
    postings.push(job);
  }
}

postings.sort((a, b) => b.fit_score - a.fit_score || a.company.localeCompare(b.company));
sourceRun.number_accepted = postings.length;
sourceRun.evidence = postings.slice(0, 10).map((posting) => ({
  company: posting.company,
  title: posting.title,
  requisition: posting.external_requisition_id,
  canonical_url: posting.canonical_url,
  fit_score: posting.fit_score,
}));
const pilotPosting = postings.find((posting) => posting.fit_score >= minFitScore && posting.status !== 'ineligible');
postings.forEach((posting) => {
  posting.selected_for_pilot = posting === pilotPosting;
});

if (persist) {
  await persistToSupabase(sourceRun, postings);
}

console.log(JSON.stringify({
  sourceRun,
  postings: postings.map((posting) => ({
    id: posting.id,
    company: posting.company,
    title: posting.title,
    location: posting.location,
    external_requisition_id: posting.external_requisition_id,
    canonical_url: posting.canonical_url,
    fit_score: posting.fit_score,
    selected_for_pilot: posting.selected_for_pilot,
  })),
  persisted: persist,
}, null, 2));

async function fetchGreenhouseJobs(board) {
  const url = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(board)}/jobs?content=true`;
  const response = await fetch(url, { headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error(`Greenhouse ${board} returned ${response.status}`);
  const payload = await response.json();
  return Array.isArray(payload.jobs) ? payload.jobs : [];
}

function normalizePosting(board, job, lastCheckedAt, sourceRunId) {
  const company = companyName(board, job);
  const description = htmlToText(job.content || '');
  const rolePolicy = classifyRolePolicy(String(job.title || ''), description);
  const compensation = extractCompensation(description);
  const fitScore = rolePolicy.excluded ? 0 : scorePosting(job, description);
  const requisition = String(job.requisition_id || job.id);
  const canonicalUrl = job.absolute_url || `https://job-boards.greenhouse.io/${board}/jobs/${job.id}`;

  return {
    id: `greenhouse-${slug(board)}-${job.id}`,
    source_run_id: sourceRunId,
    owner_email: ownerEmail,
    company,
    title: String(job.title || '').trim(),
    location: job.location?.name || '',
    work_arrangement: /remote/i.test(job.location?.name || description) ? 'remote' : 'unknown',
    compensation_min_usd: compensation.minUsd,
    compensation_max_usd: compensation.maxUsd,
    compensation_text: compensation.text,
    canonical_url: canonicalUrl,
    external_requisition_id: requisition,
    job_description: description,
    normalized_description: description.slice(0, 12000),
    normalized_role_level: rolePolicy.normalizedLevel,
    deterministic_filter_reason: rolePolicy.reason,
    posting_validation_status: 'active',
    last_checked_at: lastCheckedAt,
    raw_record: job,
    fit_score: fitScore,
    ats_analysis: {
      score: fitScore,
      signals: matchingSignals(job, description),
      risks: /payments|cards|fintech/i.test(description) ? [] : ['Fintech/card platform depth should be positioned carefully.'],
      method: 'deterministic_greenhouse_source_runner_v1',
    },
    ai_readiness_analysis: {
      score: scoreAiReadiness(description),
      signals: ['platform strategy', 'automation', 'cross-functional operating cadence'].filter((signal) => hasAny(description, signal)),
      method: 'answerbrief_deterministic_readiness_v1',
    },
    recruiter_intelligence: {
      score: scoreRecruiterFit(job, description),
      salary: compensation.text || 'not published',
      location: job.location?.name || 'not published',
      decision: fitScore >= minFitScore ? 'worth_applying' : 'skip',
    },
    hiring_manager_evidence_matrix: buildEvidenceMatrix(description),
    selected_for_pilot: false,
    status: rolePolicy.excluded ? 'ineligible' : fitScore >= minFitScore ? 'discovered' : 'qualification_pending',
  };
}

async function fetchJpmorganOraclePilot(lastCheckedAt, sourceRunId) {
  const querySets = [
    { keyword: 'product', selectedCategoriesFacet: '300000086251864', selectedLocationsFacet: '300000020657211' },
    { keyword: 'product', selectedCategoriesFacet: '300000086251864', selectedLocationsFacet: '300000020709331' },
  ];
  const seen = new Map();
  for (const query of querySets) {
    const finder = `findReqs;siteNumber=CX_1001,keyword=${query.keyword},selectedCategoriesFacet=${query.selectedCategoriesFacet},selectedLocationsFacet=${query.selectedLocationsFacet},limit=25,offset=0`;
    const response = await fetch(`https://jpmc.fa.oraclecloud.com/hcmRestApi/resources/latest/recruitingCEJobRequisitions?finder=${encodeURIComponent(finder)}&expand=requisitionList&onlyData=true`, {
      headers: { accept: 'application/json' },
    });
    if (!response.ok) throw new Error(`Oracle JPMorgan Chase returned ${response.status}`);
    const payload = await response.json();
    const requisitions = Array.isArray(payload.items) ? payload.items.flatMap((item) => Array.isArray(item.requisitionList) ? item.requisitionList : []) : [];
    for (const requisition of requisitions) {
      const normalized = normalizeOraclePosting(requisition, lastCheckedAt, sourceRunId);
      seen.set(normalized.id, normalized);
    }
  }
  return Array.from(seen.values());
}

async function fetchGoogleCareersPilot(lastCheckedAt, sourceRunId) {
  const seen = new Map();
  let remainingDetails = Number.isFinite(googleCareersDetailLimit) ? googleCareersDetailLimit : 40;

  for (const query of googleCareerQueries) {
    const resultsUrl = `https://www.google.com/about/careers/applications/jobs/results/?q=${encodeURIComponent(query)}&location=United%20States`;
    let html = '';
    try {
      html = await fetchText(resultsUrl);
    } catch (error) {
      console.warn(`Google Careers query "${query}" skipped: ${error.message}`);
      continue;
    }

    const cards = parseGoogleCareersResults(html, query);
    for (const card of cards) {
      if (seen.has(card.id)) continue;
      let detail = card;
      if (remainingDetails > 0) {
        remainingDetails -= 1;
        try {
          const detailHtml = await fetchText(card.canonical_url);
          detail = { ...card, ...parseGoogleCareersDetail(detailHtml, card) };
        } catch (error) {
          detail = {
            ...card,
            job_description: `${card.title}\n${card.location || ''}\n${card.summary || ''}`.trim(),
            detail_fetch_error: error.message,
          };
        }
      }
      seen.set(card.id, normalizeGoogleCareerPosting(detail, lastCheckedAt, sourceRunId));
      await sleep(150);
    }
  }

  return Array.from(seen.values());
}

function parseGoogleCareersResults(html, query) {
  const cards = [];
  const chunks = String(html || '').split(/<li class="lLd3Je"[^>]*>/);

  for (const chunk of chunks) {
    const anchor = chunk.match(/<a\b[^>]+href="(jobs\/results\/([0-9]+)-[^"]*)"[^>]+aria-label="Learn more about ([^"]+)"/);
    if (!anchor) continue;
    const href = decodeHtmlEntities(anchor[1]);
    const id = String(anchor[2] || '').trim();
    const title = decodeHtmlEntities(anchor[3]);
    const canonicalUrl = new URL(href, 'https://www.google.com/about/careers/applications/').toString();
    const locations = uniqueValues([...chunk.matchAll(/<span class="r0wTof[^"]*">\s*([^<]+)<\/span>/g)]
      .map((match) => decodeHtmlEntities(match[1])));
    const experience = decodeHtmlEntities(chunk.match(/aria-label="([^"]+), Learn more about experience filters\./)?.[1] || '');

    cards.push({
      id,
      query,
      company: 'Google',
      title,
      location: locations.join('; '),
      locations,
      experience,
      canonical_url: canonicalUrl,
      summary: htmlToText(chunk).slice(0, 4000),
    });
  }

  return cards;
}

function parseGoogleCareersDetail(html, fallback) {
  const text = htmlToText(html);
  const locationMatch = text.match(/preferred working location from the following:\s*([^]+?)\s*\.\s*Minimum qualifications:/i);
  const start = text.search(/Minimum qualifications:/i);
  const endCandidates = [
    text.search(/Google is proud to be an equal opportunity/i),
    text.search(/Information collected and processed as part of your Google Careers profile/i),
  ].filter((index) => index > start);
  const end = endCandidates.length ? Math.min(...endCandidates) : text.length;
  const description = start >= 0 ? text.slice(Math.max(0, start - 350), end).trim() : text.slice(0, 12000).trim();
  const detailLocations = locationMatch
    ? uniqueValues(locationMatch[1].split(';'))
    : fallback.locations;

  return {
    title: fallback.title,
    company: 'Google',
    location: locationMatch ? detailLocations.join('; ') : fallback.location,
    locations: detailLocations,
    job_description: description.slice(0, 12000),
  };
}

function normalizeGoogleCareerPosting(job, lastCheckedAt, sourceRunId) {
  const title = String(job.title || '').trim();
  const description = String(job.job_description || job.summary || title || '').trim();
  const rolePolicy = classifyRolePolicy(title, description);
  const compensation = extractCompensation(description);
  const fitScore = rolePolicy.excluded ? 0 : scorePosting({ title, location: { name: job.location || '' } }, description);
  const requisition = String(job.id || deterministicUuid(`${title}:${job.canonical_url}`));

  return {
    id: `google-careers-${slug(requisition)}`,
    source_run_id: sourceRunId,
    owner_email: ownerEmail,
    company: 'Google',
    title,
    location: String(job.location || ''),
    work_arrangement: /remote/i.test(`${job.location || ''} ${description}`) ? 'remote' : /hybrid/i.test(`${job.location || ''} ${description}`) ? 'hybrid' : 'unknown',
    compensation_min_usd: compensation.minUsd,
    compensation_max_usd: compensation.maxUsd,
    compensation_text: compensation.text,
    canonical_url: job.canonical_url,
    external_requisition_id: requisition,
    job_description: description,
    normalized_description: description.slice(0, 12000),
    normalized_role_level: rolePolicy.normalizedLevel,
    deterministic_filter_reason: rolePolicy.reason,
    posting_validation_status: 'active',
    last_checked_at: lastCheckedAt,
    raw_record: {
      source: 'google_careers_public_page',
      query: job.query,
      experience: job.experience,
      locations: job.locations,
      detail_fetch_error: job.detail_fetch_error,
    },
    fit_score: fitScore,
    ats_analysis: {
      score: fitScore,
      signals: matchingSignals({ title, location: { name: job.location || '' } }, description),
      risks: ['Google Careers browser application route must be verified before autonomous submit.'],
      method: 'deterministic_google_careers_source_runner_v1',
    },
    ai_readiness_analysis: {
      score: rolePolicy.excluded ? 0 : scoreAiReadiness(description),
      signals: ['platform strategy', 'automation', 'customer experience', 'ai'].filter((signal) => hasAny(description, signal)),
      method: 'answerbrief_deterministic_readiness_v1',
    },
    recruiter_intelligence: {
      score: rolePolicy.excluded ? 0 : scoreRecruiterFit({ title, location: { name: job.location || '' } }, description),
      salary: compensation.text || 'not published',
      location: job.location || 'not published',
      decision: fitScore >= minFitScore ? 'worth_reviewing_google_route' : 'skip',
    },
    hiring_manager_evidence_matrix: buildEvidenceMatrix(description),
    selected_for_pilot: false,
    status: rolePolicy.excluded ? 'ineligible' : fitScore >= minFitScore ? 'discovered' : 'qualification_pending',
  };
}

function normalizeOraclePosting(job, lastCheckedAt, sourceRunId) {
  const title = String(job.Title || '').trim();
  const description = [job.ShortDescriptionStr, job.ExternalResponsibilitiesStr, job.ExternalQualificationsStr].filter(Boolean).join('\n\n');
  const rolePolicy = classifyRolePolicy(title, description);
  const fitScore = rolePolicy.excluded ? 0 : scorePosting({ title, location: { name: job.PrimaryLocation || '' } }, description);
  return {
    id: `oracle-jpmorgan-chase-${job.Id}`,
    source_run_id: sourceRunId,
    owner_email: ownerEmail,
    company: 'JPMorgan Chase',
    title,
    location: String(job.PrimaryLocation || ''),
    work_arrangement: /remote/i.test(`${job.PrimaryLocation || ''} ${job.WorkplaceType || ''}`) ? 'remote' : /hybrid/i.test(`${job.PrimaryLocation || ''} ${job.WorkplaceType || ''}`) ? 'hybrid' : 'unknown',
    compensation_min_usd: null,
    compensation_max_usd: null,
    compensation_text: '',
    canonical_url: `https://jpmc.fa.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1001/job/${encodeURIComponent(String(job.Id || ''))}`,
    external_requisition_id: String(job.Id || ''),
    job_description: description,
    normalized_description: description.slice(0, 12000),
    normalized_role_level: rolePolicy.normalizedLevel,
    deterministic_filter_reason: rolePolicy.reason,
    posting_validation_status: 'active',
    last_checked_at: lastCheckedAt,
    raw_record: job,
    fit_score: fitScore,
    ats_analysis: {
      score: fitScore,
      signals: matchingSignals({ title, location: { name: job.PrimaryLocation || '' } }, description),
      risks: [],
      method: 'deterministic_oracle_source_runner_v1',
    },
    ai_readiness_analysis: {
      score: rolePolicy.excluded ? 0 : scoreAiReadiness(description),
      signals: ['platform strategy', 'automation', 'customer experience'].filter((signal) => hasAny(description, signal)),
      method: 'answerbrief_deterministic_readiness_v1',
    },
    recruiter_intelligence: {
      score: rolePolicy.excluded ? 0 : scoreRecruiterFit({ title, location: { name: job.PrimaryLocation || '' } }, description),
      salary: 'not published',
      location: job.PrimaryLocation || 'not published',
      decision: fitScore >= minFitScore ? 'worth_applying' : 'skip',
    },
    hiring_manager_evidence_matrix: buildEvidenceMatrix(description),
    selected_for_pilot: false,
    status: rolePolicy.excluded ? 'ineligible' : fitScore >= minFitScore ? 'discovered' : 'qualification_pending',
  };
}

async function persistToSupabase(sourceRun, postings) {
  const supabaseUrl = cleanEnv(process.env.SUPABASE_URL);
  const serviceRoleKey = cleanEnv(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!supabaseUrl || !serviceRoleKey || serviceRoleKey.startsWith('[')) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required to persist source runs.');
  }

  await supabaseUpsert(supabaseUrl, serviceRoleKey, 'career_os_source_runs', sourceRun);
  if (postings.length) {
 const postingColumns = [
  'id',
  'source_run_id',
  'owner_email',
  'company',
  'title',
  'location',
  'work_arrangement',
  'compensation_min_usd',
  'compensation_max_usd',
  'compensation_text',
  'canonical_url',
  'external_requisition_id',
  'job_description',
  'normalized_description',
  'posting_validation_status',
  'last_checked_at',
  'raw_record',
  'fit_score',
  'ats_analysis',
  'ai_readiness_analysis',
  'recruiter_intelligence',
  'hiring_manager_evidence_matrix',
  'selected_for_pilot',
  'status',
];
  const normalizedPostings = postings.map((posting) =>
    Object.fromEntries(
      postingColumns.map((column) => [
        column,
        posting[column] === undefined ? null : posting[column],
      ])
    )
  );

  console.log(
    `Normalized ${normalizedPostings.length} job rows across ${postingColumns.length} columns.`
  );

    const batchSize = 200;
    const totalBatches = Math.ceil(normalizedPostings.length / batchSize);

    for (let start = 0; start < normalizedPostings.length; start += batchSize) {
      const batch = normalizedPostings.slice(start, start + batchSize);
      const batchNumber = Math.floor(start / batchSize) + 1;

      console.log(
        `Uploading job batch ${batchNumber}/${totalBatches} (${batch.length} rows).`
      );

      await supabaseUpsertWithRetry(
        supabaseUrl,
        serviceRoleKey,
        'career_os_job_postings',
        batch
      );

      await sleep(250);
    }
  }
}

async function supabaseUpsertWithRetry(supabaseUrl, serviceRoleKey, table, rows) {
  const maxAttempts = Number(process.env.CAREER_OS_SUPABASE_UPSERT_ATTEMPTS || '4');
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await supabaseUpsert(supabaseUrl, serviceRoleKey, table, rows);
    } catch (error) {
      const retryable = isRetryableSupabaseError(error);
      if (!retryable || attempt === maxAttempts) throw error;
      const delayMs = error.retryAfterMs || Math.min(60000, 2000 * 2 ** (attempt - 1));
      console.warn(`Supabase ${table} transient failure ${error.status || ''}; retrying attempt ${attempt + 1}/${maxAttempts} after ${Math.round(delayMs / 1000)}s.`);
      await sleep(delayMs);
    }
  }
}

async function supabaseUpsert(supabaseUrl, serviceRoleKey, table, rows) {
  const response = await fetch(`${supabaseUrl}/rest/v1/${table}?on_conflict=id`, {
    method: 'POST',
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(rows),
  });

  if (!response.ok) {
    const message = await response.text();
    console.error("Status:", response.status);
    console.error("Body:", message);
    const error = new Error(`Supabase ${table} upsert failed with ${response.status}`);
    error.status = response.status;
    error.retryAfterMs = parseRetryAfterMs(response.headers.get('retry-after'));
    throw error;
  }
}

function isRetryableSupabaseError(error) {
  return error?.status === 429 || error?.status >= 500;
}

function scorePosting(job, description) {
  const title = String(job.title || '').toLowerCase();
  const text = `${title} ${job.location?.name || ''} ${description}`.toLowerCase();
  let score = 30;
  if (hasPhrase(title, 'senior director')) score += 22;
  else if (hasPhrase(title, 'director')) score += 16;
  else if (hasPhrase(title, 'principal') || hasPhrase(title, 'group product')) score += 14;
  if (hasPhrase(title, 'product management')) score += 25;
  else if (hasPhrase(title, 'product manager') || /\bproduct\b/.test(title)) score += 19;
  if (hasPhrase(title, 'transformation') || hasPhrase(text, 'business transformation')) score += 13;
  if (hasPhrase(title, 'platform') || hasPhrase(text, 'platform strategy') || hasPhrase(text, 'workflow')) score += 8;
  if (hasPhrase(text, 'customer experience') || hasPhrase(text, 'contact center') || hasPhrase(text, 'ccaas') || hasPhrase(text, 'ucaas')) score += 9;
  if (hasPhrase(text, 'telecom') || hasPhrase(text, 'communications') || hasPhrase(text, 'connectivity') || hasPhrase(text, 'wireless') || hasPhrase(text, 'broadband')) score += 8;
  if (hasPhrase(text, 'automation') || /\bai\b/.test(text) || hasPhrase(text, 'agentic')) score += 6;
  if (hasPhrase(text, 'payments') || hasPhrase(text, 'cards') || hasPhrase(text, 'fintech')) score += 5;
  if (/remote\s*-\s*us|remote,\s*us|united states \(remote\)|usa\s*-\s*remote|work from home - us/i.test(job.location?.name || '')) score += 7;
  if (/austin|dallas|plano|irving|houston|san antonio|texas/i.test(`${job.location?.name || ''} ${description}`)) score += 5;
  if (/remote canada|remote uk|remote poland|remote spain|india|ireland|london|dublin|germany|japan|israel/i.test(job.location?.name || '')) score -= 25;
  if (!/\b(product|transformation|strategy|customer experience)\b/.test(title) && /compliance|counsel|sales|marketing|software engineer|learning|account|finance|analytics|designer|intern|apprentice/i.test(title)) score -= 34;
  return Math.min(score, 95);
}

function classifyRolePolicy(title, description) {
  const normalized = ` ${String(title || '').toLowerCase()} ${String(description || '').toLowerCase()} `;
  if (executiveExclusionTokens.some((token) => normalized.includes(token)) || /\bvp\b/.test(normalized)) {
    return { excluded: true, normalizedLevel: 'excluded_executive_level', reason: 'excluded_executive_level' };
  }
  if (/\b(intern|internship|student|campus|summer analyst|analyst development|associate development|apprentice)\b/.test(normalized)) {
    return { excluded: true, normalizedLevel: 'excluded_junior_level', reason: 'excluded_junior_or_student_role' };
  }
  if (/\bproduct owner\b/.test(normalized) && !/\b(senior|principal|director)\b/.test(normalized)) {
    return { excluded: true, normalizedLevel: 'excluded_junior_level', reason: 'excluded_lower_scope_product_owner_role' };
  }
  if (/\bsenior director\b/.test(normalized)) return { excluded: false, normalizedLevel: 'senior_director_product_management', reason: '' };
  if (/\bdirector\b/.test(normalized)) return { excluded: false, normalizedLevel: 'director_product_management', reason: '' };
  if (/\bprincipal product manager\b/.test(normalized)) return { excluded: false, normalizedLevel: 'principal_product_manager', reason: '' };
  if (/\bgroup product manager\b/.test(normalized)) return { excluded: false, normalizedLevel: 'group_product_manager', reason: '' };
  if (/\bsenior product manager\b/.test(normalized)) return { excluded: false, normalizedLevel: 'senior_product_manager', reason: '' };
  if (/\b(product manager|product lead|lead product manager)\b/.test(normalized)) return { excluded: false, normalizedLevel: 'product_manager', reason: '' };
  if (/\b(product|customer experience|digital transformation|platform|automation|ai)\b/.test(normalized) && /\bdirector\b/.test(normalized)) {
    return { excluded: false, normalizedLevel: 'director_product_management', reason: '' };
  }
  return { excluded: true, normalizedLevel: 'excluded_non_product_scope', reason: 'excluded_outside_target_role_band' };
}

function scoreAiReadiness(description) {
  let score = 70;
  if (hasAny(description, 'automation')) score += 8;
  if (hasAny(description, 'platform')) score += 7;
  if (hasAny(description, 'analytics', 'data-driven')) score += 5;
  if (hasAny(description, 'systems')) score += 5;
  return Math.min(score, 95);
}

function scoreRecruiterFit(job, description) {
  let score = 72;
  if (/senior director/i.test(job.title || '')) score += 8;
  if (/remote/i.test(job.location?.name || description)) score += 6;
  if (/15\+ years/i.test(description)) score += 5;
  if (/managing managers|PM leaders|high-performing product organization/i.test(description)) score += 5;
  return Math.min(score, 95);
}

function matchingSignals(job, description) {
  const signals = [];
  for (const signal of [
    'Senior Director product leadership',
    'multi-team product areas',
    'platform strategy',
    'cross-functional execution',
    'portfolio-level roadmap',
    'consumer experience',
    'payments/cards/fintech domain',
  ]) {
    if (hasPhrase(`${job.title || ''} ${description}`, signal) || hasAny(`${job.title || ''} ${description}`, signal)) signals.push(signal);
  }
  return signals;
}

function buildEvidenceMatrix(description) {
  const requirements = [
    '15+ years in product management',
    'Experience managing managers and PM leaders',
    'Platform strategy and execution',
    'Cross-functional executive stakeholder alignment',
    'Consumer-facing product and backend platform comfort',
  ];

  return requirements.map((requirement) => ({
    requirement,
    evidence_reference: hasAny(description, requirement) ? 'job_posting_requirement' : 'profile_evidence_required',
    verification_state: hasAny(description, requirement) ? 'posting_verified' : 'requires_profile_mapping',
  }));
}

function extractCompensation(text) {
  const matches = [...text.matchAll(/\$([0-9,]+)\s*-\s*\$([0-9,]+)/g)];
  if (!matches.length) return { text: '', minUsd: null, maxUsd: null };
  const values = matches.map((match) => ({
    min: Number(match[1].replace(/,/g, '')),
    max: Number(match[2].replace(/,/g, '')),
    text: match[0],
  }));
  return {
    text: values.map((value) => value.text).join('; '),
    minUsd: Math.min(...values.map((value) => value.min)),
    maxUsd: Math.max(...values.map((value) => value.max)),
  };
}

function htmlToText(html) {
  return String(html)
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

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'user-agent': 'Mozilla/5.0 CareerOS/1.0 (+https://answerbrief.ai)',
    },
  });
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return response.text();
}

function decodeHtmlEntities(value) {
  return htmlToText(String(value || '')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"'));
}

function normalizeWhitespace(value) {
  return decodeHtmlEntities(value)
    .replace(/\+\d+\s+more/gi, '')
    .replace(/\s+/g, ' ')
    .replace(/^[\s;]+|[\s;]+$/g, '')
    .trim();
}

function uniqueValues(values) {
  return Array.from(new Set(values.map((value) => normalizeWhitespace(value)).filter(Boolean)));
}

function parseRetryAfterMs(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return null;
  const seconds = Number(trimmed);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(trimmed);
  if (Number.isFinite(date)) return Math.max(0, date - Date.now());
  return null;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function companyName(board, job) {
  if (job.company_name) return String(job.company_name);
  return board.split(/[-_]/).map((part) => part ? part[0].toUpperCase() + part.slice(1) : part).join(' ');
}

function deterministicUuid(input) {
  const hash = crypto.createHash('sha1').update(input).digest();
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const hex = hash.subarray(0, 16).toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function slug(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function hasAny(text, ...needles) {
  const haystack = String(text || '').toLowerCase();
  return needles.some((needle) => String(needle).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).some((token) => haystack.includes(token)));
}

function hasPhrase(text, phrase) {
  return String(text || '').toLowerCase().includes(String(phrase || '').toLowerCase());
}

function cleanEnv(value) {
  const trimmed = String(value || '').trim();
  return trimmed.replace(/^"|"$/g, '');
}

function argValue(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index === -1 || !process.argv[index + 1]) return fallback;
  return process.argv[index + 1];
}
