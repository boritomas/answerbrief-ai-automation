export type PackageKey = 'quick-prep' | 'full-interview-brief' | 'premium-prep';

export const packages = {
  'quick-prep': {
    name: 'Quick Prep',
    priceUsd: 49,
    cta: 'Start Quick Prep',
    paymentLinkEnv: 'NEXT_PUBLIC_STRIPE_QUICK_PREP_LINK',
    description: 'A focused role-specific prep snapshot for one upcoming interview.',
    deliverables: [
      'Resume + job posting review',
      'Opening pitch',
      '10 likely questions',
      'Final prep notes',
    ],
  },
  'full-interview-brief': {
    name: 'Full Interview Brief',
    priceUsd: 149,
    cta: 'Get Full Interview Brief',
    badge: 'Most Popular',
    paymentLinkEnv: 'NEXT_PUBLIC_STRIPE_FULL_INTERVIEW_BRIEF_LINK',
    description: 'The main offer and best-value package for serious interviews.',
    deliverables: [
      'Full role-readiness brief',
      'STAR story bank',
      'Technical prep',
      'Risk areas',
      '24-hour prep sheet',
    ],
  },
  'premium-prep': {
    name: 'Premium Prep',
    priceUsd: 299,
    cta: 'Book Premium Prep',
    paymentLinkEnv: 'NEXT_PUBLIC_STRIPE_PREMIUM_PREP_LINK',
    description: 'A deeper prep package for higher-stakes interviews or candidates who want extra support.',
    deliverables: [
      'Full Interview Brief',
      'Mock interview script',
      'Answer refinement',
      'Follow-up email draft',
    ],
  },
} as const;
