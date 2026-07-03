import { packages, PackageKey } from '@/lib/packages';

const paymentLinks: Record<PackageKey, string | undefined> = {
  'quick-prep': process.env.NEXT_PUBLIC_STRIPE_QUICK_PREP_LINK,
  'full-interview-brief': process.env.NEXT_PUBLIC_STRIPE_FULL_INTERVIEW_BRIEF_LINK,
  'premium-prep': process.env.NEXT_PUBLIC_STRIPE_PREMIUM_PREP_LINK,
};

const freeFitCheckLink = process.env.NEXT_PUBLIC_FREE_FIT_CHECK_LINK;

export default function Home() {
  return (
    <main>
      <header className="nav">
        <div className="brand">AnswerBrief AI</div>
        <nav>
          <a href="#how">How it works</a>
          <a href="#packages">Packages</a>
          <a href="#faq">FAQ</a>
          <a href="#intake">After payment</a>
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
          <a className="button secondary" href="#how">How it works</a>
        </div>
      </section>

      <section className="problem">
        <h2>Generic interview prep is not enough.</h2>
        <p>
          Many experienced professionals know their work, but struggle to explain it clearly in an interview. We help connect your experience to the role before the interview.
        </p>
      </section>

      <section className="focus">
        <p className="eyebrow">Built for serious interviews</p>
        <h2>Prepared for roles where details matter.</h2>
        <p>
          AnswerBrief AI is focused on telecom, federal, finance, audit, compliance, operations, product, and leadership interviews. These interviews often require clear examples, role-specific language, and a story that connects your background to the job.
        </p>
        <p>
          This is not generic practice question prep. Your brief is built around the role you are targeting and the experience you bring.
        </p>
      </section>

      <section id="how">
        <h2>How it works</h2>
        <div className="cards">
          <article><h3>1. Choose a package</h3><p>Select the level of support that fits your interview timeline and stakes.</p></article>
          <article><h3>2. Send your materials</h3><p>Use the intake link to share your resume, the job posting, career story, and interview notes.</p></article>
          <article><h3>3. Get your brief</h3><p>Receive a role-specific interview brief by email, usually within 24-48 hours.</p></article>
        </div>
      </section>

      <section className="included">
        <h2>What your prep package includes</h2>
        <p className="section-copy">
          Your interview brief is personalized from the materials you send after payment:
        </p>
        <div className="split-list">
          <article>
            <h3>Built from your materials</h3>
            <ul>
              <li>Your resume</li>
              <li>The target job posting</li>
              <li>Your career story</li>
              <li>Any interview notes you provide</li>
            </ul>
          </article>
          <article>
            <h3>Prepared for your interview</h3>
            <ul>
              <li>Opening pitch in your voice</li>
              <li>Resume-to-role alignment</li>
              <li>Likely interview questions</li>
              <li>STAR story bank</li>
              <li>Technical and role-specific prep</li>
              <li>Risk areas and weak spots to tighten</li>
              <li>Final 24-hour interview prep sheet</li>
            </ul>
          </article>
        </div>
      </section>

      <section className="fit-check">
        <div>
          <p className="eyebrow">Free Interview Fit Check</p>
          <h2>Not ready to buy yet? Start with a free Interview Fit Check.</h2>
          <p>
            Send your resume and target role. We'll send back a short review with 3 likely interview focus areas, 2 questions you should prepare for, and 1 weak spot to tighten.
          </p>
        </div>
        <div className="fit-check-action">
          {freeFitCheckLink ? (
            <a className="button primary" href={freeFitCheckLink}>Get Free Fit Check</a>
          ) : (
            <span className="button disabled" aria-disabled="true">Fit check link coming soon</span>
          )}
          <p className="fine-print">
            Do not upload SSNs, passwords, bank data, or confidential employer documents.
          </p>
        </div>
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

      <section id="intake">
        <h2>After payment</h2>
        <div className="cards process-cards">
          <article><h3>1. Check your email</h3><p>After payment, you receive a private intake link by email.</p></article>
          <article><h3>2. Upload your materials</h3><p>Send your resume, the job posting, and any interview notes that can help shape the brief.</p></article>
          <article><h3>3. Receive your brief</h3><p>Your interview brief is prepared and delivered by email. Most briefs are delivered within 24-48 hours.</p></article>
        </div>
        <div className="guardrails">
          <h3>Privacy and upload guardrails</h3>
          <p>Do not upload SSNs, passwords, bank data, sensitive personal documents, or confidential employer documents unless you are allowed to use them.</p>
        </div>
      </section>

      <section id="faq" className="faq">
        <h2>FAQ</h2>
        <div className="faq-grid">
          <article>
            <h3>What do I send after payment?</h3>
            <p>Your resume, the job posting, and any interview notes you already have.</p>
          </article>
          <article>
            <h3>How fast will I receive my brief?</h3>
            <p>Most briefs are delivered by email within 24-48 hours.</p>
          </article>
          <article>
            <h3>Can you help with telecom or federal interviews?</h3>
            <p>Yes. AnswerBrief AI is built for telecom, federal, finance, audit, compliance, operations, product, and leadership interviews.</p>
          </article>
          <article>
            <h3>Is this just an AI-generated document?</h3>
            <p>No. The service is AI-assisted, but the brief is role-specific and personalized around your resume, target job, and career story.</p>
          </article>
        </div>
      </section>

      <section className="disclaimer">
        <p>AnswerBrief AI helps you prepare. It does not guarantee interviews, job offers, or hiring outcomes.</p>
      </section>

      <footer>
        <p>© AnswerBrief AI. Role-specific interview prep for telecom and regulated careers.</p>
      </footer>
    </main>
  );
}
