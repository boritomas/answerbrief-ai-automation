export default function TermsPage() {
  return (
    <main>
      <header className="nav">
        <a className="brand" href="/">AnswerBrief AI</a>
        <nav>
          <a href="/">Home</a>
          <a href="/fit-check">Free Fit Check</a>
          <a href="/sample-brief">Sample Brief</a>
        </nav>
      </header>

      <section className="hero compact">
        <p className="eyebrow">Terms</p>
        <h1>Terms of use</h1>
        <p className="subhead">
          AnswerBrief AI provides interview-preparation materials based on information you choose to submit.
        </p>
      </section>

      <section className="legal-page">
        <article>
          <h2>Preparation service</h2>
          <p>
            AnswerBrief AI helps prepare interview materials such as alignment notes, likely questions, STAR story prompts, and checklists. The service does not provide recruiting services, legal advice, employment advice, or hiring decisions.
          </p>
        </article>
        <article>
          <h2>No guarantees</h2>
          <p>
            We do not guarantee interviews, job offers, promotions, salary outcomes, or hiring results. Your results depend on many factors outside our control, including your qualifications, interview performance, employer needs, and the candidate pool.
          </p>
        </article>
        <article>
          <h2>Customer materials</h2>
          <p>
            Submit only resumes, public job postings, and career notes you have permission to share. Do not submit confidential employer documents, client data, proprietary files, passwords, payment data, government identifiers, or sensitive personal information.
          </p>
        </article>
        <article>
          <h2>Payments</h2>
          <p>
            Paid packages are processed through Stripe checkout. Current packages are one-time purchases unless a checkout page explicitly states otherwise.
          </p>
        </article>
      </section>
    </main>
  );
}
