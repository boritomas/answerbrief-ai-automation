export default function SuccessPage() {
  return (
    <main>
      <section className="hero">
        <p className="eyebrow">Payment received</p>
        <h1>Your AnswerBrief AI prep package is started.</h1>
        <p className="subhead">
          Check your email for the next steps. You will receive instructions to submit your resume, job posting, interview date, and notes.
        </p>
        <div className="cta-row">
          <a className="button primary" href="/intake">Open intake form</a>
          <a className="button secondary" href="/">Back to home</a>
        </div>
      </section>
    </main>
  );
}
