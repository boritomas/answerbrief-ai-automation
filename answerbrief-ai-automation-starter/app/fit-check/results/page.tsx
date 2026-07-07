import { packages, PackageKey } from '@/lib/packages';

type ResultsPageProps = {
  searchParams?: {
    company?: string;
    email?: string;
    experienceLevel?: string;
    industry?: string;
    jobTitle?: string;
  };
};

type FitCheckResult = {
  alignment: string;
  gaps: string[];
  recommendedPackage: PackageKey;
  score: number;
  strengths: string[];
};

const paymentLinks: Record<PackageKey, string | undefined> = {
  'quick-prep': process.env.NEXT_PUBLIC_STRIPE_QUICK_PREP_LINK,
  'full-interview-brief': process.env.NEXT_PUBLIC_STRIPE_FULL_INTERVIEW_BRIEF_LINK,
  'premium-prep': process.env.NEXT_PUBLIC_STRIPE_PREMIUM_PREP_LINK,
};

export default function ResultsPage({ searchParams }: ResultsPageProps) {
  const jobTitle = searchParams?.jobTitle || 'your target role';
  const industry = searchParams?.industry || 'your industry';
  const experienceLevel = searchParams?.experienceLevel || 'Mid-career (2-7 years)';
  const company = searchParams?.company;
  const result = generateFitCheck(jobTitle, industry, experienceLevel);
  const recommendedPkg = packages[result.recommendedPackage];
  const paymentLink = paymentLinks[result.recommendedPackage];

  return (
    <main>
      <header className="nav">
        <a className="brand" href="/">AnswerBrief AI</a>
        <nav>
          <a href="/">Home</a>
          <a href="/sample-brief">Sample Brief</a>
        </nav>
      </header>

      <section className="results-hero">
        <p className="eyebrow">Your Interview Fit Check Results</p>
        <h1>Interview Readiness Score: <span>{result.score}/100</span></h1>
        <p className="subhead">
          For <strong>{jobTitle}</strong>{company ? ` at ${company}` : ''} in <strong>{industry}</strong>.
        </p>
      </section>

      <section className="results-grid">
        <article className="score-card">
          <span className="score-number">{result.score}</span>
          <div className="score-bar"><span style={{ width: `${result.score}%` }} /></div>
          <h2>Resume-to-role alignment summary</h2>
          <p>{result.alignment}</p>
        </article>

        <article>
          <h2>Top strengths</h2>
          <ul>
            {result.strengths.map((strength) => <li key={strength}>{strength}</li>)}
          </ul>
        </article>

        <article>
          <h2>Potential gaps</h2>
          <ul>
            {result.gaps.map((gap) => <li key={gap}>{gap}</li>)}
          </ul>
        </article>

        <article className="recommendation-card">
          <p className="eyebrow">Recommended package</p>
          <h2>{recommendedPkg.name}</h2>
          <p>{recommendedPkg.description}</p>
          <p className="price">${recommendedPkg.priceUsd}</p>
          <ul>
            {recommendedPkg.deliverables.map((item) => <li key={item}>{item}</li>)}
          </ul>
          {paymentLink ? (
            <a className="button primary" href={paymentLink}>{recommendedPkg.cta}</a>
          ) : (
            <span className="button disabled" aria-disabled="true">Payment link coming soon</span>
          )}
        </article>
      </section>

      <section className="disclaimer-panel">
        <h2>Important disclaimer</h2>
        <p>
          This free fit check is a realistic preview based on the fields you provided. It does not parse your full resume or guarantee interview success, interviews, job offers, promotions, or hiring outcomes.
        </p>
      </section>
    </main>
  );
}

function generateFitCheck(jobTitle: string, industry: string, experienceLevel: string): FitCheckResult {
  const normalized = `${jobTitle} ${industry} ${experienceLevel}`.toLowerCase();
  const seniorityScore = normalized.includes('executive') ? 30 : normalized.includes('senior') ? 26 : normalized.includes('mid') ? 20 : 14;
  const specificityScore = jobTitle.length > 12 ? 24 : 18;
  const industryScore = industry && industry !== 'your industry' ? 22 : 14;
  const score = Math.min(92, seniorityScore + specificityScore + industryScore + 12);

  const recommendedPackage: PackageKey = score >= 82
    ? 'quick-prep'
    : score >= 64
      ? 'full-interview-brief'
      : 'premium-prep';

  return {
    score,
    recommendedPackage,
    alignment: `Your profile appears directionally aligned for a ${jobTitle} role in ${industry}, but the strongest prep will come from connecting concrete resume examples to the role requirements and preparing honest language for any gaps.`,
    strengths: getStrengths(experienceLevel),
    gaps: getGaps(experienceLevel),
  };
}

function getStrengths(experienceLevel: string) {
  if (experienceLevel.includes('Executive')) {
    return [
      'Strategic leadership experience can anchor the interview narrative.',
      'Executive-level examples can show judgment, prioritization, and stakeholder alignment.',
      'The role likely rewards clear communication around tradeoffs and business impact.',
    ];
  }

  if (experienceLevel.includes('Senior')) {
    return [
      'Senior experience can support strong ownership and mentoring examples.',
      'You likely have enough project history to prepare several STAR stories.',
      'Role-specific examples can show both technical depth and communication.',
    ];
  }

  return [
    'Your background can be organized into a clear growth story.',
    'Specific project examples can help compensate for limited direct scope.',
    'A focused opening pitch can make your motivation easier to understand.',
  ];
}

function getGaps(experienceLevel: string) {
  if (experienceLevel.includes('Executive')) {
    return [
      'Prepare for questions about strategy, organizational influence, and measurable outcomes.',
      'Clarify how your leadership style fits the target company context.',
      'Avoid relying on broad claims without concrete operating examples.',
    ];
  }

  if (experienceLevel.includes('Senior')) {
    return [
      'Prepare examples that show scale, decision-making, and cross-functional influence.',
      'Translate technical or internal project language into business impact.',
      'Practice concise answers for any role requirements not directly shown on your resume.',
    ];
  }

  return [
    'Prepare to explain how you will ramp up on missing domain knowledge.',
    'Use concrete examples instead of general enthusiasm.',
    'Practice a clear answer for why this role is the right next step.',
  ];
}
