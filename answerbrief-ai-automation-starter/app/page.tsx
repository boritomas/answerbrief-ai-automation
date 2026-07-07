import { packages, PackageKey } from '@/lib/packages';

const paymentLinks: Record<PackageKey, string | undefined> = {
  'quick-prep': process.env.NEXT_PUBLIC_STRIPE_QUICK_PREP_LINK,
  'full-interview-brief': process.env.NEXT_PUBLIC_STRIPE_FULL_INTERVIEW_BRIEF_LINK,
  'premium-prep': process.env.NEXT_PUBLIC_STRIPE_PREMIUM_PREP_LINK,
};

const sampleSections = [
  ['Executive Summary', 'A clear read on how the candidate should position their background for the target role.'],
  ['Resume-to-Role Alignment', 'Role requirements mapped to relevant experience, proof points, and areas to clarify.'],
  ['Likely Interview Questions', 'Focused questions based on the role level, function, and stated requirements.'],
  ['STAR Story Angles', 'Practical story prompts for ownership, conflict, execution, leadership, and measurable impact.'],
  ['Strengths to Emphasize', 'The strongest evidence to repeat throughout the interview.'],
  ['Gaps to Prepare For', 'Honest prep areas with language for addressing them constructively.'],
  ['Final Prep Checklist', 'A concise list for the night before and day of the interview.'],
];

const faqs = [
  {
    question: 'Is my resume private?',
    answer: 'Your materials are used to prepare your fit check or interview brief. We do not sell your information. Share only resumes, public job postings, and career notes you have permission to use, and you can request deletion.',
  },
  {
    question: 'How fast is delivery?',
    answer: 'Standard delivery is within 24 hours after usable materials are received. Rush delivery may be available when capacity allows.',
  },
  {
    question: 'Does this guarantee a job offer?',
    answer: 'No. AnswerBrief AI provides preparation materials only. We do not guarantee interviews, offers, promotions, or hiring outcomes.',
  },
  {
    question: 'What do I receive?',
    answer: 'Depending on the package, you receive a structured brief with alignment notes, likely questions, STAR story angles, gaps to prepare for, and a final prep checklist.',
  },
  {
    question: 'What industries is this for?',
    answer: 'The structure works well for telecom, federal, finance, audit, compliance, operations, product, technology, and other competitive professional roles.',
  },
  {
    question: 'Can I use this for leadership roles?',
    answer: 'Yes. The Executive Interview Strategy package is designed for higher-stakes or leadership interviews where positioning, judgment, and stakeholder communication matter.',
  },
];

export default function Home() {
  return (
    <main>
      <header className="nav">
        <a className="brand" href="/">AnswerBrief AI</a>
        <nav>
          <a href="#how">How it works</a>
          <a href="#included">What&apos;s included</a>
          <a href="#packages">Packages</a>
          <a href="/fit-check">Free Fit Check</a>
          <a href="#faq">FAQ</a>
        </nav>
      </header>

      <section className="hero hero-grid">
        <div>
          <p className="eyebrow">Role-specific interview prep for serious candidates</p>
          <h1>Walk into your interview prepared, not hoping.</h1>
          <p className="subhead">
            AnswerBrief AI turns your resume and the job posting into a focused interview brief so you can explain your experience clearly, prepare for likely questions, and address gaps with confidence.
          </p>
          <div className="cta-row">
            <a className="button primary" href="/fit-check">Start Free Interview Fit Check</a>
            <a className="button secondary" href="/sample-brief">View Sample Brief</a>
          </div>
          <p className="microcopy">No fake confidence. No outcome guarantees. Just structured preparation.</p>
        </div>

        <aside className="preview-card" aria-label="Interview brief preview">
          <div className="brief-preview-header">
            <p className="eyebrow">Deliverable preview</p>
            <h2>Your Interview Brief Includes</h2>
          </div>
          <div className="brief-preview-list">
            <ul>
              <li>Resume-to-role match analysis</li>
              <li>Likely interview questions</li>
              <li>STAR story recommendations</li>
              <li>Strengths to highlight</li>
              <li>Gaps to prepare for</li>
              <li>Role-specific talking points</li>
              <li>Final interview checklist</li>
            </ul>
          </div>
          <div className="brief-preview-footer">
            <strong>Delivered within 24 hours</strong>
            <a className="button secondary" href="/sample-brief">Preview Sample Brief</a>
          </div>
        </aside>
      </section>

      <section className="problem">
        <h2>Generic interview prep is not enough.</h2>
        <p>
          Interview prep is often generic, scattered, and stressful. AnswerBrief AI helps experienced professionals organize their background around the specific role, so the prep work feels practical instead of vague.
        </p>
      </section>

      <section id="how" className="how section-band">
        <div className="section-heading">
          <p className="eyebrow">How it works</p>
          <h2>From payment to prepared, with fewer loose ends.</h2>
        </div>
        <div className="steps">
          <article className="step">
            <span className="step-number">1</span>
            <div>
              <h3>Choose a package</h3>
              <p>Select the prep depth that matches the interview stakes and timeline.</p>
            </div>
          </article>
          <article className="step">
            <span className="step-number">2</span>
            <div>
              <h3>Send your materials</h3>
              <p>Use the secure intake link to share your resume, public job posting, and role context.</p>
            </div>
          </article>
          <article className="step">
            <span className="step-number">3</span>
            <div>
              <h3>Receive your brief</h3>
              <p>Get structured interview prep built around the target role, with delivery within 24 hours after usable materials are received.</p>
            </div>
          </article>
        </div>
      </section>

      <section id="fit-check" className="fit-check">
        <div className="fit-check-inner">
          <p className="eyebrow">Free &mdash; no purchase required</p>
          <h2>Start with a free Interview Fit Check.</h2>
          <p>
            See how your background maps to the target role, where you look strongest, and which gaps deserve focused prep before you buy.
          </p>
          <a className="button primary" href="/fit-check">Start Free Interview Fit Check</a>
        </div>
      </section>

      <section id="included" className="included">
        <div className="section-heading">
          <p className="eyebrow">Preview your interview brief</p>
          <h2>Structured preparation you can actually use.</h2>
          <p>Sample content is fictional and generic. It shows format, not a private employer example.</p>
        </div>
        <div className="sample-grid">
          {sampleSections.map(([title, description]) => (
            <article key={title} className="sample-tile">
              <h3>{title}</h3>
              <p>{description}</p>
            </article>
          ))}
        </div>
        <a className="text-link" href="/sample-brief">Open full sample brief</a>
      </section>

      <section className="why">
        <div className="section-heading">
          <p className="eyebrow">Trust and clarity</p>
          <h2>Why AnswerBrief AI?</h2>
        </div>
        <div className="why-grid">
          <article>
            <h3>Built for serious candidates</h3>
            <p>Designed to help experienced professionals prepare with structure and confidence for competitive roles.</p>
          </article>
          <article>
            <h3>Resume plus role, not generic advice</h3>
            <p>Turns your resume and job posting into practical preparation tailored to the interview in front of you.</p>
          </article>
          <article>
            <h3>AI-assisted and honest</h3>
            <p>The workflow is structured and AI-assisted, with clear fallback handling. We do not invent outcomes or guarantees.</p>
          </article>
          <article>
            <h3>Privacy-safe by design</h3>
            <p>We ask for only what is useful for prep and remind you not to upload confidential employer or sensitive personal documents.</p>
          </article>
        </div>
      </section>

      <section className="section-band">
        <div className="section-heading">
          <p className="eyebrow">Why we built this</p>
          <h2>Interview prep should feel organized, not scattered.</h2>
        </div>
        <p className="wide-copy">
          Many candidates have strong experience but struggle to package it under pressure. AnswerBrief AI exists to turn raw materials into role-specific preparation: what to emphasize, what to practice, what gaps to address, and what questions to expect.
        </p>
      </section>

      <section id="packages" className="pricing">
        <div className="section-heading">
          <p className="eyebrow">Packages</p>
          <h2>Choose the prep depth that matches the stakes.</h2>
          <p>Standard delivery: within 24 hours. Rush delivery may be available when capacity allows.</p>
        </div>
        <div className="price-cards">
          {(Object.keys(packages) as PackageKey[]).map((key) => {
            const pkg = packages[key];
            const isFeatured = key === 'full-interview-brief';
            const paymentLink = paymentLinks[key];

            return (
              <article key={key} className={isFeatured ? 'price-card featured' : 'price-card'}>
                {'badge' in pkg ? <p className="badge">{pkg.badge}</p> : null}
                <h3>{pkg.name}</h3>
                <p className="price">${pkg.priceUsd}</p>
                <p>{pkg.description}</p>
                {isFeatured ? (
                  <p className="value-note">Best fit for most candidates who want a complete role-readiness brief.</p>
                ) : null}
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

      <section id="faq" className="faq">
        <div className="section-heading">
          <p className="eyebrow">FAQ</p>
          <h2>Clear answers before you share anything.</h2>
        </div>
        <div className="faq-list">
          {faqs.map((item) => (
            <details key={item.question}>
              <summary>{item.question}</summary>
              <p>{item.answer}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="privacy-section">
        <h2>Your documents stay private.</h2>
        <p>
          We use your materials only to prepare your fit check or interview brief. We do not sell your information. You can request deletion of submitted materials by contacting support.
        </p>
        <p className="fine-print">
          Do not upload confidential employer documents, client data, proprietary files, SSNs, passwords, bank details, or sensitive personal information. Share only what you have clear permission to use.
        </p>
      </section>

      <div className="disclaimer">
        <p>
          AnswerBrief AI provides interview preparation materials only. We do not guarantee job offers, interview invitations, promotions, or hiring outcomes. Results depend on many factors outside our control, including your actual interview performance, company priorities, and the candidate pool.
        </p>
      </div>

      <footer>
        <strong>AnswerBrief AI</strong>
        <p>Privacy note: your materials are used for preparation and are not sold.</p>
        <p>Disclaimer: no guarantees of interviews, offers, promotions, or hiring outcomes.</p>
        <p className="fine-print"><a href="/privacy">Privacy policy</a></p>
      </footer>
    </main>
  );
}
