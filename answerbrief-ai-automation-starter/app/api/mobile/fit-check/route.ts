import { NextRequest } from 'next/server';
import { mobileError, mobileJson, readMobileJson } from '@/lib/mobile-api';
import { packages, type PackageKey } from '@/lib/packages';

export const runtime = 'nodejs';

type FitCheckResult = {
  alignment: string;
  gaps: string[];
  recommendedPackage: PackageKey;
  score: number;
  strengths: string[];
};

export async function POST(request: NextRequest) {
  const body = await readMobileJson(request);
  const jobTitle = typeof body.jobTitle === 'string' ? body.jobTitle.trim() : '';
  const industry = typeof body.industry === 'string' ? body.industry.trim() : '';
  const experienceLevel = typeof body.experienceLevel === 'string' ? body.experienceLevel.trim() : '';

  if (!jobTitle || !industry || !experienceLevel) {
    return mobileError('jobTitle, industry, and experienceLevel are required.', 400);
  }

  const result = generateFitCheck(jobTitle, industry, experienceLevel);

  return mobileJson({
    ...result,
    recommendedPackageName: packages[result.recommendedPackage].name,
    purchaseAvailableInMobile: false,
  });
}

function generateFitCheck(jobTitle: string, industry: string, experienceLevel: string): FitCheckResult {
  const normalized = `${jobTitle} ${industry} ${experienceLevel}`.toLowerCase();
  const seniorityScore = normalized.includes('executive') ? 30 : normalized.includes('senior') ? 26 : normalized.includes('mid') ? 20 : 14;
  const specificityScore = jobTitle.length > 12 ? 24 : 18;
  const industryScore = industry ? 22 : 14;
  const score = Math.min(92, seniorityScore + specificityScore + industryScore + 12);
  const recommendedPackage: PackageKey = score >= 82
    ? 'quick-prep'
    : score >= 64
      ? 'full-interview-brief'
      : 'premium-prep';

  return {
    score,
    recommendedPackage,
    alignment: `Your profile appears directionally aligned for a ${jobTitle} role in ${industry}, with the strongest prep coming from role-specific examples and gap language.`,
    strengths: getStrengths(experienceLevel),
    gaps: getGaps(experienceLevel),
  };
}

function getStrengths(experienceLevel: string) {
  if (experienceLevel.includes('Executive')) {
    return [
      'Strategic leadership experience can anchor the interview narrative.',
      'Executive-level examples can show judgment, prioritization, and stakeholder alignment.',
      'The role likely rewards clear communication around tradeoffs and business impact.',
    ];
  }

  if (experienceLevel.includes('Senior')) {
    return [
      'Senior experience can support strong ownership and mentoring examples.',
      'You likely have enough project history to prepare several STAR stories.',
      'Role-specific examples can show both technical depth and communication.',
    ];
  }

  return [
    'Your background can be organized into a clear growth story.',
    'Specific project examples can help compensate for limited direct scope.',
    'A focused opening pitch can make your motivation easier to understand.',
  ];
}

function getGaps(experienceLevel: string) {
  if (experienceLevel.includes('Executive')) {
    return [
      'Prepare for questions about strategy, organizational influence, and measurable outcomes.',
      'Clarify how your leadership style fits the target company context.',
      'Avoid relying on broad claims without concrete operating examples.',
    ];
  }

  if (experienceLevel.includes('Senior')) {
    return [
      'Prepare examples that show scale, decision-making, and cross-functional influence.',
      'Translate technical or internal project language into business impact.',
      'Practice concise answers for any role requirements not directly shown on your resume.',
    ];
  }

  return [
    'Prepare to explain how you will ramp up on missing domain knowledge.',
    'Use concrete examples instead of general enthusiasm.',
    'Practice a clear answer for why this role is the right next step.',
  ];
}
