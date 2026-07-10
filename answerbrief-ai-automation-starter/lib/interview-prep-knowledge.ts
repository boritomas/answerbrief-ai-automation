export type InterviewPrepKnowledgeAsset = {
  id: string;
  title: string;
  source: string;
  purpose: string;
  content: string[];
};

export const interviewPrepKnowledgeBase = {
  id: 'interview-prep-authoritative-kb',
  version: '2026.07.10',
  auditSummary: [
    'Reused the existing AnswerBrief AI package definitions, delivery templates, sample brief sections, intake schema, and documented Interview Prep workflow notes.',
    'Preserved the established tone: practical, role-specific, no guarantees, no invented candidate experience, and STAR guidance grounded in provided facts.',
    'Replaced the generic fallback-only brief shape with reusable modules while keeping the mature existing structure as the baseline.',
  ],
  assets: [
    {
      id: 'ab-package-deliverables',
      title: 'AnswerBrief AI package deliverables',
      source: 'lib/packages.ts',
      purpose: 'Defines package-specific scope and output depth.',
      content: [
        'Interview Essentials: focused role-specific prep snapshot, opening pitch, likely questions, final prep notes.',
        'Interview Professional: full role-readiness brief, STAR story bank, role-specific prep, risks, 24-hour prep sheet.',
        'Executive Interview Strategy: deeper strategy, mock script, answer refinement, follow-up email draft.',
      ],
    },
    {
      id: 'ab-delivery-standard',
      title: 'Delivery and disclaimer standard',
      source: 'templates/delivery_email.md and lib/email.ts',
      purpose: 'Customer-facing delivery tone, support posture, and outcome disclaimer.',
      content: [
        'Delivery must be clear, concise, and useful without claiming hiring outcomes.',
        'Customer materials must not be expanded into unsupported claims.',
        'Preparation support does not guarantee interviews, offers, promotions, or hiring outcomes.',
      ],
    },
    {
      id: 'ab-sample-brief-framework',
      title: 'Sample brief framework',
      source: 'app/sample-brief/page.tsx and lib/brief.ts',
      purpose: 'Established sections for the customer deliverable.',
      content: [
        'Executive summary',
        'Opening pitch',
        'Resume-to-role alignment',
        'Strengths and gaps',
        'Likely questions',
        'STAR story guidance',
        'Questions to ask',
        'Final prep checklist',
      ],
    },
    {
      id: 'ab-intake-standards',
      title: 'Intake and privacy standards',
      source: 'lib/intake-schema.ts and app/intake/actions.ts',
      purpose: 'Required inputs and safe-file handling assumptions.',
      content: [
        'Required inputs: name, email, target role, career lane.',
        'Recommended inputs: company, interview date, job posting text, notes, resume upload, job description upload.',
        'Do not use confidential employer documents or material the customer lacks permission to share.',
      ],
    },
  ] satisfies InterviewPrepKnowledgeAsset[],
};

export function summarizeInterviewPrepKnowledge() {
  return interviewPrepKnowledgeBase.assets
    .map((asset) => `${asset.title}: ${asset.content.join(' ')}`)
    .join('\n');
}
