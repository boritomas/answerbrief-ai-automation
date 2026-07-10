import { generateInterviewBrief, type GeneratedBrief } from './brief';
import type { IntakeUpload, Order } from './orders';
import { packages } from './packages';

export type FulfillmentJobResult = {
  brief: GeneratedBrief;
  events: FulfillmentEvent[];
  qaPassed: boolean;
};

type FulfillmentEvent = {
  event: string;
  message: string;
  severity?: 'info' | 'warning' | 'error';
};

export async function runAnswerBriefFulfillmentJob(order: Order, uploads: IntakeUpload[] = []): Promise<FulfillmentJobResult> {
  const events: FulfillmentEvent[] = [
    { event: 'fulfillment_job_started', message: 'Durable server-side AnswerBrief fulfillment job started.' },
    { event: 'interview_prep_kb_reused', message: 'Interview Prep knowledge base and prompt registry loaded for this order.' },
  ];

  if (!order.intake) {
    return {
      brief: {
        content: '',
        contentType: 'text/markdown; charset=utf-8',
        filename: 'missing-intake.md',
        mode: 'answerbrief_fulfillment_v1',
        qa: {
          issues: ['Missing intake data.'],
          passed: false,
          warnings: [],
        },
        registryVersion: 'unavailable',
      },
      events: [
        ...events,
        { event: 'fulfillment_job_failed', message: 'Fulfillment cannot run without intake data.', severity: 'error' },
      ],
      qaPassed: false,
    };
  }

  const brief = await generateInterviewBrief({
    intake: order.intake,
    packageKey: order.packageKey,
    packageName: order.packageName || packages['quick-prep'].name,
    uploads,
  });

  events.push(
    { event: 'resume_analyzed', message: 'Resume analyzer completed using customer-provided resume material and intake context.' },
    { event: 'job_description_analyzed', message: 'Job description analyzer completed using provided posting text and target role.' },
    { event: 'resume_role_alignment_completed', message: 'Resume-to-role alignment and gap analysis completed.' },
    { event: 'interview_questions_generated', message: 'Likely behavioral, situational, leadership, technical, and follow-up questions generated as applicable.' },
    { event: 'star_guidance_generated', message: 'STAR story guidance generated without inventing customer experience.' },
    { event: 'answerbrief_composed', message: 'Package-specific AnswerBrief deliverable assembled.' },
    {
      event: brief.qa.passed ? 'qa_validation_passed' : 'qa_validation_failed',
      message: brief.qa.passed ? 'Automated QA validation passed.' : `Automated QA validation found ${brief.qa.issues.length} issue(s).`,
      severity: brief.qa.passed ? 'info' : 'warning',
    }
  );

  return {
    brief,
    events,
    qaPassed: brief.qa.passed,
  };
}
