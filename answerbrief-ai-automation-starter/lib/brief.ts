import { Intake } from './intake-schema';
import type { IntakeUpload } from './orders';
import { interviewPrepKnowledgeBase, summarizeInterviewPrepKnowledge } from './interview-prep-knowledge';
import { generateOpenAIInterviewBrief, isOpenAIConfigured } from './openai-fulfillment';
import { getActivePromptRecords, promptRegistryVersion } from './prompt-registry';

export type BriefDepth = 'focused' | 'full' | 'executive';

export type GeneratedBrief = {
  filename: string;
  contentType: string;
  content: string;
  mode: 'answerbrief_fulfillment_v1';
  provider: 'deterministic' | 'openai';
  qa: {
    issues: string[];
    passed: boolean;
    warnings: string[];
  };
  registryVersion: string;
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
  uploads = [],
}: {
  intake: Intake;
  packageName: string;
  packageKey?: string;
  uploads?: IntakeUpload[];
}): Promise<GeneratedBrief> {
  const depth = getBriefDepth(packageKey);
  const analysis = buildFulfillmentAnalysis({ depth, intake, packageName, uploads });
  const deterministicDraft = composeAnswerBrief(analysis);
  const openAIContent = await generateOpenAIInterviewBrief({
    deterministicDraft,
    intake,
    jobPosting: analysis.jobPosting,
    knowledgeSummary: analysis.knowledgeSummary,
    packageName,
    promptRecords: analysis.promptRecords,
    registryVersion: analysis.registryVersion,
    resumeText: analysis.resumeText,
  });
  const content = openAIContent || deterministicDraft;
  const qa = validateBrief(content, analysis);

  return {
    filename: `AnswerBrief-${slugify(intake.name)}-${slugify(intake.targetRole)}.md`,
    contentType: 'text/markdown; charset=utf-8',
    content,
    mode: 'answerbrief_fulfillment_v1',
    provider: openAIContent ? 'openai' : 'deterministic',
    qa,
    registryVersion: promptRegistryVersion,
  };
}

export function getOpenAIFulfillmentConfigured() {
  return isOpenAIConfigured();
}

type FulfillmentAnalysis = ReturnType<typeof buildFulfillmentAnalysis>;

function buildFulfillmentAnalysis({
  intake,
  packageName,
  depth,
  uploads,
}: {
  intake: Intake;
  packageName: string;
  depth: BriefDepth;
  uploads: IntakeUpload[];
}) {
  const resumeText = uploads
    .filter((upload) => /resume/i.test(upload.filename) || upload.contentType.startsWith('text/'))
    .map((upload) => bufferPreview(upload.content))
    .join('\n')
    .trim();
  const uploadNames = uploads.map((upload) => upload.filename);
  const jobPosting = intake.jobPostingText?.trim() || uploads
    .filter((upload) => /job|posting|description/i.test(upload.filename))
    .map((upload) => bufferPreview(upload.content))
    .join('\n')
    .trim();
  const roleSignals = extractSignals([intake.targetRole, jobPosting, intake.notes].filter(Boolean).join('\n'));
  const resumeSignals = extractSignals([resumeText, intake.notes, intake.careerLane].filter(Boolean).join('\n'));
  const likelyQuestions = buildLikelyQuestions(intake, roleSignals, depth);
  const starGuidance = buildStarGuidance(resumeSignals, intake, depth);
  const strengths = buildStrengths(resumeSignals, intake);
  const risks = buildRisks({ intake, jobPosting, resumeText, uploadNames });
  const priorities = [
    `Prepare a concise opening pitch for ${intake.targetRole}${intake.targetCompany ? ` at ${intake.targetCompany}` : ''}.`,
    'Choose three customer-provided work examples and practice them using STAR.',
    'Map each story to one role responsibility or competency.',
    ...risks.slice(0, 2).map((risk) => `Prepare a calm answer for: ${risk}`),
  ];

  return {
    depth,
    intake,
    jobPosting,
    knowledgeSummary: summarizeInterviewPrepKnowledge(),
    likelyQuestions,
    packageName,
    priorities,
    promptRecords: getActivePromptRecords(),
    registryVersion: promptRegistryVersion,
    resumeSignals,
    resumeText,
    risks,
    roleSignals,
    starGuidance,
    strengths,
    uploadNames,
  };
}

function composeAnswerBrief(analysis: FulfillmentAnalysis) {
  const { depth, intake, packageName } = analysis;
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
    `Fulfillment engine: AnswerBrief automated fulfillment v1`,
    `Prompt registry: ${analysis.registryVersion}`,
    `Interview Prep knowledge base: ${interviewPrepKnowledgeBase.id} ${interviewPrepKnowledgeBase.version}`,
    `Candidate: ${intake.name}`,
    `Target role: ${intake.targetRole}${companyLine}`,
    intake.interviewDate ? `Interview date: ${intake.interviewDate}` : undefined,
    '',
    '## Executive Summary',
    `Prepare to connect customer-provided experience directly to the ${intake.targetRole} role. Keep answers specific, practical, and grounded in business impact rather than broad claims.`,
    '',
    '## Inputs Reviewed',
    `- Resume/source material: ${analysis.resumeText ? 'Provided and analyzed' : 'Missing or not text-readable; use intake notes and uploaded file names only'}`,
    `- Job posting: ${analysis.jobPosting ? 'Provided and analyzed' : 'Missing; analysis uses target role and customer notes'}`,
    `- Uploaded files: ${analysis.uploadNames.length ? analysis.uploadNames.join(', ') : 'No files uploaded'}`,
    '',
    '## Resume-to-Role Alignment',
    ...analysis.roleSignals.slice(0, 5).map((signal) => `- Role signal to prepare for: ${signal}`),
    ...analysis.resumeSignals.slice(0, 5).map((signal) => `- Candidate evidence to connect: ${signal}`),
    '- Translate internal project language into language a new hiring team can understand quickly.',
    '',
    '## Top Strengths to Emphasize',
    ...analysis.strengths.map((item) => `- ${item}`),
    '',
    '## Gaps to Prepare For',
    ...analysis.risks.map((item) => `- ${item}`),
    '',
    '## Likely Interview Questions',
    ...analysis.likelyQuestions.map((question, index) => `${index + 1}. ${question}`),
    '',
    '## STAR Story Angles',
    ...analysis.starGuidance.map((item) => `- ${item}`),
    '',
    '## Interview Strategy',
    ...analysis.priorities.map((item) => `- ${item}`),
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
    '- Review every STAR story and remove unsupported claims or details not grounded in your experience.',
    '',
    '## Automated QA Notes',
    '- Completeness, missing inputs, unsupported claims, and disclaimer checks were run before delivery.',
    '- Any missing source material is identified above so the customer can fill gaps before the interview.',
    '',
    '## Disclaimer',
    'This brief is interview preparation support only. It does not guarantee interviews, job offers, promotions, or hiring outcomes. Outcomes depend on many factors outside AnswerBrief AI, including market conditions, employer needs, candidate fit, and interview performance.',
  ].filter(Boolean).join('\n');
}

function validateBrief(content: string, analysis: FulfillmentAnalysis) {
  const issues: string[] = [];
  const warnings: string[] = [];

  for (const section of [
    'Executive Summary',
    'Inputs Reviewed',
    'Resume-to-Role Alignment',
    'Likely Interview Questions',
    'STAR Story Angles',
    'Final Prep Checklist',
    'Disclaimer',
  ]) {
    if (!content.includes(`## ${section}`)) {
      issues.push(`Missing section: ${section}`);
    }
  }

  if (!analysis.resumeText) warnings.push('Resume text was not available to parse; customer should confirm facts.');
  if (!analysis.jobPosting) warnings.push('Job posting text was not available; role analysis is less specific.');
  if (/guarantee|guaranteed job|will get hired/i.test(content.replace(/does not guarantee/gi, ''))) {
    issues.push('Potential unsupported outcome guarantee detected.');
  }

  return {
    issues,
    passed: issues.length === 0,
    warnings,
  };
}

function buildLikelyQuestions(intake: Intake, roleSignals: string[], depth: BriefDepth) {
  const questions = [
    `Walk me through your background and how it connects to ${intake.targetRole}.`,
    `Why are you interested in ${intake.targetCompany || 'this organization'} and this role?`,
    'Tell me about a project where you had to solve an ambiguous problem.',
    'How do you prioritize when stakeholders disagree?',
    'What is a gap in your background for this role, and how would you ramp up?',
    ...roleSignals.slice(0, 3).map((signal) => `How have you handled work related to ${signal}?`),
  ];

  if (depth !== 'focused') {
    questions.push('Tell me about a time you had to influence without direct authority.');
    questions.push('Describe a situation where you improved a process, reduced risk, or created clarity.');
  }

  if (depth === 'executive') {
    questions.push('How do you set operating priorities when the business has competing goals?');
    questions.push('What leadership pattern would you bring to this team in the first 90 days?');
  }

  return Array.from(new Set(questions)).slice(0, depth === 'focused' ? 10 : 16);
}

function buildStarGuidance(resumeSignals: string[], intake: Intake, depth: BriefDepth) {
  const base = [
    'A measurable project win that shows ownership. Use only real scope, tools, stakeholders, and outcomes from your experience.',
    'A cross-functional challenge that shows communication and judgment.',
    'A time you improved a process, reduced risk, or created clarity.',
  ];

  if (resumeSignals.length) {
    base.push(`A story connected to this customer-provided signal: ${resumeSignals[0]}.`);
  }

  if (depth !== 'focused') {
    base.push('A conflict or tradeoff where you made a decision with incomplete information.');
  }

  if (depth === 'executive') {
    base.push(`A leadership story showing strategy, stakeholder alignment, and durable operating impact for a ${intake.careerLane} context.`);
  }

  return base;
}

function buildStrengths(resumeSignals: string[], intake: Intake) {
  return [
    `Relevant ${intake.careerLane} experience that can be translated into the target role language.`,
    'Ability to explain complex work in a structured way.',
    'Evidence of ownership, follow-through, and collaboration when supported by the provided resume or examples.',
    ...resumeSignals.slice(0, 2).map((signal) => `Customer-provided signal to emphasize: ${signal}.`),
  ];
}

function buildRisks({
  intake,
  jobPosting,
  resumeText,
  uploadNames,
}: {
  intake: Intake;
  jobPosting: string;
  resumeText: string;
  uploadNames: string[];
}) {
  const risks = [
    'Any requirement in the posting that is adjacent to, but not directly proven by, your resume.',
    'Questions about scale, leadership scope, or domain depth.',
  ];

  if (!resumeText && !uploadNames.some((name) => /resume/i.test(name))) {
    risks.unshift('Resume was not provided or not text-readable, so STAR evidence must be confirmed manually by the customer.');
  }

  if (!jobPosting) {
    risks.unshift('Job posting was not provided, so role-specific alignment should be reviewed against the actual posting.');
  }

  if (intake.notes) {
    risks.push(`Customer concern to prepare for: ${intake.notes.slice(0, 180)}.`);
  }

  return risks;
}

function extractSignals(text: string) {
  const normalized = text
    .replace(/\s+/g, ' ')
    .split(/[.;\n]/)
    .map((item) => item.trim())
    .filter((item) => item.length > 12);

  if (!normalized.length) {
    return ['role responsibilities', 'stakeholder communication', 'problem solving', 'ownership'];
  }

  return normalized.slice(0, 8);
}

function bufferPreview(content: Buffer) {
  const text = content.toString('utf8');
  if (/[\u0000-\u0008\u000E-\u001F]/.test(text.slice(0, 200))) {
    return '';
  }
  return text.slice(0, 5000);
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60) || 'brief';
}
