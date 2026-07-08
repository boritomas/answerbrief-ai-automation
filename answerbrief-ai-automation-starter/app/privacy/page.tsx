export default function PrivacyPage() {
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
        <p className="eyebrow">Privacy</p>
        <h1>Privacy and data use</h1>
        <p className="subhead">
          AnswerBrief AI uses customer-provided materials only to create interview prep deliverables.
        </p>
      </section>
      <section className="legal-page">
        <article>
          <h2>Materials you submit</h2>
          <p>
            Customers should only submit resumes, public job postings, and career notes they have the right to share. Do not upload confidential employer documents, client data, proprietary files, passwords, bank details, government identifiers, or sensitive personal information.
          </p>
        </article>
        <article>
          <h2>How materials are used</h2>
          <p>
            Submitted materials are used to prepare your free fit check or paid interview brief. We do not sell your resume or intake information.
          </p>
        </article>
        <article>
          <h2>Payment privacy</h2>
          <p>
            Payments are handled through Stripe checkout. AnswerBrief AI does not store your card number.
          </p>
        </article>
        <article>
          <h2>No job guarantee</h2>
          <p>
            AnswerBrief AI provides interview preparation support. It does not guarantee interviews, offers, promotions, or employment outcomes.
          </p>
        </article>
      </section>
    </main>
  );
}
