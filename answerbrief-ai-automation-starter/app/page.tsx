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
          <a href="#included">What's included</a>
          <a href="#packages">Packages</a>
          <a href="#fit-check">Free Fit Check</a>
        </nav>
      </header>

      {/* Hero */}
      <section className="hero">
        <p className="eyebrow">Personalized interview prep for serious professionals</p>
        <h1>Walk into your interview prepared, not hoping.</h1>
        <p className="subhead">
          AnswerBrief AI turns your resume and the job posting into a focused, role-specific interview brief &mdash; so you can answer confidently, stay on point, and stand out.
        </p>
        <div className="cta-row">
          <a className="button primary" href="/fit-check">Start Free Interview Fit Check</a>
          <a className="button secondary" href="#included">View Sample Brief</a>
        </div>
      </section>

      {/* Problem */}
      <section className="problem">
        <h2>Generic interview prep is not enough.</h2>
        <p>
          Most professionals know their work. Few know how to tell it clearly under pressure. AnswerBrief AI connects your experience to the role before the interview &mdash; so you show up with a clear narrative, anticipate likely questions, and know how to position your gaps.
        </p>
      </section>

      {/* How It Works */}
      <section id="how" className="how">
        <h2>How it works</h2>
        <div className="steps">
          <div className="step">
            <div className="step-number">1</div>
            <div>
              <h3>Share your materials</h3>
              <p>Send your resume, the job posting, and a few notes about the role and your concerns.</p>
            </div>
          </div>
          <div className="step">
            <div className="step-number">2</div>
            <div>
              <h3>We build your brief</h3>
              <p>We create a personalized interview brief with your opening pitch, likely questions, STAR stories, and risk areas &mdash; aligned to the specific role.</p>
            </div>
          </div>
          <div className="step">
            <div className="step-number">3</div>
            <div>
              <h3>You prep with clarity</h3>
              <p>Use the 24-hour prep sheet the night before. Walk in knowing exactly what to say and how to say it.</p>
            </div>
          </div>
        </div>
        <p className="delivery-note">Standard delivery: within 24 hours of receiving your materials.</p>
      </section>

      {/* Free Fit Check */}
      <section id="fit-check" className="fit-check">
        <div className="fit-check-inner">
          <p className="eyebrow">Free &mdash; no purchase required</p>
          <h2>Not sure where to start? Get a free Interview Fit Check.</h2>
          <p>
            Tell us your target role and situation. We'll send you a quick, honest assessment of how your experience aligns with the role &mdash; and which prep package makes the most sense for you.
          </p>
          <ul className="fit-check-steps">
            <li>Share your target role and interview timeline</li>
            <li>Tell us your biggest interview concern</li>
            <li>Receive your free fit check by email within one business day</li>
          </ul>
          <a className="button primary" href="/fit-check">Start Free Interview Fit Check</a>
        </div>
      </section>

      {/* Deliverables */}
      <section id="included" className="included">
        <h2>Your Interview Brief Includes</h2>
        <ul>
          <li>Opening pitch written in your voice</li>
          <li>Resume-to-role alignment review</li>
          <li>Likely interview questions for your specific role</li>
          <li>STAR story bank from your own experience</li>
          <li>Technical and role-specific prep</li>
          <li>Risk areas and weak spots to address</li>
          <li>Final 24-hour interview prep sheet</li>
          <li>Optional thank-you note template after the interview</li>
        </ul>
      </section>

      {/* Pricing */}
      <section id="packages" className="pricing">
        <h2>Packages</h2>
        <p className="delivery-note">Standard delivery: within 24 hours of receiving your materials.</p>
        <div className="price-cards">
          {(Object.keys(packages) as PackageKey[]).map((key) => {
            const pkg = packages[key];
            const isFeatured = key === 'full-interview-brief';
            const paymentLink = paymentLinks[key];

            return (
              <article key={key} className={isFeatured ? 'featured' : ''}>
                {'badge' in pkg ? <p className="badge">{pkg.badge}</p> : null}
                <h3>{pkg.name}</h3>
                <p className="price">${pkg.priceUsd}</p>
                <p>{pkg.description}</p>
                <ul>
                  {pkg.deliverables.map((item) => <li key={item}>{item}</li>)}
                </ul>
                {paymentLink ? (
                  <a className="button primary" href={paymentLink}>{pkg.cta}</a>
                ) : (
                  <span className="button disabled" aria-disabled="true">Payment link coming soon</span>
                )}
              </article>
            );
          })}
        </div>
      </section>

      {/* Why AnswerBrief AI */}
      <section className="why">
        <h2>Why AnswerBrief AI?</h2>
        <div className="why-grid">
          <div className="why-card">
            <h3>Role-specific, not generic</h3>
            <p>Every brief is built around your resume and the exact job posting &mdash; not a template designed for anyone.</p>
          </div>
          <div className="why-card">
            <h3>Delivered fast</h3>
            <p>Most briefs are ready within 24 hours. Useful whether your interview is tomorrow or next week.</p>
          </div>
          <div className="why-card">
            <h3>Honest preparation</h3>
            <p>We help you understand where your experience is strong, where it has gaps, and how to talk about both clearly.</p>
          </div>
          <div className="why-card">
            <h3>Between a tool and a coach</h3>
            <p>More personalized than AI interview apps. More affordable than hourly coaching. Built for working professionals.</p>
          </div>
        </div>
      </section>

      {/* Document Privacy */}
      <section className="privacy-section">
        <h2>Your documents stay private.</h2>
        <p>
          We use your materials only to build your interview brief. We do not store, sell, or share your resume or personal information with third parties.
        </p>
        <p className="fine-print">
          Do not upload confidential employer documents, client data, proprietary files, SSNs, passwords, bank details, or any sensitive personal information. Share only what you have clear permission to use.
        </p>
      </section>

      {/* After Payment */}
      <section id="intake">
        <h2>After payment</h2>
        <p>After checkout, you receive a private intake link by email. Complete the intake form to share your materials and start your prep workflow.</p>
        <p className="fine-print">Do not upload confidential employer documents unless you have permission to use them.</p>
      </section>

      {/* Disclaimer */}
      <div className="disclaimer">
        <p>
          AnswerBrief AI provides interview preparation materials only. We do not guarantee job offers, interview invitations, or hiring outcomes. Results depend on many factors outside our control, including your actual interview performance, company priorities, and competitive candidate pool. Success in interviews requires preparation, practice, and strong communication.
        </p>
      </div>

      <footer>
        <p>© AnswerBrief AI &mdash; Role-specific interview prep for telecom, federal, finance, and regulated careers.</p>
        <p className="fine-print"><a href="/privacy">Privacy policy</a></p>
      </footer>
    </main>
  );
}
