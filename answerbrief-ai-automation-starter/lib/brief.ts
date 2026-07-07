import { Intake } from './intake-schema';

export type BriefDepth = 'focused' | 'full' | 'executive';

export type GeneratedBrief = {
  filename: string;
  contentType: string;
  content: string;
  mode: 'fallback';
};

export function getBriefDepth(packageKey?: string): BriefDepth {
  if (packageKey === 'premium-prep') {
    return 'executive';
  }

  if (packageKey === 'full-interview-brief') {
    return 'full';
  }

  return 'focused';
}

export async function generateInterviewBrief({
  intake,
  packageName,
  packageKey,
}: {
  intake: Intake;
  packageName: string;
  packageKey?: string;
}): Promise<GeneratedBrief> {
  const depth = getBriefDepth(packageKey);
  const content = buildFallbackBrief({ intake, packageName, depth });

  return {
    filename: `AnswerBrief-${slugify(intake.name)}-${slugify(intake.targetRole)}.md`,
    contentType: 'text/markdown; charset=utf-8',
    content,
    mode: 'fallback',
  };
}

function buildFallbackBrief({
  intake,
  packageName,
  depth,
}: {
  intake: Intake;
  packageName: string;
  depth: BriefDepth;
}) {
  const companyLine = intake.targetCompany ? ` at ${intake.targetCompany}` : '';
  const depthLabel = {
    focused: 'focused brief',
    full: 'full interview brief',
    executive: 'executive-level strategy brief',
  }[depth];

  return [
    `# AnswerBrief AI Interview Brief`,
    '',
    `Package: ${packageName}`,
    `Brief type: ${depthLabel}`,
    `Candidate: ${intake.name}`,
    `Target role: ${intake.targetRole}${companyLine}`,
    intake.interviewDate ? `Interview date: ${intake.interviewDate}` : undefined,
    '',
    '## Executive Summary',
    `Prepare to connect your recent experience directly to the ${intake.targetRole} role. Keep answers specific, practical, and grounded in business impact rather than broad claims.`,
    '',
    '## Resume-to-Role Alignment',
    '- Identify the three responsibilities in the job posting that most closely match your recent work.',
    '- Prepare concise examples that show scope, tools, stakeholders, constraints, and measurable outcomes.',
    '- Translate internal project language into language a new hiring team can understand quickly.',
    '',
    '## Top Strengths to Emphasize',
    '- Relevant operating experience and pattern recognition from prior roles.',
    '- Ability to explain complex work in a structured way.',
    '- Evidence of ownership, follow-through, and collaboration across teams.',
    '',
    '## Gaps to Prepare For',
    '- Any requirement in the posting that is adjacent to, but not directly proven by, your resume.',
    '- Questions about scale, leadership scope, or domain depth.',
    '- Explaining transitions, short tenures, or missing keywords without sounding defensive.',
    '',
    '## Likely Interview Questions',
    '1. Walk me through your background and how it connects to this role.',
    '2. Tell me about a project where you had to solve an ambiguous problem.',
    '3. How do you prioritize when stakeholders disagree?',
    '4. What is a gap in your background for this role, and how would you ramp up?',
    '5. Why this role, and why now?',
    '',
    '## STAR Story Angles',
    '- A measurable project win that shows ownership.',
    '- A cross-functional challenge that shows communication and judgment.',
    '- A time you improved a process, reduced risk, or created clarity.',
    depth !== 'focused'
      ? '- A conflict or tradeoff where you had to make a decision with incomplete information.'
      : undefined,
    depth === 'executive'
      ? '- A leadership story showing strategy, stakeholder alignment, and durable operating impact.'
      : undefined,
    '',
    '## Questions to Ask the Interviewer',
    '- What would success look like in the first 90 days?',
    '- Which problems are most urgent for this role to solve?',
    '- How does the team make decisions when priorities conflict?',
    '',
    '## Final Prep Checklist',
    '- Prepare a 60-second opening pitch.',
    '- Choose three STAR stories and practice them out loud.',
    '- Review the job posting and mark the highest-risk requirements.',
    '- Prepare two thoughtful questions for each interviewer.',
    '- Avoid sharing confidential employer, client, or proprietary information.',
    '',
    '## Disclaimer',
    'This brief is interview preparation support only. It does not guarantee interviews, job offers, promotions, or hiring outcomes. Outcomes depend on many factors outside AnswerBrief AI, including market conditions, employer needs, candidate fit, and interview performance.',
  ].filter(Boolean).join('\n');
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60) || 'brief';
}
