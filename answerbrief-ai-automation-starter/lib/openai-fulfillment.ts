import type { PromptRecord } from './prompt-registry';

type GenerateOpenAIInterviewBriefInput = {
  deterministicDraft: string;
  intake: {
    careerLane: string;
    name: string;
    notes?: string;
    targetCompany?: string;
    targetRole: string;
  };
  jobPosting: string;
  knowledgeSummary: string;
  packageName: string;
  promptRecords: PromptRecord[];
  registryVersion: string;
  resumeText: string;
};

export function isOpenAIConfigured() {
  return Boolean(process.env.OPENAI_API_KEY);
}

export async function generateOpenAIInterviewBrief(input: GenerateOpenAIInterviewBriefInput) {
  if (!isOpenAIConfigured()) {
    return null;
  }

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      input: [
        {
          role: 'system',
          content: [
            'You are the AnswerBrief AI fulfillment engine.',
            'Generate interview preparation content only from customer-provided resume, job posting, intake, and the supplied AnswerBrief knowledge base.',
            'Do not invent employers, degrees, certifications, metrics, tools, dates, personal history, or outcomes.',
            'If a fact is missing, call it out as a prep gap.',
            'Return polished Markdown only. Keep the existing AnswerBrief section structure and no-guarantee disclaimer.',
          ].join(' '),
        },
        {
          role: 'user',
          content: JSON.stringify({
            deterministicDraft: input.deterministicDraft,
            intake: input.intake,
            jobPosting: input.jobPosting,
            knowledgeSummary: input.knowledgeSummary,
            packageName: input.packageName,
            promptRegistry: input.promptRecords.map((record) => ({
              dependencies: record.dependencies,
              id: record.id,
              purpose: record.purpose,
              version: record.version,
            })),
            registryVersion: input.registryVersion,
            resumeText: input.resumeText,
          }),
        },
      ],
      max_output_tokens: 6000,
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      temperature: 0.2,
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI fulfillment request failed with status ${response.status}: ${await response.text()}`);
  }

  const data = await response.json() as {
    output_text?: string;
    output?: Array<{
      content?: Array<{
        text?: string;
        type?: string;
      }>;
    }>;
  };
  const text = data.output_text || data.output
    ?.flatMap((item) => item.content || [])
    .map((item) => item.text || '')
    .join('\n')
    .trim();

  if (!text) {
    throw new Error('OpenAI fulfillment returned an empty response.');
  }

  return text;
}
