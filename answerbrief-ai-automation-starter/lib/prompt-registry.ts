import { interviewPrepKnowledgeBase } from './interview-prep-knowledge';

export type PromptRecord = {
  id: string;
  version: string;
  purpose: string;
  product: 'answerbrief-ai';
  packageScope: Array<'quick-prep' | 'full-interview-brief' | 'premium-prep' | 'all'>;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  model: {
    provider: 'openai' | 'deterministic';
    name: string;
    temperature?: number;
  };
  dependencies: string[];
  changeHistory: Array<{
    date: string;
    note: string;
  }>;
  active: boolean;
  prompt: string;
};

const baseInputSchema = {
  intake: 'AnswerBrief intake fields',
  uploads: 'Plain-text summaries extracted from supported uploaded files',
  package: 'Package key and package name',
  knowledgeBaseVersion: interviewPrepKnowledgeBase.version,
};

export const promptRegistryVersion = 'answerbrief-prompts-2026.07.10';

export const promptRegistry: PromptRecord[] = [
  {
    id: 'resume-analyzer',
    version: '1.0.0',
    purpose: 'Extract candidate evidence, scope, role signals, and reusable accomplishments from customer-provided resume material.',
    product: 'answerbrief-ai',
    packageScope: ['all'],
    inputSchema: baseInputSchema,
    outputSchema: { resumeSignals: 'string[]', candidateEvidence: 'string[]', missingResumeInput: 'boolean' },
    model: { provider: 'deterministic', name: 'answerbrief-rules-v1' },
    dependencies: ['ab-intake-standards'],
    changeHistory: [{ date: '2026-07-10', note: 'Initial centralized registry record from existing Interview Prep assets.' }],
    active: true,
    prompt: 'Analyze only customer-provided resume facts. Never invent employers, metrics, titles, tools, or accomplishments.',
  },
  {
    id: 'job-description-analyzer',
    version: '1.0.0',
    purpose: 'Identify responsibilities, required skills, risk areas, and interview themes from the target job posting.',
    product: 'answerbrief-ai',
    packageScope: ['all'],
    inputSchema: baseInputSchema,
    outputSchema: { roleSignals: 'string[]', likelyCompetencies: 'string[]', missingJobInput: 'boolean' },
    model: { provider: 'deterministic', name: 'answerbrief-rules-v1' },
    dependencies: ['ab-sample-brief-framework'],
    changeHistory: [{ date: '2026-07-10', note: 'Initial job posting analyzer based on existing role-readiness framework.' }],
    active: true,
    prompt: 'Analyze the job description and role title. If a posting is missing, flag the gap and use the target role only.',
  },
  {
    id: 'resume-role-alignment-engine',
    version: '1.0.0',
    purpose: 'Compare resume evidence to role signals and produce strengths, gaps, and prep priorities.',
    product: 'answerbrief-ai',
    packageScope: ['all'],
    inputSchema: baseInputSchema,
    outputSchema: { strengths: 'string[]', gaps: 'string[]', priorities: 'string[]' },
    model: { provider: 'deterministic', name: 'answerbrief-rules-v1' },
    dependencies: ['resume-analyzer', 'job-description-analyzer'],
    changeHistory: [{ date: '2026-07-10', note: 'Initial alignment engine.' }],
    active: true,
    prompt: 'Map provided candidate evidence to role needs. Treat unknowns as prep gaps, not weaknesses stated as fact.',
  },
  {
    id: 'company-role-research-engine',
    version: '1.0.0',
    purpose: 'Prepare company and role research guidance where authorized without requiring live browsing.',
    product: 'answerbrief-ai',
    packageScope: ['full-interview-brief', 'premium-prep'],
    inputSchema: baseInputSchema,
    outputSchema: { researchAngles: 'string[]', customerResearchTasks: 'string[]' },
    model: { provider: 'deterministic', name: 'answerbrief-rules-v1' },
    dependencies: ['job-description-analyzer'],
    changeHistory: [{ date: '2026-07-10', note: 'Initial research guidance module.' }],
    active: true,
    prompt: 'When live research is unavailable or not authorized, generate targeted research tasks rather than fabricated company facts.',
  },
  {
    id: 'answerbrief-composer',
    version: '1.0.0',
    purpose: 'Assemble package-specific deliverables in the established AnswerBrief AI format.',
    product: 'answerbrief-ai',
    packageScope: ['all'],
    inputSchema: baseInputSchema,
    outputSchema: { markdown: 'string', qa: 'validation result' },
    model: { provider: 'deterministic', name: 'answerbrief-composer-v1' },
    dependencies: ['ab-package-deliverables', 'ab-delivery-standard', 'ab-sample-brief-framework'],
    changeHistory: [{ date: '2026-07-10', note: 'Initial composer from fallback brief plus Interview Prep framework.' }],
    active: true,
    prompt: 'Compose a clear, grounded interview prep brief. Include disclaimers, missing-input notes, and package-appropriate depth.',
  },
];

export function getActivePromptRecords() {
  return promptRegistry.filter((record) => record.active);
}
