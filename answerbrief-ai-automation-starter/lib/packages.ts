export type PackageKey = 'quick-prep' | 'full-interview-brief' | 'premium-prep';

export const packages = {
  'quick-prep': {
    name: 'Interview Essentials',
    priceUsd: 49,
    cta: 'Start Interview Essentials',
    paymentLinkEnv: 'NEXT_PUBLIC_STRIPE_QUICK_PREP_LINK',
    description: 'A focused, role-specific prep snapshot for one upcoming interview.',
    deliverables: [
      'Resume + job posting review',
      'Opening pitch in your voice',
      '10 likely interview questions',
      'Final 24-hour prep notes',
    ],
  },
  'full-interview-brief': {
    name: 'Interview Professional',
    priceUsd: 149,
    cta: 'Get Interview Professional',
    badge: 'Best Value',
    paymentLinkEnv: 'NEXT_PUBLIC_STRIPE_FULL_INTERVIEW_BRIEF_LINK',
    description: 'The complete interview brief for professionals who want to show up prepared and confident.',
    deliverables: [
      'Full role-readiness brief',
      'STAR story bank',
      'Technical and role-specific prep',
      'Risk areas and weak spots',
      '24-hour prep sheet',
    ],
  },
  'premium-prep': {
    name: 'Executive Interview Strategy',
    priceUsd: 299,
    cta: 'Book Executive Strategy',
    paymentLinkEnv: 'NEXT_PUBLIC_STRIPE_PREMIUM_PREP_LINK',
    description: 'A deeper prep package for higher-stakes interviews or candidates who want extra support.',
    deliverables: [
      'Everything in Interview Professional',
      'Mock interview script',
      'Answer refinement',
      'Follow-up email draft',
    ],
  },
} as const;
