// Canonical fit-score engine shared by every discovery source.
//
// This consolidates three previously independent, hand-maintained keyword
// scorers that had started to drift from each other:
//   - scorePosting()       (Greenhouse/Workday) in lib/career-os-daily-cycle.ts
//   - scoreOraclePosting() (Oracle/JPMorgan)     in lib/career-os-daily-cycle.ts
//   - scoreLinkedInRecord() (LinkedIn discovery)  in scripts/lib/career-os-linkedin-discovery.mjs
//
// Each function below is a byte-for-byte port of the original algorithm it
// replaces -- scoring behavior is intentionally unchanged. Do not "improve"
// the weights here without updating all call sites deliberately; this file
// is now the single place that happens.
//
// lib/career-os-fit-score.ts re-exports these for TypeScript callers. The
// canonical implementation lives here (plain .mjs) rather than in that .ts
// file because scripts/lib/career-os-linkedin-discovery.mjs runs under plain
// `node` in production (npm run linkedin:discover) with no TypeScript loader
// registered, so it cannot import a .ts module directly -- the existing
// scripts/lib/career-os-compensation-policy.mjs follows the same convention
// for the same reason.

export const FIT_SCORE_VERSION = 'career-os-fit-score-2026-08-05-v1-consolidated';

// Ported verbatim from lib/career-os-daily-cycle.ts `scorePosting()`.
// Used directly for Greenhouse and Workday postings, and indirectly for
// Oracle postings via scoreOracleJobPosting() below.
export function scoreJobPosting(job, description) {
  const title = String(job.title || '').toLowerCase();
  const text = `${title} ${String(asRecord(job.location).name || '')} ${description}`.toLowerCase();
  let score = 30;
  if (hasPhrase(title, 'senior director')) score += 22;
  else if (hasPhrase(title, 'director')) score += 16;
  else if (hasPhrase(title, 'principal') || hasPhrase(title, 'group product')) score += 14;
  if (hasPhrase(title, 'product management')) score += 25;
  else if (hasPhrase(title, 'product manager') || /\bproduct\b/.test(title)) score += 19;
  if (hasPhrase(title, 'transformation') || hasPhrase(text, 'business transformation')) score += 13;
  if (hasPhrase(title, 'consultant') || hasPhrase(title, 'strategy') || hasPhrase(title, 'advisor')) score += 8;
  if (hasPhrase(text, 'digital transformation') || hasPhrase(text, 'operating model') || hasPhrase(text, 'change management')) score += 9;
  if (hasPhrase(title, 'platform') || hasPhrase(text, 'platform strategy') || hasPhrase(text, 'workflow')) score += 8;
  if (hasPhrase(text, 'customer experience') || hasPhrase(text, 'customer journey') || hasPhrase(text, 'contact center') || hasPhrase(text, 'ccaas') || hasPhrase(text, 'ucaas') || hasPhrase(text, 'cxone')) score += 9;
  if (hasPhrase(text, 'telecom') || hasPhrase(text, 'communications') || hasPhrase(text, 'connectivity') || hasPhrase(text, 'wireless') || hasPhrase(text, 'broadband')) score += 8;
  if (hasPhrase(text, 'automation') || /\bai\b/.test(text) || hasPhrase(text, 'agentic') || hasPhrase(text, 'adoption')) score += 6;
  if (hasPhrase(text, 'payments') || hasPhrase(text, 'cards') || hasPhrase(text, 'fintech')) score += 2;
  if (/remote\s*-\s*us|remote,\s*us|united states \(remote\)|usa\s*-\s*remote|work from home - us/i.test(String(asRecord(job.location).name || ''))) score += 7;
  if (/austin|dallas|plano|irving|houston|san antonio|texas/i.test(`${String(asRecord(job.location).name || '')} ${description}`)) score += 5;
  if (/remote canada|remote uk|remote poland|remote spain|india|ireland|london|dublin|germany|japan|israel/i.test(String(asRecord(job.location).name || ''))) score -= 25;
  if (!/\b(product|transformation|strategy|customer experience|consultant|platform|operations)\b/.test(title) && /compliance|counsel|sales|marketing|software engineer|learning|account executive|finance|designer|intern|apprentice/i.test(title)) score -= 34;
  return Math.min(score, 95);
}

// Ported verbatim from lib/career-os-daily-cycle.ts `scoreOraclePosting()`.
// Just remaps Oracle's PascalCase job shape onto scoreJobPosting().
export function scoreOracleJobPosting(job, description) {
  return scoreJobPosting({ title: String(job.Title || ''), location: { name: String(job.PrimaryLocation || '') } }, description);
}

// Ported verbatim from scripts/lib/career-os-linkedin-discovery.mjs `scoreLinkedInRecord()`.
export function scoreLinkedInJobRecord({ title, location, description }) {
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

function hasPhrase(text, phrase) {
  return String(text || '').toLowerCase().includes(String(phrase || '').toLowerCase());
}

function asRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function clean(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalized(value) {
  return clean(value).toLowerCase();
}
