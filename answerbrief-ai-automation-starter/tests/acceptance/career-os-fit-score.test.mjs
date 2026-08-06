import assert from 'node:assert/strict';
import test from 'node:test';

import { loadTsModule } from '../helpers/load-ts-module.mjs';
import {
  scoreJobPosting,
  scoreOracleJobPosting,
  scoreLinkedInJobRecord,
} from '../../scripts/lib/career-os-fit-score.mjs';

// --- Reference implementations -------------------------------------------
// These are the exact algorithms that used to live independently in
// lib/career-os-daily-cycle.ts (scorePosting/scoreOraclePosting) and
// scripts/lib/career-os-linkedin-discovery.mjs (scoreLinkedInRecord) before
// they were consolidated into scripts/lib/career-os-fit-score.mjs. They are
// kept here, inert, purely as a regression oracle: if the shared module ever
// drifts from this pre-consolidation behavior, these tests catch it.
function referenceScorePosting(job, description) {
  const title = String(job.title || '').toLowerCase();
  const text = `${title} ${String((job.location || {}).name || '')} ${description}`.toLowerCase();
  let score = 30;
  if (referenceHasPhrase(title, 'senior director')) score += 22;
  else if (referenceHasPhrase(title, 'director')) score += 16;
  else if (referenceHasPhrase(title, 'principal') || referenceHasPhrase(title, 'group product')) score += 14;
  if (referenceHasPhrase(title, 'product management')) score += 25;
  else if (referenceHasPhrase(title, 'product manager') || /\bproduct\b/.test(title)) score += 19;
  if (referenceHasPhrase(title, 'transformation') || referenceHasPhrase(text, 'business transformation')) score += 13;
  if (referenceHasPhrase(title, 'consultant') || referenceHasPhrase(title, 'strategy') || referenceHasPhrase(title, 'advisor')) score += 8;
  if (referenceHasPhrase(text, 'digital transformation') || referenceHasPhrase(text, 'operating model') || referenceHasPhrase(text, 'change management')) score += 9;
  if (referenceHasPhrase(title, 'platform') || referenceHasPhrase(text, 'platform strategy') || referenceHasPhrase(text, 'workflow')) score += 8;
  if (referenceHasPhrase(text, 'customer experience') || referenceHasPhrase(text, 'customer journey') || referenceHasPhrase(text, 'contact center') || referenceHasPhrase(text, 'ccaas') || referenceHasPhrase(text, 'ucaas') || referenceHasPhrase(text, 'cxone')) score += 9;
  if (referenceHasPhrase(text, 'telecom') || referenceHasPhrase(text, 'communications') || referenceHasPhrase(text, 'connectivity') || referenceHasPhrase(text, 'wireless') || referenceHasPhrase(text, 'broadband')) score += 8;
  if (referenceHasPhrase(text, 'automation') || /\bai\b/.test(text) || referenceHasPhrase(text, 'agentic') || referenceHasPhrase(text, 'adoption')) score += 6;
  if (referenceHasPhrase(text, 'payments') || referenceHasPhrase(text, 'cards') || referenceHasPhrase(text, 'fintech')) score += 2;
  if (/remote\s*-\s*us|remote,\s*us|united states \(remote\)|usa\s*-\s*remote|work from home - us/i.test(String((job.location || {}).name || ''))) score += 7;
  if (/austin|dallas|plano|irving|houston|san antonio|texas/i.test(`${String((job.location || {}).name || '')} ${description}`)) score += 5;
  if (/remote canada|remote uk|remote poland|remote spain|india|ireland|london|dublin|germany|japan|israel/i.test(String((job.location || {}).name || ''))) score -= 25;
  if (!/\b(product|transformation|strategy|customer experience|consultant|platform|operations)\b/.test(title) && /compliance|counsel|sales|marketing|software engineer|learning|account executive|finance|designer|intern|apprentice/i.test(title)) score -= 34;
  return Math.min(score, 95);
}

function referenceScoreOraclePosting(job, description) {
  return referenceScorePosting({ title: String(job.Title || ''), location: { name: String(job.PrimaryLocation || '') } }, description);
}

function referenceScoreLinkedInRecord({ title, location, description }) {
  const text = referenceNormalized(`${title} ${location} ${description}`);
  const heading = referenceNormalized(title);
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

function referenceHasPhrase(text, phrase) {
  return String(text || '').toLowerCase().includes(String(phrase || '').toLowerCase());
}

function referenceNormalized(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

// --- Fixture matrix used for the fuzz-style equivalence check -----------
const TITLES = [
  'Senior Director, Product Management',
  'Product Manager',
  'Director, Platform Strategy',
  'Principal Product Manager',
  'Account Executive',
  'Software Engineer',
  'Group Product Manager, Payments',
  'Sr Product Manager, Platform Automation',
];
const LOCATIONS = [
  '',
  'Remote - US',
  'Remote, United States',
  'Austin, TX',
  'Dallas, TX',
  'Remote, Germany',
  'Remote UK',
  'India',
];
const DESCRIPTIONS = [
  '',
  'platform strategy telecom automation',
  'customer experience contact center wireless broadband',
  'digital transformation operating model change management payments cards fintech',
  'Lead product management, platform strategy, automation, customer experience, wireless roadmap, and cross-functional delivery.',
];

test('scoreJobPosting (Greenhouse/Workday) matches the pre-consolidation reference across a fixture matrix', () => {
  for (const title of TITLES) {
    for (const location of LOCATIONS) {
      for (const description of DESCRIPTIONS) {
        const job = { title, location: { name: location } };
        assert.equal(
          scoreJobPosting(job, description),
          referenceScorePosting(job, description),
          `mismatch for title="${title}" location="${location}" description="${description}"`,
        );
      }
    }
  }
});

test('scoreOracleJobPosting matches the pre-consolidation reference across a fixture matrix', () => {
  for (const title of TITLES) {
    for (const location of LOCATIONS) {
      for (const description of DESCRIPTIONS) {
        const job = { Title: title, PrimaryLocation: location };
        assert.equal(scoreOracleJobPosting(job, description), referenceScoreOraclePosting(job, description));
      }
    }
  }
});

test('scoreLinkedInJobRecord matches the pre-consolidation reference across a fixture matrix', () => {
  for (const title of TITLES) {
    for (const location of LOCATIONS) {
      for (const description of DESCRIPTIONS) {
        const record = { title, location, description };
        assert.equal(scoreLinkedInJobRecord(record), referenceScoreLinkedInRecord(record));
      }
    }
  }
});

// --- Hand-verified branch coverage (documents intended behavior) --------

test('scoreJobPosting: senior director + product management title-only', () => {
  assert.equal(scoreJobPosting({ title: 'Senior Director, Product Management', location: { name: '' } }, ''), 77);
});

test('scoreJobPosting: platform + telecom + automation text bonuses stack', () => {
  assert.equal(scoreJobPosting({ title: 'Product Manager', location: { name: '' } }, 'platform strategy telecom automation'), 71);
});

test('scoreJobPosting: non-product sales title triggers the negative branch and can go below zero', () => {
  assert.equal(scoreJobPosting({ title: 'Account Executive', location: { name: '' } }, ''), -4);
});

test('scoreJobPosting: remote-US bonus applies', () => {
  assert.equal(scoreJobPosting({ title: 'Product Manager', location: { name: 'Remote - US' } }, ''), 56);
});

test('scoreJobPosting: Texas city bonus applies', () => {
  assert.equal(scoreJobPosting({ title: 'Product Manager', location: { name: 'Austin, TX' } }, ''), 54);
});

test('scoreJobPosting: non-US remote locations are penalized', () => {
  assert.equal(scoreJobPosting({ title: 'Product Manager', location: { name: 'Remote, Germany' } }, ''), 24);
});

test('scoreOracleJobPosting: remaps Oracle PascalCase fields onto scoreJobPosting exactly', () => {
  const oracleJob = { Title: 'Senior Director, Product Management', PrimaryLocation: '' };
  const equivalentJob = { title: 'Senior Director, Product Management', location: { name: '' } };
  assert.equal(scoreOracleJobPosting(oracleJob, ''), scoreJobPosting(equivalentJob, ''));
  assert.equal(scoreOracleJobPosting(oracleJob, ''), 77);
});

test('scoreLinkedInJobRecord: known Workday LinkedIn fixture scores 87 (matches routeToWorkday >= 85 threshold)', () => {
  assert.equal(scoreLinkedInJobRecord({
    title: 'Sr Product Manager, Platform Automation',
    location: 'Remote, United States',
    description: 'Lead product management, platform strategy, automation, customer experience, wireless roadmap, and cross-functional delivery.',
  }), 87);
});

test('scoreLinkedInJobRecord: non-product sales title triggers the negative branch', () => {
  assert.equal(scoreLinkedInJobRecord({ title: 'Account Executive', location: '', description: '' }), 2);
});

// --- Live call-site smoke test -------------------------------------------
// Loads the real .ts wrapper the way lib/career-os-daily-cycle.ts does, and
// the real .mjs the way scripts/career-os-linkedin-discovery.mjs does under
// plain `node`, proving both consumption paths actually resolve at runtime.
test('lib/career-os-fit-score.ts re-exports the same functions TypeScript callers import', () => {
  const tsWrapper = loadTsModule('lib/career-os-fit-score.ts');
  assert.equal(typeof tsWrapper.scoreJobPosting, 'function');
  assert.equal(typeof tsWrapper.scoreOracleJobPosting, 'function');
  assert.equal(typeof tsWrapper.scoreLinkedInJobRecord, 'function');
  assert.equal(
    tsWrapper.scoreJobPosting({ title: 'Senior Director, Product Management', location: { name: '' } }, ''),
    77,
  );
});
