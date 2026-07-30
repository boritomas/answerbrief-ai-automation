#!/usr/bin/env node
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import {
  buildLinkedInSourceStatus,
  dedupeLinkedInJobRecords,
  defaultLinkedInSearchInputs,
  extractLinkedInFeedCardsFromPage,
  extractLinkedInJobDetailFromPage,
  loadLinkedInDiscoveryRecordsFromEnv,
  normalizeLinkedInJobRecords,
  rankLinkedInFeedRecords,
  resolveLinkedInExternalApplyUrl,
} from './lib/career-os-linkedin-discovery.mjs';
import {
  buildControlledChromeArgs,
  defaultControlledBrowserStateDir,
  pollCdpEndpoint,
  resolveChromeExecutable,
  resolveControlledBrowserProfile,
  selectAvailableLocalPort,
  stopControlledBrowser,
  verifyCdpEndpoint,
  writeControlledBrowserState,
} from './lib/career-os-controlled-browser.mjs';

const root = process.cwd();
loadDotEnv(path.join(root, '.env.local'));

const args = parseArgs(process.argv.slice(2));
const persist = args.persist || process.env.CAREER_OS_LINKEDIN_PERSIST === '1';
const ownerEmail = clean(process.env.CAREER_OS_OWNER_EMAIL) || 'tomas@nieves.com';
const now = new Date().toISOString();
const sourceRunId = deterministicUuid(`linkedin-discovery:${ownerEmail}:${now.slice(0, 10)}`);
const capture = args.fromCdp
  ? await captureAuthenticatedLinkedInFeed({ args, now, root }).catch((error) => buildLinkedInCaptureFailure({
      args,
      error,
      now,
      root,
    }))
  : null;
const discovery = capture
  ? {
      errors: capture.errors || [],
      records: capture.records || [],
      requested: true,
      sourceUrl: capture.sourceUrl || args.feedUrl || 'https://www.linkedin.com/jobs/',
    }
  : loadLinkedInDiscoveryRecordsFromEnv(process.env);
const result = normalizeLinkedInJobRecords(discovery.records, { now, ownerEmail, sourceRunId });
const errors = [...discovery.errors, ...result.errors];

if (!discovery.requested && !args.fromCdp) {
  errors.push('No LinkedIn job records were provided. Set CAREER_OS_LINKEDIN_JOB_RECORDS_JSON, CAREER_OS_LINKEDIN_RECORDS_FILE, or CAREER_OS_LINKEDIN_JOB_URLS.');
}
if (discovery.requested && !result.summary.captured && !args.fromCdp) {
  errors.push('LinkedIn discovery requires actual job records with specific job URLs and employer apply URLs. The generic https://www.linkedin.com/jobs/ page is not actionable by itself.');
}

const sourceStatus = buildLinkedInSourceStatus({
  errors,
  records: discovery.records,
  sourceUrl: discovery.sourceUrl,
  summary: result.summary,
});
const persisted = persist
  ? await persistLinkedInResult({
      errors,
      ownerEmail,
      postings: result.postings,
      sourceRunId,
      sourceStatus,
      sourceUrl: discovery.sourceUrl || capture?.sourceUrl || args.feedUrl || 'https://www.linkedin.com/jobs/',
      summary: result.summary,
      timestamp: now,
    }).catch((error) => ({
      error: error instanceof Error ? error.message : String(error),
      ok: false,
      postingsPersisted: 0,
      requested: true,
      sourceRunId,
      sourceRunPersisted: false,
    }))
  : { requested: false };

const finalStatus = capture?.reason === 'linkedin_authenticated_session_required'
  ? 'BLOCKED — LINKEDIN AUTHENTICATED SESSION REQUIRED'
  : capture?.reason === 'linkedin_cdp_connect_failed' || capture?.reason === 'linkedin_cdp_capture_failed'
    ? 'BLOCKED — LINKEDIN BROWSER ATTACH FAILED'
  : capture?.reason === 'linkedin_page_structure_not_supported'
    ? 'BLOCKED — LINKEDIN PAGE STRUCTURE NOT SUPPORTED'
    : result.summary.workdayQueued
  ? 'LINKEDIN FEED DISCOVERY ACTIVE — WORKDAY JOBS QUEUED'
  : result.summary.easyApplyDeferred
    ? 'LINKEDIN FEED DISCOVERY ACTIVE — EASY APPLY DEFERRED'
    : result.summary.captured
      ? 'LINKEDIN FEED DISCOVERY ACTIVE — NO QUALITY WORKDAY MATCHES'
      : args.fromCdp
        ? 'BLOCKED — LINKEDIN PAGE STRUCTURE NOT SUPPORTED'
        : 'BLOCKED — LINKEDIN AUTHENTICATED SESSION REQUIRED';

const output = JSON.stringify({
  ok: finalStatus.startsWith('LINKEDIN FEED DISCOVERY ACTIVE'),
  captureEvidencePath: capture?.outputPath || '',
  confirmationEvidencePaths: [],
  finalStatus,
  generatedAt: now,
  linkedinFeedOpened: Boolean(capture?.feedOpened),
  linkedinJobCardsInspected: Number(capture?.summary?.feedCardsInspected || result.summary.feedCardsInspected || 0),
  linkedinJobRecordsCaptured: Number(result.summary.captured || 0),
  jobsClickedOpened: Number(capture?.summary?.feedJobsClicked || result.summary.feedJobsClicked || 0),
  employerApplyLinksResolved: Number(capture?.summary?.employerApplyLinksResolved || result.summary.employerApplyLinksResolved || 0),
  jobsHeldBelowCompFloor: Number(result.summary.compBelowFloorReject || 0),
  jobsHeldNearFloorReview: Number(result.summary.compNearFloorReview || 0),
  jobsUnknownCompStrongFit: Number(result.summary.compUnknownStrongFit || 0),
  ownerEmail,
  persisted,
  screenshotEvidencePath: capture?.screenshotPath || '',
  searchLocationsUsed: result.summary.searchLocationsUsed || capture?.searchInputs?.map((input) => input.location).filter(Boolean) || [],
  searchTermsUsed: result.summary.searchTermsUsed || capture?.searchInputs?.map((input) => input.keywords).filter(Boolean) || [],
  sourceStatus,
  summary: result.summary,
  topHoldReasons: result.summary.topHoldReasons || [],
  errors,
  jobTitlesAndCompaniesCaptured: result.postings.map((posting) => ({
    company: posting.company,
    title: posting.title,
  })),
  workdayResolvedJobs: result.postings
    .filter((posting) => posting.raw_record?.destination_classification === 'workday_resolved')
    .map((posting) => ({
      company: posting.company,
      jobId: posting.raw_record?.workday_job_id || posting.external_requisition_id,
      tenant: posting.raw_record?.tenant,
      title: posting.title,
      url: posting.canonical_url,
    })),
  records: result.postings.map((posting) => ({
    company: posting.company,
    destination: posting.raw_record?.destination_classification,
    fitScore: posting.fit_score,
    id: posting.id,
    linkedinJobUrl: posting.raw_record?.linkedin_job_url,
    requisition: posting.external_requisition_id,
    routing: posting.raw_record?.linkedin_routing,
    status: posting.status,
    title: posting.title,
    url: posting.canonical_url,
  })),
}, null, 2);

console.log(output);
if (args.fromCdp && process.env.CAREER_OS_LINKEDIN_KEEP_PROCESS_ALIVE !== '1') {
  process.exit(0);
}

async function captureAuthenticatedLinkedInFeed({ args: parsedArgs, now: capturedAt, root: projectRoot }) {
  const feedInputs = linkedInFeedInputs(parsedArgs, process.env);
  const feedUrl = feedInputs[0]?.url || 'https://www.linkedin.com/jobs/';
  const outputPath = path.resolve(projectRoot, clean(parsedArgs.output || process.env.CAREER_OS_LINKEDIN_CAPTURE_FILE) || defaultCapturePath(projectRoot, capturedAt));
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const screenshotPath = outputPath.replace(/\.json$/i, '.png');
  const endpoints = cdpEndpointCandidates(process.env, parsedArgs.cdpUrl);
  const verified = [];
  for (const endpoint of endpoints) {
    const check = await verifyCdpEndpoint(endpoint, { timeoutMs: 2500 });
    if (check.ok) {
      verified.push(check);
      break;
    }
  }
  if (!verified.length && parsedArgs.launchControlled) {
    const launched = await launchControlledLinkedInBrowser({
      feedUrl,
      root: projectRoot,
    });
    if (launched.ok) {
      const check = await verifyCdpEndpoint(launched.endpoint, { timeoutMs: 2500 });
      if (check.ok) verified.push(check);
    }
  }
  if (!verified.length) {
    return {
      errors: ['No reachable localhost CDP endpoint was found for the authenticated LinkedIn browser session.'],
      feedOpened: false,
      ok: false,
      outputPath,
      reason: 'linkedin_authenticated_session_required',
      records: [],
      screenshotPath: '',
      sourceUrl: feedUrl,
      searchInputs: feedInputs,
      summary: {
        captured: 0,
        employerApplyLinksResolved: 0,
        feedCardsInspected: 0,
        feedJobsClicked: 0,
      },
    };
  }

  const { chromium } = await import('playwright');
  let browser;
  let cdpEndpoint = verified[0].endpoint;
  try {
    browser = await chromium.connectOverCDP(cdpEndpoint, { timeout: 30000 });
  } catch (error) {
    const recoveryErrors = [];
    if (parsedArgs.launchControlled) {
      const stopped = await stopControlledBrowser({
        root: projectRoot,
        stateDir: defaultControlledBrowserStateDir(projectRoot),
      }).catch((stopError) => ({
        ok: false,
        reason: stopError instanceof Error ? stopError.message : String(stopError),
      }));
      if (!stopped.ok) recoveryErrors.push(`Controlled LinkedIn browser recovery stop failed: ${stopped.reason || 'unknown error'}`);
      const launched = await launchControlledLinkedInBrowser({
        feedUrl,
        root: projectRoot,
      });
      if (!launched.ok) recoveryErrors.push(`Controlled LinkedIn browser relaunch failed: ${launched.reason || 'unknown error'}`);
      const launchedEndpoint = launched.ok ? stripTrailingSlash(launched.endpoint) : '';
      if (launchedEndpoint) {
        const check = await verifyCdpEndpoint(launchedEndpoint, { timeoutMs: 10000 });
        if (check.ok) {
          cdpEndpoint = launchedEndpoint;
          browser = await chromium.connectOverCDP(cdpEndpoint, { timeout: 30000 }).catch(() => null);
        } else recoveryErrors.push(`Controlled LinkedIn browser relaunch endpoint was not ready: ${check.reason || 'unknown error'}`);
      }
    }
    if (!browser) {
      return {
        errors: [
          `LinkedIn browser CDP endpoint was reachable, but Career OS could not attach to it: ${error instanceof Error ? error.message : String(error)}`,
          ...recoveryErrors,
        ],
        feedOpened: false,
        ok: false,
        outputPath,
        reason: 'linkedin_cdp_connect_failed',
        records: [],
        screenshotPath: '',
        sourceUrl: feedUrl,
        searchInputs: feedInputs,
        summary: {
          captured: 0,
          employerApplyLinksResolved: 0,
          feedCardsInspected: 0,
          feedJobsClicked: 0,
        },
      };
    }
  }
  let artifact;
  try {
    const context = browser.contexts()[0] || await browser.newContext();
    const page = context.pages().find((candidate) => /linkedin\.com\/jobs/i.test(candidate.url()))
      || context.pages().find((candidate) => /linkedin\.com/i.test(candidate.url()))
      || await context.newPage();
    await page.bringToFront().catch(() => {});
    const capture = await captureLinkedInSearchInputs(page, {
      clickExternalApply: parsedArgs.clickExternalApply,
      feedInputs,
      maxCards: parsedArgs.maxCards,
      maxDetails: parsedArgs.maxDetails,
      maxWorkdayRoutes: parsedArgs.maxWorkdayRoutes,
      now: capturedAt,
      sourceEvidencePath: outputPath,
    });
    await page.screenshot({ fullPage: false, path: screenshotPath }).catch(() => {});
    artifact = {
      ...capture,
      capturedAt,
      cdpEndpoint,
      feedOpened: true,
      outputPath,
      screenshotPath,
    };
    fs.writeFileSync(outputPath, `${JSON.stringify({
      capturedAt,
      cards: capture.cards,
      errors: capture.errors,
      feedOpened: true,
      records: capture.records,
      searchInputs: capture.searchInputs,
      screenshotPath,
      sourceUrl: capture.sourceUrl,
      summary: capture.summary,
    }, null, 2)}\n`, 'utf8');
    return artifact;
  } finally {
    await disconnectFromCdpWithoutClosingChrome(browser);
  }
}

async function captureLinkedInSearchInputs(page, options = {}) {
  const maxCards = Math.max(1, Number(options.maxCards || 50));
  const maxDetails = Math.max(0, Number(options.maxDetails || 15));
  const now = clean(options.now) || new Date().toISOString();
  const sourceEvidencePath = clean(options.sourceEvidencePath);
  const searchInputs = options.feedInputs?.length ? options.feedInputs : [{ url: 'https://www.linkedin.com/jobs/' }];
  const cards = [];
  const errors = [];
  for (const input of searchInputs) {
    if (cards.length >= maxCards) break;
    const remaining = maxCards - cards.length;
    try {
      await page.goto(input.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForLoadState('domcontentloaded', { timeout: 30000 }).catch(() => {});
      await page.waitForTimeout(1500).catch(() => {});
      const pageText = await safeBodyText(page);
      if (/sign in|join linkedin|authwall|verify|checkpoint|login/i.test(pageText) && !/jobs that match|jobs for you|top applicant|easy apply|promoted/i.test(pageText)) {
        return {
          cards: [],
          details: [],
          errors: ['LinkedIn authenticated jobs feed was not visible.'],
          ok: false,
          reason: 'linkedin_authenticated_session_required',
          records: [],
          searchInputs,
          sourceUrl: input.url,
          summary: {
            captured: 0,
            employerApplyLinksResolved: 0,
            feedCardsInspected: 0,
            feedJobsClicked: 0,
          },
        };
      }
      const captured = await extractLinkedInFeedCardsFromPage(page, {
        limit: remaining,
        now,
        searchLocation: input.location,
        searchTerm: input.keywords,
        sourceEvidencePath,
        sourceUrl: input.url,
      });
      cards.push(...captured);
      if (!captured.length) errors.push(`${input.keywords || input.url}: no visible LinkedIn job cards captured`);
    } catch (error) {
      errors.push(`${input.keywords || input.url}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  const ranked = rankLinkedInFeedRecords(cards, { limit: maxDetails });
  const details = [];
  for (const card of ranked) {
    try {
      const detailPage = await page.context().newPage();
      try {
        await detailPage.goto(clean(card.linkedinJobUrl), { waitUntil: 'domcontentloaded', timeout: 30000 });
        await detailPage.waitForTimeout(1000).catch(() => {});
        let detail = await extractLinkedInJobDetailFromPage(detailPage, card, {
          now,
          sourceEvidencePath,
          sourceUrl: card.sourceUrl || card.linkedinJobUrl,
        });
        detail = await resolveLinkedInExternalApplyUrl(detailPage, detail, {
          clickExternalApply: options.clickExternalApply !== false,
          timeoutMs: 6000,
        });
        details.push(detail);
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
  const normalized = normalizeLinkedInJobRecords(records, { now });
  return {
    cards,
    details,
    errors,
    ok: true,
    records,
    searchInputs,
    sourceUrl: searchInputs.map((input) => input.url).join('\n'),
    summary: {
      ...normalized.summary,
      captured: records.length,
      employerApplyLinksResolved: records.filter((record) => clean(record.externalApplyUrl || record.external_apply_url || record.applyUrl || record.employerApplyUrl)).length,
      feedCardsInspected: cards.length,
      feedJobsClicked: details.filter((record) => record.detailOpened !== false).length,
    },
  };
}

async function launchControlledLinkedInBrowser({ feedUrl, root: projectRoot }) {
  const profile = resolveControlledBrowserProfile({
    env: process.env,
    root: projectRoot,
    stateDir: defaultControlledBrowserStateDir(projectRoot),
  });
  if (!profile.ok) return { ok: false, reason: profile.reason };
  const executable = resolveChromeExecutable({ env: process.env });
  if (!executable.ok) return { ok: false, reason: executable.reason };
  const selectedPort = await selectAvailableLocalPort(process.env.CAREER_OS_LINKEDIN_DEBUG_PORT || process.env.CAREER_OS_BROWSER_DEBUG_PORT || 9222, {
    attempts: 40,
    host: '127.0.0.1',
  });
  if (!selectedPort.ok) return { ok: false, reason: selectedPort.reason };
  const endpoint = `http://${selectedPort.host}:${selectedPort.port}`;
  const args = buildControlledChromeArgs({
    cdpHost: selectedPort.host,
    cdpPort: selectedPort.port,
    profilePath: profile.profilePath,
    url: feedUrl,
  });
  const child = spawn(executable.executable, args, { detached: true, stdio: 'ignore' });
  const pid = Number(child?.pid || 0);
  if (!pid) return { ok: false, reason: 'Chrome launch did not return a PID.' };
  if (typeof child.unref === 'function') child.unref();
  const cdp = await pollCdpEndpoint(endpoint, { pollMs: 500, timeoutMs: 20000 });
  if (!cdp.ok) return { ok: false, endpoint, reason: cdp.reason };
  writeControlledBrowserState(projectRoot, {
    browserPid: pid,
    cdpEndpoint: endpoint,
    cdpHost: selectedPort.host,
    cdpPort: selectedPort.port,
    executable: executable.executable,
    expectedJobId: '',
    expectedTenant: 'linkedin',
    initialUrlSanitized: feedUrl,
    launchedAt: new Date().toISOString(),
    profilePath: profile.profilePath,
    status: 'CONTROLLED BROWSER READY — LINKEDIN JOBS OPEN',
    workdayTab: null,
  }, profile.stateDir);
  return { ok: true, endpoint, pid };
}

async function disconnectFromCdpWithoutClosingChrome(browser) {
  try {
    if (typeof browser?._connection?.close === 'function') {
      await browser._connection.close();
      return;
    }
  } catch {}
  if (process.env.CAREER_OS_LINKEDIN_CLOSE_CDP_BROWSER === '1' && typeof browser?.close === 'function') {
    await browser.close().catch(() => {});
  }
}

function cdpEndpointCandidates(env = process.env, explicit = '') {
  const endpoints = new Set();
  for (const value of [
    explicit,
    env.CAREER_OS_LINKEDIN_CDP_URL,
    env.CAREER_OS_BROWSER_CDP_URL,
    env.CAREER_OS_CHROME_CDP_URL,
    env.CAREER_OS_WORKDAY_OBSERVE_CDP_URL,
  ]) {
    if (clean(value)) endpoints.add(stripTrailingSlash(clean(value)));
  }
  for (const value of [
    env.CAREER_OS_LINKEDIN_DEBUG_PORT,
    env.CAREER_OS_BROWSER_DEBUG_PORT,
    env.CAREER_OS_CHROME_DEBUG_PORT,
    env.CAREER_OS_WORKDAY_OBSERVE_DEBUG_PORT,
  ]) {
    const port = Number(value);
    if (Number.isInteger(port) && port > 0) endpoints.add(`http://127.0.0.1:${port}`);
  }
  for (const port of [9222, 9223, 9333]) endpoints.add(`http://127.0.0.1:${port}`);
  return Array.from(endpoints).filter(Boolean);
}

function linkedInFeedInputs(args = {}, env = process.env) {
  const explicitUrls = [
    ...nonEmptyList(args.feedUrls),
    clean(args.feedUrl),
    ...nonEmptyList(env.CAREER_OS_LINKEDIN_FEED_URLS),
    clean(env.CAREER_OS_LINKEDIN_FEED_URL),
  ].filter(Boolean);
  if (explicitUrls.length) {
    return explicitUrls.map((url) => ({ url }));
  }
  const tunedSearch = args.tunedSearch || env.CAREER_OS_LINKEDIN_TUNED_SEARCH === '1';
  if (!tunedSearch) return [{ url: 'https://www.linkedin.com/jobs/' }];
  return defaultLinkedInSearchInputs({
    locations: nonEmptyList(args.searchLocations).length ? args.searchLocations : env.CAREER_OS_LINKEDIN_SEARCH_LOCATIONS,
    maxInputs: Number(args.maxSearches || env.CAREER_OS_LINKEDIN_MAX_SEARCHES || 12),
    terms: nonEmptyList(args.searchTerms).length ? args.searchTerms : env.CAREER_OS_LINKEDIN_SEARCH_TERMS,
  });
}

function defaultCapturePath(projectRoot, capturedAt) {
  const stamp = clean(capturedAt).replace(/[:.]/g, '-');
  return path.join(projectRoot, '.career-os-browser-worker', 'linkedin-feed-captures', `linkedin-feed-capture-${stamp}.json`);
}

function parseArgs(argv) {
  const parsed = {
    cdpUrl: '',
    clickExternalApply: process.env.CAREER_OS_LINKEDIN_CLICK_APPLY !== '0',
    feedUrl: '',
    feedUrls: [],
    fromCdp: process.env.CAREER_OS_LINKEDIN_FROM_CDP === '1',
    launchControlled: process.env.CAREER_OS_LINKEDIN_LAUNCH_CONTROLLED === '1',
    maxCards: Number(process.env.CAREER_OS_LINKEDIN_MAX_CARDS || 25),
    maxDetails: Number(process.env.CAREER_OS_LINKEDIN_MAX_DETAILS || 10),
    maxSearches: Number(process.env.CAREER_OS_LINKEDIN_MAX_SEARCHES || 12),
    maxWorkdayRoutes: Number(process.env.CAREER_OS_LINKEDIN_MAX_WORKDAY_ROUTES || 5),
    output: '',
    persist: process.env.CAREER_OS_LINKEDIN_PERSIST === '1',
    searchLocations: [],
    searchTerms: [],
    tunedSearch: process.env.CAREER_OS_LINKEDIN_TUNED_SEARCH === '1',
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--from-cdp') parsed.fromCdp = true;
    else if (arg === '--launch-controlled') {
      parsed.fromCdp = true;
      parsed.launchControlled = true;
    }
    else if (arg === '--no-click-apply') parsed.clickExternalApply = false;
    else if (arg === '--feed-url') parsed.feedUrls.push(argv[index += 1] || '');
    else if (arg === '--feed-urls') parsed.feedUrls.push(...nonEmptyList(argv[index += 1] || ''));
    else if (arg === '--tuned-search') parsed.tunedSearch = true;
    else if (arg === '--search-term') parsed.searchTerms.push(argv[index += 1] || '');
    else if (arg === '--search-terms') parsed.searchTerms.push(...nonEmptyList(argv[index += 1] || ''));
    else if (arg === '--search-location') parsed.searchLocations.push(argv[index += 1] || '');
    else if (arg === '--search-locations') parsed.searchLocations.push(...nonEmptyList(argv[index += 1] || ''));
    else if (arg === '--cdp-url') parsed.cdpUrl = argv[index += 1] || '';
    else if (arg === '--output') parsed.output = argv[index += 1] || '';
    else if (arg === '--persist') parsed.persist = true;
    else if (arg === '--max-cards') parsed.maxCards = Number(argv[index += 1] || parsed.maxCards);
    else if (arg === '--max-details') parsed.maxDetails = Number(argv[index += 1] || parsed.maxDetails);
    else if (arg === '--max-searches') parsed.maxSearches = Number(argv[index += 1] || parsed.maxSearches);
    else if (arg === '--max-workday-routes') parsed.maxWorkdayRoutes = Number(argv[index += 1] || parsed.maxWorkdayRoutes);
  }
  parsed.feedUrl = parsed.feedUrls.find(Boolean) || parsed.feedUrl;
  return parsed;
}

async function persistLinkedInResult({ errors = [], ownerEmail, postings = [], sourceRunId, sourceStatus = {}, sourceUrl, summary = {}, timestamp }) {
  const supabaseUrl = clean(process.env.SUPABASE_URL);
  const serviceRoleKey = clean(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!supabaseUrl || !serviceRoleKey || serviceRoleKey.startsWith('[')) {
    return {
      error: 'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required to persist LinkedIn discovery.',
      ok: false,
      postingsPersisted: 0,
      requested: true,
      sourceRunPersisted: false,
    };
  }

  const sourceRun = {
    id: sourceRunId,
    owner_email: ownerEmail,
    source_type: 'linkedin_jobs_authenticated_discovery',
    source_name: 'LinkedIn Jobs authenticated discovery',
    source_url: clean(sourceUrl || sourceStatus.source_url || 'https://www.linkedin.com/jobs/'),
    status: errors.length && !Number(summary.inspected || 0) ? 'failed' : 'succeeded',
    executed_at: timestamp,
    number_reviewed: Number(summary.inspected || summary.captured || 0),
    number_accepted: postings.length,
    number_skipped: Number(summary.rejectedByQualityGate || summary.deferred || 0),
    search_config: {
      source: 'linkedin_jobs',
      errors: errors.slice(0, 5),
      search_locations_used: summary.searchLocationsUsed || [],
      search_terms_used: summary.searchTermsUsed || [],
      top_hold_reasons: summary.topHoldReasons || [],
      workday_queued: Number(summary.workdayQueued || 0),
      easy_apply_deferred: Number(summary.easyApplyDeferred || 0),
      greenhouse_deferred: Number(summary.greenhouseDeferred || 0),
    },
    evidence: postings.slice(0, 10).map((posting) => ({
      company: posting.company,
      title: posting.title,
      canonical_url: posting.canonical_url,
      destination: posting.raw_record?.destination_classification || '',
      fit_score: posting.fit_score,
      linkedin_job_url: posting.raw_record?.linkedin_job_url || '',
    })),
  };

  await supabaseUpsert(supabaseUrl, serviceRoleKey, 'career_os_source_runs', sourceRun);

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
  const rows = postings.map((posting) => Object.fromEntries(
    postingColumns.map((column) => [
      column,
      posting[column] === undefined ? null : posting[column],
    ])
  ));

  if (rows.length) {
    const batchSize = 100;
    for (let start = 0; start < rows.length; start += batchSize) {
      await supabaseUpsert(supabaseUrl, serviceRoleKey, 'career_os_job_postings', rows.slice(start, start + batchSize));
    }
  }

  return {
    ok: true,
    postingsPersisted: rows.length,
    requested: true,
    sourceRunId,
    sourceRunPersisted: true,
  };
}

async function supabaseUpsert(supabaseUrl, serviceRoleKey, table, payload) {
  const response = await fetch(`${supabaseUrl}/rest/v1/${table}?on_conflict=id`, {
    body: JSON.stringify(payload),
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    method: 'POST',
  });
  if (!response.ok) {
    throw new Error(`${table} upsert failed with ${response.status}: ${await response.text()}`);
  }
}

function loadDotEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const key = match[1];
    if (process.env[key]) continue;
    process.env[key] = match[2].trim().replace(/^"|"$/g, '');
  }
}

function clean(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function stripTrailingSlash(value) {
  return clean(value).replace(/\/+$/g, '');
}

function deterministicUuid(input) {
  const hash = crypto.createHash('sha1').update(input).digest();
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const hex = hash.subarray(0, 16).toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function buildLinkedInCaptureFailure({ args: parsedArgs = {}, error, now: capturedAt, root: projectRoot }) {
  const feedInputs = linkedInFeedInputs(parsedArgs, process.env);
  const feedUrl = feedInputs[0]?.url || 'https://www.linkedin.com/jobs/';
  const outputPath = path.resolve(projectRoot, clean(parsedArgs.output || process.env.CAREER_OS_LINKEDIN_CAPTURE_FILE) || defaultCapturePath(projectRoot, capturedAt));
  return {
    errors: [`LinkedIn capture failed before records could be inspected: ${error instanceof Error ? error.message : String(error)}`],
    feedOpened: false,
    ok: false,
    outputPath,
    reason: 'linkedin_cdp_capture_failed',
    records: [],
    screenshotPath: '',
    sourceUrl: feedUrl,
    searchInputs: feedInputs,
    summary: {
      captured: 0,
      employerApplyLinksResolved: 0,
      feedCardsInspected: 0,
      feedJobsClicked: 0,
    },
  };
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

function nonEmptyList(value) {
  if (Array.isArray(value)) return value.map(clean).filter(Boolean);
  return String(value || '').split(/[\n,;]+/).map(clean).filter(Boolean);
}
