import crypto from 'node:crypto';

export type AtsPlatformKey =
  | 'ashby'
  | 'greenhouse'
  | 'icims'
  | 'jobvite'
  | 'lever'
  | 'oracle'
  | 'smartrecruiters'
  | 'successfactors'
  | 'taleo'
  | 'unknown'
  | 'workday';

export type MemoryScope = 'ats' | 'employer' | 'global';

export type QuestionMemoryCandidate = {
  answerValue: unknown;
  confidenceScore: number;
  employerKey?: string | null;
  atsPlatformKey?: AtsPlatformKey | null;
  requiresHumanConfirmation?: boolean;
  scope: MemoryScope;
  timesAccepted?: number;
  timesRejected?: number;
  timesUsed?: number;
};

export function normalizeEmployerKey(value: unknown) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function normalizeQuestion(value: unknown) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/\s+/g, ' ')
    .replace(/[^a-z0-9$%+\-./ ]+/g, '')
    .trim();
}

export function questionHash(value: unknown) {
  return crypto.createHash('sha256').update(normalizeQuestion(value)).digest('hex');
}

export function detectAtsPlatform(input: unknown): AtsPlatformKey {
  const value = String(input || '').toLowerCase();
  if (/myworkdayjobs|workday/.test(value)) return 'workday';
  if (/greenhouse\.io|boards\.greenhouse/.test(value)) return 'greenhouse';
  if (/jobs\.lever\.co|lever/.test(value)) return 'lever';
  if (/icims/.test(value)) return 'icims';
  if (/successfactors|jobs2web/.test(value)) return 'successfactors';
  if (/oraclecloud|oracle/.test(value)) return 'oracle';
  if (/taleo/.test(value)) return 'taleo';
  if (/smartrecruiters/.test(value)) return 'smartrecruiters';
  if (/ashbyhq/.test(value)) return 'ashby';
  if (/jobvite/.test(value)) return 'jobvite';
  return 'unknown';
}

export function answerReuseScore(candidate: QuestionMemoryCandidate, context: {
  employerKey?: string | null;
  atsPlatformKey?: AtsPlatformKey | null;
}) {
  if (candidate.requiresHumanConfirmation) return 0;
  const confidence = clamp(candidate.confidenceScore, 0, 100);
  const accepted = Math.max(0, candidate.timesAccepted || 0);
  const rejected = Math.max(0, candidate.timesRejected || 0);
  const used = Math.max(0, candidate.timesUsed || 0);
  const acceptanceRate = used > 0 ? accepted / used : 1;
  const rejectionPenalty = Math.min(40, rejected * 10);
  const scopeBonus = candidate.scope === 'employer'
    && normalizeEmployerKey(candidate.employerKey) === normalizeEmployerKey(context.employerKey)
    ? 15
    : candidate.scope === 'ats' && candidate.atsPlatformKey === context.atsPlatformKey
      ? 8
      : candidate.scope === 'global'
        ? 3
        : 0;
  return Math.round(clamp((confidence * acceptanceRate) + scopeBonus - rejectionPenalty, 0, 100));
}

export function mayReuseAnswer(candidate: QuestionMemoryCandidate, context: {
  employerKey?: string | null;
  atsPlatformKey?: AtsPlatformKey | null;
  minimumScore?: number;
}) {
  return answerReuseScore(candidate, context) >= (context.minimumScore ?? 85);
}

export function employerReadinessScore(input: {
  accountStatus?: string | null;
  identityVerified?: boolean;
  jobsWaiting?: number;
  profileCompletionPercent?: number;
  resumeUploaded?: boolean;
  sessionStatus?: string | null;
  successfulRuns?: number;
}) {
  let score = 0;
  if (/active|exists|ready|verified/.test(String(input.accountStatus || '').toLowerCase())) score += 20;
  if (/active|valid|authenticated|ready/.test(String(input.sessionStatus || '').toLowerCase())) score += 25;
  if (input.identityVerified) score += 15;
  if (input.resumeUploaded) score += 15;
  score += clamp(Number(input.profileCompletionPercent || 0), 0, 100) * 0.15;
  score += Math.min(10, Math.max(0, Number(input.successfulRuns || 0)) * 2);
  if (Number(input.jobsWaiting || 0) > 0) score += 5;
  return Math.round(clamp(score, 0, 100));
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}
