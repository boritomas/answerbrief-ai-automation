import { z } from 'zod';

export const intakeSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  targetRole: z.string().min(1),
  targetCompany: z.string().optional(),
  interviewDate: z.string().optional(),
  careerLane: z.enum([
    'telecom',
    'federal',
    'finance',
    'audit',
    'compliance',
    'operations',
    'product',
    'leadership',
    'other',
  ]),
  jobPostingText: z.string().optional(),
  notes: z.string().optional(),
});

export type Intake = z.infer<typeof intakeSchema>;
