#!/usr/bin/env node
import crypto from 'node:crypto';

const ownerEmail = process.env.CAREER_OS_OWNER_EMAIL || 'tomas@nieves.com';
const market = argValue('--market', process.env.CAREER_OS_MARKET || 'telecom');
const expandedTelecomBoards = [
  'affirm',
  'bandwidth',
  'boxinc',
  'braze',
  'cloudflare',
  'datadog',
  'dialpad',
  'five9',
  'googlefiber',
  'intercom',
  'mongodb',
  'nice',
  'okta',
  'samsara',
  'toast',
  'twilio',
  'vonage',
];
const boards = argValue('--boards', process.env.CAREER_OS_SOURCE_BOARDS || (market === 'telecom' ? expandedTelecomBoards.join(',') : 'affirm'))
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);
const persist = process.argv.includes('--persist') || process.env.CAREER_OS_SOURCE_PERSIST === '1';
const minFitScore = Number(argValue('--min-fit-score', process.env.CAREER_OS_MIN_FIT_SCORE || (market === 'telecom' ? '85' : '70')));
const executedAt = new Date().toISOString();
const runDay = executedAt.slice(0, 10);
const sourceRunId = deterministicUuid(`career-os-source-run:${ownerEmail}:${market}:greenhouse:${boards.join(',')}:${runDay}`);

const sourceRun = {
  id: sourceRunId,
  owner_email: ownerEmail,
  source_type: market === 'telecom' ? 'expanded_public_ats_api' : 'public_ats_api',
  source_name: market === 'telecom'
    ? 'Expanded telecom, communications, connectivity, cloud, and adjacent platform official Greenhouse sources'
    : `Greenhouse public job boards: ${boards.join(', ')}`,
  source_url: 'https://boards-api.greenhouse.io/v1/boards',
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
      'senior director',
      'director',
      'vice president',
      'head of product',
      'principal product manager',
      'group product manager',
      'product management',
      'platform',
      'customer experience',
      'contact center',
      'communications',
      'transformation',
      'automation',
      'ai',
    ],
    min_fit_score: minFitScore,
    texas_remote_filter: 'remote_us_texas_or_reasonable_texas_markets',
    automatic_submission_limit: 3,
    invoked_by: process.env.CAREER_OS_INVOKED_BY || 'manual-codex-run',
    daily_automation_id: process.env.CAREER_OS_DAILY_AUTOMATION_ID || 'daily-tomas-career-os-run',
    idempotency_key: `${ownerEmail}:${market}:greenhouse:${boards.join(',')}:${runDay}`,
    cost_controls: [
      'official_public_apis_first',
      'deterministic_hard_filters_before_analysis',
      'dedupe_by_company_requisition_and_description_fingerprint',
      'full_analysis_only_for_shortlist',
      'reuse_verified_application_answers',
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
      continue;
    }
    postings.push(posting);
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
postings.forEach((posting, index) => {
  posting.selected_for_pilot = index === 0;
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
  const compensation = extractCompensation(description);
  const fitScore = scorePosting(job, description);
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
    status: fitScore >= minFitScore ? 'discovered' : 'skipped',
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
    await supabaseUpsert(supabaseUrl, serviceRoleKey, 'career_os_job_postings', postings);
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
    throw new Error(`Supabase ${table} upsert failed with ${response.status}: ${message.slice(0, 240)}`);
  }
}

function scorePosting(job, description) {
  const title = String(job.title || '').toLowerCase();
  const text = `${title} ${job.location?.name || ''} ${description}`.toLowerCase();
  let score = market === 'telecom' ? 34 : 30;
  if (hasPhrase(title, 'senior director') || hasPhrase(title, 'vice president')) score += 22;
  else if (hasPhrase(title, 'director') || hasPhrase(title, 'head of')) score += 16;
  else if (hasPhrase(title, 'principal') || hasPhrase(title, 'group product')) score += 14;
  if (hasPhrase(title, 'product management')) score += 25;
  else if (hasPhrase(title, 'product manager') || /\bproduct\b/.test(title)) score += 19;
  if (hasPhrase(title, 'transformation') || hasPhrase(text, 'business transformation')) score += 13;
  if (hasPhrase(title, 'platform') || hasPhrase(text, 'platform strategy') || hasPhrase(text, 'workflow')) score += 8;
  if (hasPhrase(text, 'customer experience') || hasPhrase(text, 'contact center') || hasPhrase(text, 'ccaas') || hasPhrase(text, 'ucaas')) score += 9;
  if (hasPhrase(text, 'telecom') || hasPhrase(text, 'communications') || hasPhrase(text, 'connectivity') || hasPhrase(text, 'wireless') || hasPhrase(text, 'broadband')) score += 8;
  if (hasPhrase(text, 'automation') || /\bai\b/.test(text) || hasPhrase(text, 'agentic')) score += 6;
  if (hasPhrase(text, 'payments') || hasPhrase(text, 'cards') || hasPhrase(text, 'fintech')) score += market === 'telecom' ? 2 : 5;
  if (/remote\s*-\s*us|remote,\s*us|united states \(remote\)|usa\s*-\s*remote|work from home - us/i.test(job.location?.name || '')) score += 7;
  if (/austin|dallas|plano|irving|houston|san antonio|texas/i.test(`${job.location?.name || ''} ${description}`)) score += 5;
  if (/remote canada|remote uk|remote poland|remote spain|india|ireland|london|dublin|germany|japan|israel/i.test(job.location?.name || '')) score -= 25;
  if (!/\b(product|transformation|strategy|customer experience)\b/.test(title) && /compliance|counsel|sales|marketing|software engineer|learning|account|finance|analytics|designer|intern|apprentice/i.test(title)) score -= 34;
  return Math.min(score, 95);
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
