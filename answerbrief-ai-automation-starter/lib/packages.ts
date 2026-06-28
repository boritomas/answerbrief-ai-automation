export type PackageKey = 'quick-prep' | 'full-interview-brief' | 'premium-prep';

export const packages = {
  'quick-prep': {
    name: 'Quick Prep',
    priceUsd: 99,
    description: 'Best for candidates who need a fast role-readiness review.',
    deliverables: [
      'Resume + job posting review',
      'Opening pitch',
      '10 likely questions',
      'Final prep notes',
    ],
  },
  'full-interview-brief': {
    name: 'Full Interview Brief',
    priceUsd: 249,
    description: 'Best for serious interviews where preparation matters.',
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
    priceUsd: 499,
    description: 'Best for panel interviews, leadership interviews, or career pivots.',
    deliverables: [
      'Full Interview Brief',
      'Mock interview script',
      'Answer refinement',
      'Follow-up email draft',
    ],
  },
} as const;
