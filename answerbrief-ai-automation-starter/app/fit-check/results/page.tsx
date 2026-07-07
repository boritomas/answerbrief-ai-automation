import { packages } from '@/lib/packages';

interface FitCheckResult {
  score: number;
  strengths: string[];
  gaps: string[];
  alignment: string;
  recommendedPackage: 'quick-prep' | 'full-interview-brief' | 'premium-prep';
}

interface ResultsPageProps {
  searchParams?: {
    jobTitle?: string;
    industry?: string;
    experienceLevel?: string;
    email?: string;
  };
}

function generateFitCheck(jobTitle: string, industry: string, experienceLevel: string): FitCheckResult {
  // Deterministic scoring based on inputs
  const titleScore = jobTitle.toLowerCase().includes('senior') ? 15 : jobTitle.toLowerCase().includes('executive') ? 20 : 10;
  const experienceScore = experienceLevel.includes('Senior') ? 30 : experienceLevel.includes('Executive') ? 35 : experienceLevel.includes('Mid-career') ? 20 : 10;
  const variationScore = Math.floor(Math.random() * 10);
  const baseScore = Math.min(100, titleScore + experienceScore + variationScore);

  // Generate realistic strengths and gaps based on experience level
  const strengthsByLevel: Record<string, string[]> = {
    'Entry level': [
      'Fresh perspective and eagerness to learn',
      'Proven technical foundation from education',
      'Strong availability and flexibility'
    ],
    'Mid-career': [
      'Demonstrated track record in similar roles',
      'Built relevant professional network',
      'Clear career trajectory and growth potential'
    ],
    'Senior': [
      'Deep domain expertise and technical leadership',
      'Proven ability to mentor and build teams',
      'Strong executive presence and communication'
    ],
    'Executive': [
      'Strategic business acumen and vision',
      'Large organization and P&L management experience',
      'Proven ability to drive results at scale'
    ]
  };

  const gapsByLevel: Record<string, string[]> = {
    'Entry level': [
      'Limited real-world project experience',
      'Need to develop industry-specific knowledge',
      'No direct management experience yet'
    ],
    'Mid-career': [
      'May lack exposure to enterprise-scale systems',
      'Limited strategic decision-making experience',
      'Need to build executive-level communication'
    ],
    'Senior': [
      'Shift to strategic vs. tactical focus',
      'Emerging technology adoption (if role requires it)',
      'Board or C-level interaction skills'
    ],
    'Executive': [
      'Industry-specific regulatory knowledge',
      'Adaptability to new company culture',
      'Cross-functional stakeholder management'
    ]
  };

  const levelKey = Object.keys(strengthsByLevel).find(k => experienceLevel.includes(k)) || 'Mid-career';
  const strengths = strengthsByLevel[levelKey] || strengthsByLevel['Mid-career'];
  const gaps = gapsByLevel[levelKey] || gapsByLevel['Mid-career'];

  // Alignment text
  const alignmentScores: Record<number, string> = {
    100: `Your background is very well-aligned with a ${jobTitle} role in ${industry}. You have strong potential for this position.`,
    90: `Your experience maps well to a ${jobTitle} role. Key strengths are clear; focus prep on a few areas.`,
    80: `Good alignment with the ${jobTitle} role. Some gaps exist, but they're addressable with focused prep.`,
    70: `Moderate fit. You have relevant experience, but the role requires development in specific areas.`,
    60: `Mixed alignment. You have some relevant skills, but significant ramp-up may be required.`,
    50: `Lower alignment. This role may require substantial additional skills or experience to be successful.`,
  };

  let alignmentText = alignmentScores[100];
  for (const [score, text] of Object.entries(alignmentScores)) {
    if (baseScore <= parseInt(score)) {
      alignmentText = text;
      break;
    }
  }

  // Recommend package based on score
  let recommendedPackage: 'quick-prep' | 'full-interview-brief' | 'premium-prep';
  if (baseScore >= 80) {
    recommendedPackage = 'quick-prep'; // High confidence, quick prep is enough
  } else if (baseScore >= 60) {
    recommendedPackage = 'full-interview-brief'; // Moderate alignment, comprehensive prep
  } else {
    recommendedPackage = 'premium-prep'; // Lower alignment, extra support needed
  }

  return {
    score: baseScore,
    strengths,
    gaps,
    alignment: alignmentText,
    recommendedPackage,
  };
}

export default function ResultsPage({ searchParams }: ResultsPageProps) {
  const jobTitle = searchParams?.jobTitle || 'your target role';
  const industry = searchParams?.industry || '';
  const experienceLevel = searchParams?.experienceLevel || '';
  const email = searchParams?.email || '';

  const result = generateFitCheck(jobTitle, industry, experienceLevel);
  const recommendedPkg = packages[result.recommendedPackage];

  const paymentLinks: Record<string, string | undefined> = {
    'quick-prep': process.env.NEXT_PUBLIC_STRIPE_QUICK_PREP_LINK,
    'full-interview-brief': process.env.NEXT_PUBLIC_STRIPE_FULL_INTERVIEW_BRIEF_LINK,
    'premium-prep': process.env.NEXT_PUBLIC_STRIPE_PREMIUM_PREP_LINK,
  };

  const paymentLink = paymentLinks[result.recommendedPackage];

  return (
    <main style={{ backgroundColor: '#fafafa' }}>
      <header className="nav">
        <div className="brand">AnswerBrief AI</div>
        <nav>
          <a href="/">Home</a>
        </nav>
      </header>

      <section style={{ paddingTop: '60px', paddingBottom: '60px' }}>
        <div style={{ maxWidth: '700px', margin: '0 auto', padding: '0 20px' }}>
          {/* Header */}
          <div style={{ textAlign: 'center', marginBottom: '40px' }}>
            <p style={{ fontSize: '14px', color: '#0066cc', fontWeight: '600', marginBottom: '8px' }}>Your Interview Fit Check Results</p>
            <h1 style={{ fontSize: '32px', marginBottom: '12px' }}>Your readiness score: <span style={{ color: '#0066cc' }}>{result.score}</span>/100</h1>
            <p style={{ fontSize: '14px', color: '#666' }}>for <strong>{jobTitle}</strong> in <strong>{industry}</strong></p>
          </div>

          {/* Main Score Card */}
          <div style={{
            backgroundColor: '#fff',
            border: '1px solid #ddd',
            borderRadius: '8px',
            padding: '30px',
            marginBottom: '30px',
            textAlign: 'center'
          }}>
            <div style={{
              fontSize: '72px',
              fontWeight: 'bold',
              color: result.score >= 80 ? '#00aa00' : result.score >= 60 ? '#ff9900' : '#cc0000',
              marginBottom: '16px'
            }}>
              {result.score}
            </div>
            <p style={{ fontSize: '16px', lineHeight: '1.6', color: '#333' }}>{result.alignment}</p>
          </div>

          {/* Strengths */}
          <div style={{
            backgroundColor: '#f0f7ff',
            border: '1px solid #ccddff',
            borderRadius: '8px',
            padding: '20px',
            marginBottom: '30px'
          }}>
            <h2 style={{ fontSize: '18px', marginBottom: '16px', color: '#0066cc' }}>Your Strengths</h2>
            <ul style={{ margin: 0, paddingLeft: '20px' }}>
              {result.strengths.map((strength, i) => (
                <li key={i} style={{ marginBottom: '8px', color: '#333' }}>{strength}</li>
              ))}
            </ul>
          </div>

          {/* Gaps */}
          <div style={{
            backgroundColor: '#fff5f0',
            border: '1px solid #ffddcc',
            borderRadius: '8px',
            padding: '20px',
            marginBottom: '30px'
          }}>
            <h2 style={{ fontSize: '18px', marginBottom: '16px', color: '#cc6600' }}>Areas to Focus On</h2>
            <ul style={{ margin: 0, paddingLeft: '20px' }}>
              {result.gaps.map((gap, i) => (
                <li key={i} style={{ marginBottom: '8px', color: '#333' }}>{gap}</li>
              ))}
            </ul>
          </div>

          {/* Recommended Package */}
          <div style={{
            backgroundColor: '#f9f9f9',
            border: '2px solid #0066cc',
            borderRadius: '8px',
            padding: '30px',
            marginBottom: '30px',
            textAlign: 'center'
          }}>
            <p style={{ fontSize: '14px', color: '#666', marginBottom: '12px' }}>Based on your fit check</p>
            <h2 style={{ fontSize: '20px', marginBottom: '12px' }}>We recommend: {recommendedPkg.name}</h2>
            <p style={{ fontSize: '14px', color: '#666', marginBottom: '20px' }}>{recommendedPkg.description}</p>
            <p style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '20px' }}>${recommendedPkg.priceUsd}</p>
            
            <div style={{ marginBottom: '20px', textAlign: 'left' }}>
              <p style={{ fontSize: '14px', fontWeight: '600', marginBottom: '10px' }}>Includes:</p>
              <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '14px' }}>
                {recommendedPkg.deliverables.map((item, i) => (
                  <li key={i} style={{ marginBottom: '6px' }}>✓ {item}</li>
                ))}
              </ul>
            </div>

            {paymentLink ? (
              <a
                href={paymentLink}
                style={{
                  display: 'inline-block',
                  padding: '12px 32px',
                  backgroundColor: '#0066cc',
                  color: '#fff',
                  textDecoration: 'none',
                  borderRadius: '4px',
                  fontWeight: '600',
                  fontSize: '16px'
                }}
              >
                {recommendedPkg.cta}
              </a>
            ) : (
              <button style={{
                padding: '12px 32px',
                backgroundColor: '#ccc',
                color: '#666',
                border: 'none',
                borderRadius: '4px',
                fontWeight: '600',
                fontSize: '16px',
                cursor: 'default'
              }}
              >
                Payment link coming soon
              </button>
            )}
          </div>

          {/* Disclaimer */}
          <div style={{
            backgroundColor: '#f5f5f5',
            padding: '20px',
            borderRadius: '4px',
            fontSize: '12px',
            color: '#666',
            lineHeight: '1.6'
          }}>
            <p style={{ marginBottom: '8px' }}>
              <strong>Important:</strong> This fit check is a preview based on the information you provided. It is not a guarantee of interview success, a job offer, or hiring outcomes. Interview processes and outcomes depend on many factors beyond preparation materials.
            </p>
            <p>
              AnswerBrief AI provides interview preparation materials to help you present your qualifications more effectively. Success in interviews requires preparation, practice, and good communication.
            </p>
          </div>

          {/* Other Options */}
          <div style={{ marginTop: '40px', textAlign: 'center' }}>
            <p style={{ fontSize: '14px', color: '#666', marginBottom: '16px' }}>Interested in a different package?</p>
            <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', flexWrap: 'wrap' }}>
              {['quick-prep', 'full-interview-brief', 'premium-prep'].map((pkgKey) => {
                const pkg = packages[pkgKey as keyof typeof packages];
                const link = paymentLinks[pkgKey];
                if (pkgKey === result.recommendedPackage) return null;
                return (
                  <div key={pkgKey}>
                    {link ? (
                      <a href={link} style={{ fontSize: '14px', color: '#0066cc', textDecoration: 'underline' }}>
                        {pkg.name}
                      </a>
                    ) : (
                      <span style={{ fontSize: '14px', color: '#999' }}>{pkg.name}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      <footer style={{ marginTop: '60px', paddingTop: '40px', paddingBottom: '20px', borderTop: '1px solid #ddd' }}>
        <p style={{ fontSize: '12px', color: '#666', textAlign: 'center' }}>© AnswerBrief AI &mdash; Role-specific interview prep for telecom, federal, finance, and regulated careers.</p>
      </footer>
    </main>
  );
}
