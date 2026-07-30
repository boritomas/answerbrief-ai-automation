import assert from 'node:assert/strict';
import test from 'node:test';
import { chromium } from 'playwright';

import {
  buildLinkedInSearchUrl,
  classifyLinkedInApplyDestination,
  dedupeLinkedInJobRecords,
  defaultLinkedInSearchInputs,
  extractLinkedInFeedCardsFromPage,
  extractLinkedInJobDetailFromPage,
  loadLinkedInDiscoveryRecordsFromEnv,
  normalizeLinkedInJobRecord,
  normalizeLinkedInJobRecords,
  parseLinkedInJobUrl,
  rankLinkedInFeedRecords,
  resolveEmployerApplyDestination,
  summarizeLinkedInDiscovery,
} from '../../scripts/lib/career-os-linkedin-discovery.mjs';

const workdayRecord = {
  applyButtonType: 'Apply on company site',
  company: 'T-Mobile',
  description: 'Lead product management, platform strategy, automation, customer experience, wireless roadmap, and cross-functional delivery. Remote USA. Base salary $255,000 - $285,000.',
  externalApplyUrl: 'https://tmobile.wd1.myworkdayjobs.com/en-US/External/job/Bellevue-Washington/Sr-Product-Manager_REQ999999-1',
  linkedinJobUrl: 'https://www.linkedin.com/jobs/view/1234567890/',
  location: 'Remote, United States',
  title: 'Sr Product Manager, Platform Automation',
};

test('LinkedIn parser rejects generic jobs page and accepts concrete job URLs', () => {
  const generic = parseLinkedInJobUrl('https://www.linkedin.com/jobs/');
  assert.equal(generic.ok, false);
  assert.equal(generic.generic, true);
  assert.match(generic.reason, /generic_linkedin_jobs_page/);

  const concrete = parseLinkedInJobUrl('https://www.linkedin.com/jobs/view/1234567890/?trackingId=abc');
  assert.equal(concrete.ok, true);
  assert.equal(concrete.jobId, '1234567890');
});

test('LinkedIn tuned search inputs target senior platform AI product roles', () => {
  const inputs = defaultLinkedInSearchInputs({ maxInputs: 4 });
  assert.equal(inputs.length, 4);
  assert.match(inputs[0].keywords, /Director Product Management platform/i);
  assert.match(inputs[1].keywords, /AI/i);
  assert.match(inputs[0].url, /linkedin\.com\/jobs\/search/);
  assert.match(inputs[0].url, /keywords=Director\+Product\+Management\+platform/);
  assert.match(buildLinkedInSearchUrl({ keywords: 'Agentic AI Product Manager', location: 'Remote' }), /Agentic\+AI\+Product\+Manager/);
});

test('LinkedIn Workday external apply records route to Workday with tenant and job identity', () => {
  const destination = classifyLinkedInApplyDestination(workdayRecord);
  assert.equal(destination.classification, 'workday_resolved');
  assert.equal(destination.identity.tenant, 'tmobile.wd1');
  assert.equal(destination.identity.jobId, 'REQ999999-1');

  const result = normalizeLinkedInJobRecord(workdayRecord, {
    now: '2026-07-27T12:00:00.000Z',
    ownerEmail: 'tomas@nieves.com',
    sourceRunId: 'source-run-test',
  });
  assert.equal(result.ok, true);
  assert.equal(result.routeToWorkday, true);
  assert.equal(result.posting.raw_record.source_label, 'linkedin_discovery');
  assert.equal(result.posting.raw_record.linkedin_routing, 'queued_to_workday');
  assert.equal(result.posting.raw_record.ats_platform, 'workday');
  assert.equal(result.posting.status, 'discovered');
});

test('LinkedIn Easy Apply records are deferred and never marked as Workday queueable', () => {
  const result = normalizeLinkedInJobRecord({
    applyButtonType: 'Easy Apply',
    company: 'Example Co',
    linkedinJobUrl: 'https://www.linkedin.com/jobs/view/5555555555/',
    location: 'Remote',
    title: 'Director, Product Management',
  });
  assert.equal(result.ok, true);
  assert.equal(result.routeToWorkday, false);
  assert.equal(result.posting.raw_record.destination_classification, 'linkedin_easy_apply_deferred');
  assert.equal(result.posting.status, 'linkedin_easy_apply_deferred_or_manual');
});

test('LinkedIn Greenhouse destinations are preserved as deferred phase-two records', () => {
  const result = normalizeLinkedInJobRecord({
    company: 'Affirm',
    description: 'Director product management platform role with AI and customer experience.',
    externalApplyUrl: 'https://job-boards.greenhouse.io/affirm/jobs/1234567',
    linkedinJobUrl: 'https://www.linkedin.com/jobs/view/7777777777/',
    title: 'Director, Product Management',
  });
  assert.equal(result.ok, true);
  assert.equal(result.routeToWorkday, false);
  assert.equal(result.posting.raw_record.destination_classification, 'greenhouse_resolved_deferred');
  assert.equal(result.posting.status, 'deferred_phase_two_greenhouse');
});

test('LinkedIn destination classifier uses deeply resolved employer apply URLs', () => {
  const result = normalizeLinkedInJobRecord({
    company: 'Example Employer',
    description: 'Senior Director product management platform role with AI, automation, customer experience, and enterprise transformation. Compensation not posted.',
    externalApplyUrl: 'https://careers.example.com/jobs/123',
    externalApplyFinalUrl: 'https://example.wd5.myworkdayjobs.com/en-US/External/job/Remote/Senior-Director-Product_REQ333333-1',
    linkedinJobUrl: 'https://www.linkedin.com/jobs/view/3333333333/',
    location: 'Remote, United States',
    title: 'Senior Director Product Management, AI Platform',
  });

  assert.equal(result.posting.raw_record.destination_classification, 'workday_resolved');
  assert.equal(result.posting.raw_record.employer_apply_url, 'https://careers.example.com/jobs/123');
  assert.equal(result.posting.raw_record.employer_apply_final_url, 'https://example.wd5.myworkdayjobs.com/en-US/External/job/Remote/Senior-Director-Product_REQ333333-1');
  assert.equal(result.posting.raw_record.linkedin_routing, 'queued_to_workday');
});

test('LinkedIn employer apply resolver follows one bounded company-page hop to Workday', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext();
    await context.route('https://careers.example.com/jobs/123', (route) => route.fulfill({
      body: `
      <main>
        <h1>Senior Director Product Management, AI Platform</h1>
        <a href="https://example.wd5.myworkdayjobs.com/en-US/External/job/Remote/Senior-Director-Product_REQ444444-1">Apply now</a>
      </main>
      `,
      contentType: 'text/html',
    }));
    const resolved = await resolveEmployerApplyDestination(context, {
      externalApplyUrl: 'https://careers.example.com/jobs/123',
      linkedinJobUrl: 'https://www.linkedin.com/jobs/view/4444444444/',
    }, { timeoutMs: 2000 });

    assert.equal(resolved.externalApplyFinalUrl, 'https://example.wd5.myworkdayjobs.com/en-US/External/job/Remote/Senior-Director-Product_REQ444444-1');
    assert.equal(classifyLinkedInApplyDestination(resolved).classification, 'workday_resolved');
  } finally {
    await browser.close();
  }
});

test('LinkedIn non-Workday employer destinations are classified for future phases', () => {
  assert.equal(classifyLinkedInApplyDestination({ externalApplyUrl: 'https://jobs.lever.co/example/abc' }).classification, 'lever_deferred');
  assert.equal(classifyLinkedInApplyDestination({ externalApplyUrl: 'https://careers-realpagepms.icims.com/jobs/14045/login' }).classification, 'icims_deferred');
  assert.equal(classifyLinkedInApplyDestination({ externalApplyUrl: 'https://jobs.smartrecruiters.com/example/123' }).classification, 'smartrecruiters_deferred');
});

test('LinkedIn discovery dedupes records and holds below-floor compensation', () => {
  const records = [
    workdayRecord,
    { ...workdayRecord, title: 'Duplicate should collapse' },
    {
      ...workdayRecord,
      description: 'Product manager role with roadmap ownership. Base salary $145,000 - $160,000.',
      externalApplyUrl: 'https://tmobile.wd1.myworkdayjobs.com/en-US/External/job/Seattle/Product-Manager_REQ888888-1',
      linkedinJobUrl: 'https://www.linkedin.com/jobs/view/9999999999/',
      compensationText: '$145,000 - $160,000 base',
      title: 'Product Manager',
    },
  ];
  assert.equal(dedupeLinkedInJobRecords(records).length, 2);

  const result = normalizeLinkedInJobRecords(records, {
    now: '2026-07-27T12:00:00.000Z',
    ownerEmail: 'tomas@nieves.com',
    sourceRunId: 'source-run-test',
  });
  assert.equal(result.summary.inspected, 2);
  assert.equal(result.summary.workdayResolved, 2);
  assert.equal(result.summary.workdayQueued, 1);
  assert.equal(result.summary.rejectedByQualityGate, 1);
  assert.equal(result.summary.compBelowFloorReject, 1);
});

test('LinkedIn compensation parsing uses salary ranges and ignores benefit/company-dollar noise', () => {
  const result = normalizeLinkedInJobRecord({
    applyButtonType: 'Easy Apply',
    company: 'Gartner',
    description: 'A reasonable estimate of the base salary range for this role is 94,000 USD - 134,000 USD. We also offer a 401k match up to $7,200 per year and Gartner is a $6.5 billion company.',
    linkedinJobUrl: 'https://www.linkedin.com/jobs/view/4436527485/',
    location: 'Irving, TX',
    title: 'Sr Product Manager',
  });
  assert.equal(result.posting.compensation_min_usd, 94000);
  assert.equal(result.posting.compensation_max_usd, 134000);
  assert.equal(result.posting.raw_record.quality_gate_status, 'comp_below_floor_reject');
  assert.equal(result.posting.raw_record.compensation_policy_status, 'comp_below_floor_reject');
});

test('LinkedIn compensation bands expose near-floor and unknown-strong-fit counters', () => {
  const result = normalizeLinkedInJobRecords([
    {
      ...workdayRecord,
      description: 'Director product management platform role with AI roadmap. Base salary $175,000 - $189,000.',
      externalApplyUrl: 'https://example.wd1.myworkdayjobs.com/en-US/External/job/Remote/Director-Product_REQ111111-1',
      linkedinJobUrl: 'https://www.linkedin.com/jobs/view/1111111111/',
      title: 'Director Product Management, Platform',
    },
    {
      ...workdayRecord,
      description: 'Senior Director product management platform role with AI roadmap, customer experience, and enterprise transformation. Compensation not posted.',
      externalApplyUrl: 'https://example.wd1.myworkdayjobs.com/en-US/External/job/Remote/Senior-Director-Product_REQ222222-1',
      linkedinJobUrl: 'https://www.linkedin.com/jobs/view/2222222222/',
      title: 'Senior Director Product Management, AI Platform',
    },
  ]);
  assert.equal(result.summary.compNearFloorReview, 1);
  assert.equal(result.summary.compUnknownStrongFit, 1);
  assert.equal(result.summary.workdayResolved, 2);
  assert.equal(result.summary.workdayQueued, 1);
});

test('LinkedIn env loader accepts URL lists without treating profile URLs as jobs', () => {
  const loaded = loadLinkedInDiscoveryRecordsFromEnv({
    CAREER_OS_LINKEDIN_JOB_URLS: [
      'https://www.linkedin.com/jobs/view/1234567890/',
      'https://www.linkedin.com/jobs/',
    ].join('\n'),
  });
  assert.equal(loaded.requested, true);
  assert.equal(loaded.records.length, 2);
  const result = normalizeLinkedInJobRecords(loaded.records);
  assert.equal(result.summary.rejected, 1);
});

test('LinkedIn authenticated feed extractor captures visible job cards from the jobs feed', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(`
      <main>
        <ul>
          <li data-job-id="1111111111" class="jobs-search-results__list-item">
            <a class="job-card-list__title" href="https://www.linkedin.com/jobs/view/1111111111/" aria-label="Senior Product Manager at Verizon">Senior Product Manager</a>
            <span class="job-card-container__company-name">Verizon</span>
            <span class="job-card-container__metadata-item">Remote, United States</span>
            <span>Promoted</span>
            <span>Reposted 1 day ago</span>
          </li>
          <li data-job-id="2222222222" class="jobs-search-results__list-item">
            <a class="job-card-list__title" href="https://www.linkedin.com/jobs/view/2222222222/" aria-label="Account Executive at Example Sales">Account Executive</a>
            <span class="job-card-container__company-name">Example Sales</span>
            <span class="job-card-container__metadata-item">Dallas, TX</span>
            <span>Easy Apply</span>
          </li>
          <li>
            <a href="https://www.linkedin.com/in/tomasnieves/">Tomas profile</a>
          </li>
        </ul>
      </main>
    `);
    const records = await extractLinkedInFeedCardsFromPage(page, {
      limit: 25,
      now: '2026-07-27T18:00:00.000Z',
      searchLocation: 'Remote',
      searchTerm: 'Director Product Management AI',
      sourceEvidencePath: '/tmp/linkedin-feed-capture.json',
    });
    assert.equal(records.length, 2);
    assert.equal(records[0].linkedinJobId, '1111111111');
    assert.equal(records[0].title, 'Senior Product Manager');
    assert.equal(records[0].company, 'Verizon');
    assert.equal(records[0].remoteHybridOnsite, 'remote');
    assert.equal(records[0].feedCardsInspected, 2);
    assert.equal(records[0].linkedinSearchTerm, 'Director Product Management AI');
    assert.equal(records[0].linkedinSearchLocation, 'Remote');
    assert.equal(records[1].applyButtonType, 'Easy Apply');
  } finally {
    await browser.close();
  }
});

test('LinkedIn authenticated feed extractor accepts search-result cards with currentJobId', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(`
      <main>
        <a href="https://www.linkedin.com/jobs/search-results/?currentJobId=4370445571&keywords=Senior+Product+Manager">
          Senior Technology Product Manager (Verified job)
          Senior Technology Product Manager
          Wolters Kluwer • Coppell, TX (On-site) • 401(k), +2 benefits
          You’d be a top applicant
          Posted 2 weeks ago
        </a>
      </main>
    `);
    const records = await extractLinkedInFeedCardsFromPage(page, {
      limit: 25,
      now: '2026-07-27T18:00:00.000Z',
      sourceEvidencePath: '/tmp/linkedin-feed-capture.json',
    });
    assert.equal(records.length, 1);
    assert.equal(records[0].linkedinJobId, '4370445571');
    assert.equal(records[0].linkedinJobUrl, 'https://www.linkedin.com/jobs/view/4370445571/');
    assert.equal(records[0].title, 'Senior Technology Product Manager');
    assert.equal(records[0].company, 'Wolters Kluwer');
    assert.equal(records[0].location, 'Coppell, TX (On-site)');
  } finally {
    await browser.close();
  }
});

test('LinkedIn feed ranking prefers senior product roles over sales-heavy cards', () => {
  const ranked = rankLinkedInFeedRecords([
    {
      company: 'Example Sales',
      linkedinJobUrl: 'https://www.linkedin.com/jobs/view/2222222222/',
      title: 'Account Executive',
    },
    {
      company: 'Verizon',
      description: 'Product platform strategy, AI automation, customer experience, wireless roadmap, and executive stakeholders.',
      linkedinJobUrl: 'https://www.linkedin.com/jobs/view/1111111111/',
      location: 'Remote, United States',
      title: 'Senior Product Manager, Network API',
    },
  ]);
  assert.equal(ranked[0].company, 'Verizon');
  assert.ok(ranked[0].fitScore > ranked[1].fitScore);
});

test('LinkedIn detail extraction captures Workday employer apply URL and routes quality matches', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.route('https://www.linkedin.com/jobs/view/3333333333/', async (route) => {
      await route.fulfill({
        contentType: 'text/html',
        body: `
          <main>
            <h1 class="job-details-jobs-unified-top-card__job-title">Sr Product Manager, Platform Automation</h1>
            <a class="job-details-jobs-unified-top-card__company-name">T-Mobile</a>
            <span class="jobs-unified-top-card__bullet">Remote, United States</span>
            <a href="https://tmobile.wd1.myworkdayjobs.com/en-US/External/job/Bellevue-Washington/Sr-Product-Manager_REQ333333-1">Apply on company site</a>
            <section class="jobs-description__content">
              Lead product management, platform strategy, AI automation, customer experience, wireless roadmap, and cross-functional delivery.
              Base salary $255,000 - $285,000 with bonus and stock.
            </section>
          </main>
        `,
      });
    });
    await page.goto('https://www.linkedin.com/jobs/view/3333333333/');
    const detail = await extractLinkedInJobDetailFromPage(page, {
      linkedinJobUrl: 'https://www.linkedin.com/jobs/view/3333333333/',
    }, {
      now: '2026-07-27T18:00:00.000Z',
      sourceEvidencePath: '/tmp/linkedin-detail-capture.json',
    });
    assert.equal(detail.detailOpened, true);
    assert.match(detail.externalApplyUrl, /tmobile\.wd1\.myworkdayjobs\.com/);

    const result = normalizeLinkedInJobRecord(detail, {
      now: '2026-07-27T18:00:00.000Z',
      ownerEmail: 'tomas@nieves.com',
      sourceRunId: 'source-run-test',
    });
    assert.equal(result.routeToWorkday, true);
    assert.equal(result.posting.raw_record.linkedin_job_id, '3333333333');
    assert.equal(result.posting.raw_record.workday_job_id, 'REQ333333-1');
  } finally {
    await browser.close();
  }
});

test('LinkedIn discovery summary exposes feed card, click, and resolved-link counters', () => {
  const result = normalizeLinkedInJobRecords([
    {
      ...workdayRecord,
      detailOpened: true,
      feedCardsInspected: 25,
      sourceCaptureType: 'authenticated_linkedin_detail_pane',
    },
    {
      applyButtonType: 'Easy Apply',
      company: 'LinkedIn Only',
      detailOpened: true,
      feedCardsInspected: 25,
      linkedinJobUrl: 'https://www.linkedin.com/jobs/view/4444444444/',
      title: 'Senior Product Manager',
    },
  ]);
  const summary = summarizeLinkedInDiscovery(result);
  assert.equal(summary.feedCardsInspected, 25);
  assert.equal(summary.feedJobsClicked, 2);
  assert.equal(summary.employerApplyLinksResolved, 1);
  assert.equal(summary.easyApplyDeferred, 1);
});
