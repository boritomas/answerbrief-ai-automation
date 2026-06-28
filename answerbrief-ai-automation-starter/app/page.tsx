import { packages, PackageKey } from '@/lib/packages';

const paymentLinks: Record<PackageKey, string | undefined> = {
  'quick-prep': process.env.NEXT_PUBLIC_STRIPE_QUICK_PREP_LINK,
  'full-interview-brief': process.env.NEXT_PUBLIC_STRIPE_FULL_INTERVIEW_BRIEF_LINK,
  'premium-prep': process.env.NEXT_PUBLIC_STRIPE_PREMIUM_PREP_LINK,
};

export default function Home() {
  return (
    <main>
      <header className="nav">
        <div className="brand">AnswerBrief AI</div>
        <nav>
          <a href="#how">How it works</a>
          <a href="#packages">Packages</a>
          <a href="#intake">Get started</a>
        </nav>
      </header>

      <section className="hero">
        <p className="eyebrow">Interview prep for serious career moves</p>
        <h1>Turn your resume and job posting into a role-specific interview brief.</h1>
        <p className="subhead">
          AnswerBrief AI helps telecom, federal, finance, audit, compliance, operations, product, and leadership candidates prepare with a clear story, strong examples, and focused interview prep.
        </p>
        <div className="cta-row">
          <a className="button primary" href="#packages">View packages</a>
          <a className="button secondary" href="#intake">Request a prep package</a>
        </div>
      </section>

      <section className="problem">
        <h2>Generic interview prep is not enough.</h2>
        <p>
          Many experienced professionals know their work, but struggle to explain it clearly in an interview. We help connect your experience to the role before the interview.
        </p>
      </section>

      <section id="how">
        <h2>How it works</h2>
        <div className="cards">
          <article><h3>1. Send your materials</h3><p>Resume, job posting, target company, and interview notes.</p></article>
          <article><h3>2. Get your brief</h3><p>Opening pitch, likely questions, STAR stories, technical prep, and weak spots.</p></article>
          <article><h3>3. Prep with focus</h3><p>Use the 24-hour prep sheet before the interview.</p></article>
        </div>
      </section>

      <section className="included">
        <h2>What your prep package includes</h2>
        <ul>
          <li>Opening pitch in your voice</li>
          <li>Resume-to-role alignment</li>
          <li>Likely interview questions</li>
          <li>STAR story bank</li>
          <li>Technical and role-specific prep</li>
          <li>Risk areas and weak spots to tighten</li>
          <li>Final 24-hour interview prep sheet</li>
          <li>Optional thank-you note after the interview</li>
        </ul>
      </section>

      <section id="packages" className="pricing">
        <h2>Packages</h2>
        <div className="price-cards">
          {(Object.keys(packages) as PackageKey[]).map((key) => {
            const pkg = packages[key];
            const isFeatured = key === 'full-interview-brief';
            const paymentLink = paymentLinks[key];

            return (
              <article key={key} className={isFeatured ? 'featured' : ''}>
                <h3>{pkg.name}</h3>
                <p className="price">${pkg.priceUsd}</p>
                <p>{pkg.description}</p>
                <ul>
                  {pkg.deliverables.map((item) => <li key={item}>{item}</li>)}
                </ul>
                {paymentLink ? (
                  <a className="button primary" href={paymentLink}>Buy {pkg.name}</a>
                ) : (
                  <span className="button disabled" aria-disabled="true">Payment link coming soon</span>
                )}
              </article>
            );
          })}
        </div>
      </section>

      <section id="intake">
        <h2>Request a prep package</h2>
        <p>After payment, send the customer to your intake form. Start with Google Forms or Typeform for MVP speed.</p>
        <p className="fine-print">Do not upload confidential employer documents unless you have permission to use them.</p>
      </section>

      <footer>
        <p>© AnswerBrief AI. Role-specific interview prep for telecom and regulated careers.</p>
      </footer>
    </main>
  );
}
