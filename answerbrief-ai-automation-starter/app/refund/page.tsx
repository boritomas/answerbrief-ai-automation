export default function RefundPage() {
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
        <p className="eyebrow">Refund policy</p>
        <h1>Refunds and delivery</h1>
        <p className="subhead">
          Paid briefs are custom preparation materials created from your submitted resume, public job posting, and intake notes.
        </p>
      </section>

      <section className="legal-page">
        <article>
          <h2>Before work begins</h2>
          <p>
            If you paid by mistake or selected the wrong package, contact support as soon as possible. Refunds are easiest to evaluate before preparation work has started.
          </p>
        </article>
        <article>
          <h2>After work begins</h2>
          <p>
            Because paid briefs are custom deliverables, refunds may be limited after work has started or after a brief has been delivered. If there is a delivery issue, contact support so it can be reviewed.
          </p>
        </article>
        <article>
          <h2>Usable materials</h2>
          <p>
            Delivery timelines begin after usable materials are received. If submitted materials are missing, inaccessible, or unrelated to the target role, we may request clarification before preparing the brief.
          </p>
        </article>
        <article>
          <h2>No outcome-based refunds</h2>
          <p>
            AnswerBrief AI does not guarantee interviews, offers, promotions, or hiring outcomes. Refunds are not based on employer decisions or interview results.
          </p>
        </article>
      </section>
    </main>
  );
}
