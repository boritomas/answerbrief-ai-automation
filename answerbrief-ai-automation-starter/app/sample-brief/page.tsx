const sections = [
  {
    title: 'Executive Summary',
    body: 'This fictional candidate should position their operations background around ownership, cross-functional communication, and measurable process improvement. The strongest interview path is to connect project outcomes to the target role requirements in plain language.',
  },
  {
    title: 'Opening Pitch',
    body: 'I have built my career around making complex operational work easier to understand, track, and improve. In my last role, I worked across teams to resolve process gaps, improve reporting quality, and keep stakeholders aligned. This role stood out because it combines structured problem solving, communication, and accountability for outcomes.',
  },
  {
    title: 'Resume-to-Role Alignment',
    body: 'The resume shows relevant experience in stakeholder management, issue resolution, and operational reporting. The candidate should prepare specific examples that show scope, tools used, constraints, and measurable impact.',
  },
  {
    title: 'Likely Interview Questions',
    body: 'Expect questions about prioritization, ambiguity, cross-functional conflict, technical ramp-up, and why this role is the right next move. Prepare concise answers for: Tell me about yourself, why this role, a time you improved a process, a difficult stakeholder situation, a mistake you learned from, and how you measure success.',
  },
  {
    title: 'STAR Story Example',
    body: 'Situation: A recurring reporting delay caused confusion between operations and leadership. Task: The candidate needed to clarify ownership and make the process easier to repeat. Action: They mapped the handoff, created a weekly tracker, and set a short review cadence with stakeholders. Result: The team reduced back-and-forth, delivered updates more predictably, and gave leadership a clearer view of risk.',
  },
  {
    title: 'Strengths to Emphasize',
    body: 'Emphasize structured thinking, ownership, practical communication, and ability to connect details to business outcomes.',
  },
  {
    title: 'Gaps to Prepare For',
    body: 'Prepare honest language for any missing keywords, limited direct industry exposure, or leadership scope that is adjacent rather than identical to the job posting.',
  },
  {
    title: 'Final Prep Checklist',
    body: 'Practice the opening pitch aloud, choose three STAR stories, mark the highest-risk job requirements, prepare two interviewer questions, confirm the interview time and format, and avoid sharing confidential employer information.',
  },
];

export default function SampleBriefPage() {
  return (
    <main>
      <header className="nav">
        <a className="brand" href="/">AnswerBrief AI</a>
        <nav>
          <a href="/">Home</a>
          <a href="/fit-check">Free Fit Check</a>
        </nav>
      </header>

      <section className="hero compact">
        <p className="eyebrow">Fictional sample</p>
        <h1>Preview Your Interview Brief</h1>
        <p className="subhead">
          This sample uses generic content only. Real briefs are built from the customer&apos;s resume, public job posting, and intake notes.
        </p>
      </section>

      <section className="sample-report">
        {sections.map((section) => (
          <article key={section.title}>
            <h2>{section.title}</h2>
            <p>{section.body}</p>
          </article>
        ))}
      </section>

      <section className="disclaimer-panel">
        <h2>No outcome guarantees</h2>
        <p>
          AnswerBrief AI provides interview preparation materials only. It does not guarantee interviews, job offers, promotions, or hiring outcomes.
        </p>
      </section>
    </main>
  );
}
