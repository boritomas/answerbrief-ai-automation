import { existsSync, readFileSync, statSync } from 'node:fs';
import { access } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
export const appRoot = path.join(repoRoot, 'answerbrief-ai-automation-starter');
export const syntheticRoot = path.join(repoRoot, 'fixtures', 'synthetic-career-os');
export const productionEvidencePath = path.join(repoRoot, 'data', 'career-os-production-evidence.json');

export const qualifyingHumanOnlyGates = new Set([
  'CAPTCHA',
  'MFA',
  'IDENTITY_VERIFICATION',
  'ACCOUNT_RECOVERY',
  'MISSING_LEGAL_FACT',
  'EXPLICIT_AUTOMATION_RESTRICTION',
  'IRRECOVERABLE_EXTERNAL_CREDENTIAL',
]);

export function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

export function normalizeOpportunity(raw) {
  const company = requiredString(raw.company, 'company').trim();
  const title = requiredString(raw.title, 'title').trim();
  const canonicalUrl = requiredString(raw.canonicalUrl, 'canonicalUrl').trim();
  const requisitionId = requiredString(raw.requisitionId, 'requisitionId').trim();
  const url = new URL(canonicalUrl);
  url.hash = '';
  url.searchParams.sort();

  return {
    ...raw,
    company,
    title,
    canonicalUrl: url.toString(),
    requisitionId,
    dedupeKey: [
      slug(company),
      slug(title),
      requisitionId.toLowerCase(),
    ].join('::'),
  };
}

export function rejectExpiredOpportunities(opportunities, now = new Date()) {
  return opportunities.filter((opportunity) => {
    if (opportunity.active !== true) return false;
    if (!opportunity.expiresAt) return true;
    return new Date(opportunity.expiresAt).getTime() >= now.getTime();
  });
}

export function dedupeOpportunities(opportunities) {
  const seen = new Map();

  for (const opportunity of opportunities.map(normalizeOpportunity)) {
    const canonicalPathKey = [
      slug(opportunity.company),
      slug(opportunity.title),
      normalizedPathIdentity(opportunity.canonicalUrl),
    ].join('::');
    const keys = new Set([opportunity.dedupeKey, canonicalPathKey]);
    const duplicateKey = [...keys].find((key) => seen.has(key));

    if (!duplicateKey) {
      for (const key of keys) seen.set(key, opportunity);
    }
  }

  return Array.from(new Set(seen.values()));
}

export function validateCandidateProfile(profile) {
  const issues = [];
  if (profile.environment !== 'synthetic' && profile.environment !== 'production') {
    issues.push('Profile environment must be synthetic or production.');
  }
  if (!profile.profileVersion) issues.push('Profile version is required.');
  if (!profile.candidate?.legalName) issues.push('Legal name is required.');
  if (!profile.reusableApplicationAnswers?.workAuthorization?.value) issues.push('Work authorization answer is required.');
  if (!profile.reusableApplicationAnswers?.sponsorshipNeed?.value) issues.push('Sponsorship answer is required.');

  for (const fact of profile.facts || []) {
    for (const key of ['source', 'evidenceReference', 'verificationState', 'confidence', 'profileVersion', 'lastReviewedAt']) {
      if (fact[key] === undefined || fact[key] === '') issues.push(`Fact ${fact.id || fact.claim || 'unknown'} missing ${key}.`);
    }
  }

  return {
    issues,
    passed: issues.length === 0,
  };
}

export function rejectUnsupportedClaims(claims, profile) {
  const allowedClaims = new Set((profile.facts || [])
    .filter((fact) => ['verified_fact', 'tomas_provided_fact'].includes(fact.verificationState))
    .map((fact) => fact.claim));

  return claims.filter((claim) => !allowedClaims.has(claim));
}

export function scoreAts(opportunity, profile) {
  const roleText = [
    opportunity.title,
    opportunity.description,
    ...(opportunity.requirements || []),
  ].join(' ').toLowerCase();
  const targetHits = (profile.targetRoles || []).filter((role) => hasAllTokens(roleText, role)).length;
  const skillEvidence = (profile.facts || []).filter((fact) => hasAnyToken(roleText, fact.claim)).length;
  const score = Math.min(0.99, 0.55 + targetHits * 0.2 + skillEvidence * 0.08);
  return round(score);
}

export function scoreAiReadiness(opportunity, profile) {
  const text = [
    opportunity.title,
    opportunity.description,
    ...(opportunity.requirements || []),
    ...(profile.facts || []).map((fact) => fact.claim),
  ].join(' ').toLowerCase();
  const signals = ['ai', 'automation', 'workflow', 'transformation', 'applied'];
  const hits = signals.filter((signal) => text.includes(signal)).length;
  return round(Math.min(0.99, 0.5 + hits * 0.09));
}

export function scoreRecruiterFit(opportunity, profile) {
  const compensation = opportunity.compensation;
  const compensationPass = !compensation?.minUsd || compensation.minUsd >= (profile.preferences?.compensationTargetMinUsd || 0);
  const excluded = (profile.excludedCompanies || []).some((company) => slug(company) === slug(opportunity.company));
  const remotePass = opportunity.location?.toLowerCase().includes('remote') ? Boolean(profile.preferences?.remote) : true;
  return round((compensationPass ? 0.35 : 0.1) + (!excluded ? 0.35 : 0) + (remotePass ? 0.2 : 0) + 0.08);
}

export function mapRequirementsToEvidence(opportunity, profile) {
  return (opportunity.requirements || []).map((requirement) => {
    const evidence = (profile.facts || []).find((fact) => hasAnyToken(fact.claim, requirement));
    return {
      requirement,
      evidenceReference: evidence?.evidenceReference || null,
      verificationState: evidence?.verificationState || 'requires_verification',
    };
  });
}

export function detectContradictions(artifactText, profile) {
  const contradictions = [];
  const sponsorshipAnswer = profile.reusableApplicationAnswers?.sponsorshipNeed?.value || '';
  if (/sponsorship required/i.test(artifactText) && /no sponsorship required/i.test(sponsorshipAnswer)) {
    contradictions.push('Artifact contradicts sponsorship answer.');
  }
  return contradictions;
}

export function enforceApplicationMode({ mode, fitScore, threshold, resumeApproved, verifiedAnswersComplete, hasContradiction, dailyLimitRemaining, platformPermits }) {
  if (mode === 'Prepare Only') return { maySubmit: false, reason: 'Prepare Only mode never submits.' };
  if (mode === 'Review Before Submit') return { maySubmit: false, reason: 'Review Before Submit requires Tomas review.' };
  if (mode !== 'Rules-Based Automatic') return { maySubmit: false, reason: 'Unknown application mode.' };

  const checks = [
    [fitScore >= threshold, 'fit score below threshold'],
    [resumeApproved, 'resume is not approved'],
    [verifiedAnswersComplete, 'verified answers incomplete'],
    [!hasContradiction, 'contradiction detected'],
    [dailyLimitRemaining > 0, 'daily limit reached'],
    [platformPermits, 'platform does not permit route'],
  ];
  const failed = checks.find(([passed]) => !passed);
  return failed ? { maySubmit: false, reason: failed[1] } : { maySubmit: true, reason: 'Rules-Based Automatic checks passed.' };
}

export function evaluateEmployerWorkflow(workflow) {
  if (!workflow?.attempted) return { passed: false, reason: 'Employer workflow was not attempted.' };
  if (workflow.terminalState === 'submitted') return { passed: Boolean(workflow.confirmationEvidence), reason: workflow.confirmationEvidence ? 'Submission evidence captured.' : 'Submission missing confirmation evidence.' };
  if (workflow.terminalState === 'human_only_gate') {
    const gateType = String(workflow.gate?.type || '').toUpperCase().replace(/[\s-]+/g, '_');
    const qualifies = qualifyingHumanOnlyGates.has(gateType) && workflow.gate?.precedingSupportedStepsCompleted === true && workflow.gate?.evidence;
    return { passed: Boolean(qualifies), reason: qualifies ? `${gateType} gate qualifies.` : 'Human-only gate evidence is incomplete.' };
  }
  return { passed: false, reason: `Unsupported workflow terminal state: ${workflow.terminalState || 'missing'}.` };
}

export function createTargetedResume(profile, opportunity) {
  const mapped = mapRequirementsToEvidence(opportunity, profile);
  const lines = [
    `# ${profile.candidate.preferredName || profile.candidate.legalName}`,
    '',
    opportunity.title,
    '',
    '## Target Role Alignment',
    ...mapped.map((item) => `- ${item.requirement}: ${item.evidenceReference || 'requires verification'}`),
    '',
    '## Evidence Trace',
    `- Profile version: ${profile.profileVersion}`,
    `- Requisition ID: ${opportunity.requisitionId}`,
  ];
  return lines.join('\n');
}

export async function fileExistsAndReadable(filePath) {
  try {
    await access(filePath);
    return statSync(filePath).size > 0;
  } catch {
    return false;
  }
}

export function summarizeLiveStatus(status) {
  const salary = status.salaryRange?.complete
    ? `$${Math.round(status.salaryRange.minUsd / 1000)}K-$${Math.round(status.salaryRange.maxUsd / 1000)}K`
    : 'Salary information incomplete';

  return {
    greeting: `Good morning, ${status.greetingName || 'Tomas'}.`,
    discoveryLine: `I found ${status.dailyDiscoveries || 0} jobs that match your background.`,
    applyLine: `${status.worthApplyingToday || 0} are worth applying to today.`,
    packageLine: `I prepared ${status.preparedPackages || 0} application package${status.preparedPackages === 1 ? '' : 's'}.`,
    salary,
    needsTomas: status.humanOnlyGates || 0,
  };
}

export function evaluateProductionEvidence(evidence) {
  const rows = [];
  const add = (name, passed, detail = '') => rows.push({ name, passed: Boolean(passed), detail });

  add('Candidate Master Profile exists and validates', evidence?.candidateProfile && validateCandidateProfile(evidence.candidateProfile).passed);
  add('Real job source configured and current', evidence?.sourceRun?.environment === 'production' && evidence.sourceRun.successful && evidence.sourceRun.current);
  add('Real current opportunity discovered', evidence?.pilot?.environment === 'production' && evidence.pilot.opportunity?.active === true);
  add('Posting identity and source evidence exist', Boolean(evidence?.pilot?.opportunity?.requisitionId && evidence?.pilot?.postingEvidence));
  add('AnswerBrief analyses exist for pilot', Boolean(evidence?.pilot?.answerBriefAnalyses?.ats && evidence?.pilot?.answerBriefAnalyses?.aiReadiness && evidence?.pilot?.answerBriefAnalyses?.recruiterIntelligence && evidence?.pilot?.answerBriefAnalyses?.hiringManagerEvidence));
  add('Targeted resume artifact exists and opens', Boolean(evidence?.pilot?.resumeArtifact?.opens && evidence?.pilot?.resumeArtifact?.path));
  add('Application package exists', Boolean(evidence?.pilot?.applicationPackage?.path));
  add('Employer execution attempted through real adapter', Boolean(evidence?.pilot?.employerWorkflow?.adapter && evidence?.pilot?.employerWorkflow?.attempted && evidence.pilot.employerWorkflow.environment === 'production'));
  add('Verified application answers used', evidence?.pilot?.employerWorkflow?.verifiedAnswersUsed === true);
  add('Submission or qualifying human-only gate reached', evaluateEmployerWorkflow(evidence?.pilot?.employerWorkflow).passed);
  add('Daily automation invokes same real pipeline', evidence?.pilot?.dailyAutomation?.environment === 'production' && evidence.pilot.dailyAutomation.usesSamePipeline === true);
  add('Live application reports factual production state', evidence?.liveApplication?.environment === 'production' && evidence.liveApplication.factualState === true);
  add('No duplicate application created', evidence?.pilot?.duplicateApplicationCreated === false);
  add('Remote commit contains changes', Boolean(evidence?.deployment?.commitSha && evidence.deployment.remoteContainsCommit === true));
  add('Production deployment corresponds to commit', Boolean(evidence?.deployment?.commitSha && evidence.deployment.productionCommitSha === evidence.deployment.commitSha));
  add('Production health endpoints pass', evidence?.deployment?.healthOk === true);
  add('Authenticated browser verification evidence exists', Boolean(evidence?.deployment?.authenticatedBrowserEvidence));

  return rows;
}

export function loadProductionEvidenceIfPresent() {
  if (!existsSync(productionEvidencePath)) return null;
  return readJson(productionEvidencePath);
}

export function formatRows(rows) {
  const nameWidth = Math.max(...rows.map((row) => row.name.length), 9);
  return rows.map((row) => {
    const status = row.passed ? 'PASS' : 'FAIL';
    const paddedName = row.name.padEnd(nameWidth, ' ');
    return `${status}  ${paddedName}${row.detail ? `  ${row.detail}` : ''}`;
  }).join('\n');
}

export function slug(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function normalizedPathIdentity(urlString) {
  const url = new URL(urlString);
  return `${url.hostname}${url.pathname}`.toLowerCase().replace(/\/$/, '');
}

function requiredString(value, key) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${key} is required.`);
  }
  return value;
}

function hasAllTokens(haystack, needle) {
  return String(needle).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).every((token) => haystack.includes(token));
}

function hasAnyToken(haystack, needle) {
  const text = String(haystack).toLowerCase();
  return String(needle).toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length > 2).some((token) => text.includes(token));
}

function round(value) {
  return Math.round(value * 100) / 100;
}

export function isMainModule(importMetaUrl) {
  return process.argv[1] && pathToFileURL(process.argv[1]).href === importMetaUrl;
}
