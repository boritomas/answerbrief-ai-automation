import { packages, PackageKey } from '@/lib/packages';

async function createCheckout(formData: FormData) {
  'use server';

  const packageKey = formData.get('packageKey') as PackageKey;
  const response = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL}/api/checkout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ packageKey }),
  });

  const data = await response.json();

  if (!data.url) {
    throw new Error('Checkout session was not created.');
  }

  return data.url;
}

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

            return (
              <article key={key} className={isFeatured ? 'featured' : ''}>
                <h3>{pkg.name}</h3>
                <p className="price">${pkg.priceUsd}</p>
                <p>{pkg.description}</p>
                <ul>
                  {pkg.deliverables.map((item) => <li key={item}>{item}</li>)}
                </ul>
                <form action={async () => {
                  'use server';
                  const url = await createCheckout(new FormData());
                }}>
                  <input type="hidden" name="packageKey" value={key} />
                </form>
                <a className="button primary" href={`/api/checkout?packageKey=${key}`}>Buy {pkg.name}</a>
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
