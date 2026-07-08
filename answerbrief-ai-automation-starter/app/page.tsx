import { packages, PackageKey } from '@/lib/packages';

const walkthroughPageUrl = 'https://labs.google/fx/tools/flow/shared/video/8e2c5835-8fe7-4dcf-8262-824ceef89938';
const walkthroughVideoUrl = 'https://labs.google/fx/api/og-video/shared/8e2c5835-8fe7-4dcf-8262-824ceef89938';
const walkthroughPosterUrl = 'https://labs.google/fx/api/og-video/thumbnail/shared/8e2c5835-8fe7-4dcf-8262-824ceef89938';

const paymentLinks: Record<PackageKey, string | undefined> = {
  'quick-prep': process.env.NEXT_PUBLIC_STRIPE_QUICK_PREP_LINK,
  'full-interview-brief': process.env.NEXT_PUBLIC_STRIPE_FULL_INTERVIEW_BRIEF_LINK,
  'premium-prep': process.env.NEXT_PUBLIC_STRIPE_PREMIUM_PREP_LINK,
};

const sampleSections = [
  ['Executive Summary', 'A clear read on how the candidate should position their background for the target role.'],
  ['Opening Pitch', 'A concise way to introduce your background without rambling or underselling your fit.'],
  ['Resume-to-Role Alignment', 'Role requirements mapped to relevant experience, proof points, and areas to clarify.'],
  ['Likely Interview Questions', 'Focused questions based on the role level, function, and stated requirements.'],
  ['STAR Story Example', 'A realistic structure for turning one experience into a clear interview answer.'],
  ['Strengths to Emphasize', 'The strongest evidence to repeat throughout the interview.'],
  ['Gaps to Prepare For', 'Honest prep areas with language for addressing them constructively.'],
  ['Final Prep Checklist', 'A concise list for the night before and day of the interview.'],
];

const afterPaySteps = [
  ['Secure checkout', 'Choose a package and complete payment through Stripe.'],
  ['Intake link', 'You receive the intake path for your resume, public job posting, and role notes.'],
  ['Upload resume and job posting', 'Share only documents and public role details you have permission to use.'],
  ['Brief prepared', 'Your materials are turned into a practical interview-prep brief.'],
  ['Delivery within promised window', 'Standard delivery is within 24 hours after usable materials are received.'],
];

const useCases = [
  ['Last-minute prep', 'You have an interview soon and need focused talking points quickly.'],
  ['Career changer', 'You need to translate adjacent experience into the language of a new role.'],
  ['Leadership interview', 'You need clear stories about judgment, ownership, and stakeholder communication.'],
  ['Technical/business role', 'You need to explain both the work and its business impact.'],
  ['Government/compliance role', 'You need precise, careful language for regulated or process-heavy work.'],
  ['Internal promotion', 'You need to position proven work as readiness for a higher-scope role.'],
];

const explainerSteps = [
  'Upload your resume',
  'Add the job posting',
  'Choose your package',
  'Receive your personalized interview strategy',
];

const feedbackFocus = [
  'Interview strategy quality',
  'Resume-to-role matching',
  'STAR story guidance',
  'Delivery experience',
  'Overall interview confidence',
];

const trustBullets = [
  'Personalized for your resume and target role',
  'Designed to reduce interview preparation time',
  'Clear, structured interview strategy',
  'Secure checkout powered by Stripe',
  'Privacy-conscious document handling',
  'Transparent pricing with no subscriptions',
  'Built for professionals preparing for real interviews',
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
    question: 'Does this guarantee a job?',
    answer: 'No. AnswerBrief AI provides preparation materials only. We do not guarantee interviews, offers, promotions, or hiring outcomes.',
  },
  {
    question: 'What do I receive?',
    answer: 'Depending on the package, you receive a structured brief with alignment notes, likely questions, STAR story angles, gaps to prepare for, and a final prep checklist.',
  },
  {
    question: 'What happens after I pay?',
    answer: 'You complete secure checkout, submit your intake materials, and receive your brief within the promised delivery window after usable materials are received.',
  },
  {
    question: 'Are payments secure?',
    answer: 'Payments are handled through Stripe checkout. AnswerBrief AI does not store your card number.',
  },
  {
    question: 'Is this a subscription?',
    answer: 'No. Current packages are one-time interview-prep purchases unless a future checkout page explicitly says otherwise.',
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
          <h1>Walk into your interview knowing exactly what to say.</h1>
          <p className="subhead">
            AnswerBrief AI turns your resume and the job posting into a focused interview brief so you can explain your experience clearly, prepare for likely questions, and address gaps with confidence.
          </p>
          <div className="cta-row">
            <a className="button primary" href="/fit-check">Start Free Fit Check</a>
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

      <section className="section-band">
        <div className="section-heading">
          <p className="eyebrow">After checkout</p>
          <h2>What happens after you pay?</h2>
          <p>A simple handoff keeps the process clear from payment to delivery.</p>
        </div>
        <div className="steps timeline-steps">
          {afterPaySteps.map(([title, description], index) => (
            <article className="step" key={title}>
              <span className="step-number">{index + 1}</span>
              <div>
                <h3>{title}</h3>
                <p>{description}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="use-cases">
        <div className="section-heading">
          <p className="eyebrow">Use cases</p>
          <h2>Built for real interview moments.</h2>
          <p>Use AnswerBrief AI when the stakes are high and generic prep is too thin.</p>
        </div>
        <div className="sample-grid">
          {useCases.map(([title, description]) => (
            <article className="sample-tile" key={title}>
              <h3>{title}</h3>
              <p>{description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="section-band founder-section">
        <div className="founder-card">
          <div>
            <p className="eyebrow">Founder-led product</p>
            <h2>Meet the Founder</h2>
            <p>
              AnswerBrief AI was created by Tomas Nieves to help candidates turn resumes and job postings into focused interview preparation strategies without spending hours organizing notes, likely questions, STAR stories, and role-specific talking points.
            </p>
            <div className="founder-links">
              <a className="text-link" href="https://www.linkedin.com/" rel="noreferrer">LinkedIn placeholder</a>
              <a className="text-link" href="https://nieves-labs.com" rel="noreferrer">Nieves Labs</a>
            </div>
          </div>
          <blockquote className="founder-quote">
            <p>“Interviews shouldn’t be about guessing what to say. They should be about confidently communicating the value you already bring.”</p>
            <footer>
              <strong>Tomas Nieves</strong>
              <span>Founder, AnswerBrief AI</span>
            </footer>
          </blockquote>
        </div>
      </section>

      <section className="explainer-section">
        <div className="section-heading">
          <p className="eyebrow">Product walkthrough</p>
          <h2>See AnswerBrief AI in Action</h2>
          <p>
            Watch how AnswerBrief AI turns your resume and target job posting into a personalized interview strategy.
          </p>
        </div>
        <div className="explainer-grid">
          <div className="video-embed-card">
            <video
              className="walkthrough-video"
              src={walkthroughVideoUrl}
              poster={walkthroughPosterUrl}
              autoPlay
              muted
              loop
              playsInline
              controls
            />
            <a className="text-link" href={walkthroughPageUrl} rel="noreferrer">Watch Demo</a>
          </div>
          <div className="explainer-steps">
            {explainerSteps.map((step, index) => (
              <article className="step compact-step" key={step}>
                <span className="step-number">{index + 1}</span>
                <h3>{step}</h3>
              </article>
            ))}
            <a className="button secondary" href="/sample-brief">View Sample Brief</a>
          </div>
        </div>
      </section>

      <section className="section-band feedback-section">
        <div className="section-heading">
          <p className="eyebrow">Early feedback</p>
          <h2>Early User Feedback</h2>
          <p>
            We are actively collecting feedback from job seekers, career changers, and professionals preparing for competitive interviews.
          </p>
        </div>
        <div className="trust-list">
          {feedbackFocus.map((item) => (
            <article className="trust-item" key={item}>
              <span aria-hidden="true">✓</span>
              <p>{item}</p>
            </article>
          ))}
        </div>
        <a className="button primary" href="mailto:support@answer-brief.com?subject=AnswerBrief%20AI%20Feedback">Share Feedback</a>
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

      <section className="section-band trust-section">
        <div className="section-heading">
          <p className="eyebrow">Why trust AnswerBrief AI</p>
          <h2>Practical preparation with clear boundaries.</h2>
        </div>
        <div className="trust-list">
          {trustBullets.map((item) => (
            <article className="trust-item" key={item}>
              <span aria-hidden="true">✓</span>
              <p>{item}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="support-section">
        <div className="support-card">
          <div>
            <p className="eyebrow">Support</p>
            <h2>Questions Before You Purchase?</h2>
            <p>
              Whether you’re preparing for your first interview or your next leadership opportunity, we’re here to help you choose the package that fits your needs.
            </p>
          </div>
          <a className="button primary" href="mailto:support@answer-brief.com">support@answer-brief.com</a>
        </div>
      </section>

      <section id="packages" className="pricing">
        <div className="section-heading">
          <p className="eyebrow">Packages</p>
          <h2>Choose the prep depth that matches the stakes.</h2>
          <p>Standard delivery: within 24 hours. Rush delivery may be available when capacity allows.</p>
          <p className="secure-note">Secure checkout powered by Stripe.</p>
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
        <p className="footer-kicker">Built by Nieves Labs</p>
        <p>Practical AI tools designed to help people solve real-world problems with confidence.</p>
        <p>Privacy note: your materials are used for preparation and are not sold.</p>
        <p>Disclaimer: no guarantees of interviews, offers, promotions, or hiring outcomes.</p>
        <p className="fine-print footer-links">
          <a href="/privacy">Privacy policy</a>
          <a href="/terms">Terms</a>
          <a href="/refund">Refund policy</a>
          <a href="mailto:support@answer-brief.com">Contact</a>
        </p>
      </footer>
    </main>
  );
}
