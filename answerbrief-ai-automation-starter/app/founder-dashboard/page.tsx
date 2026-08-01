import styles from './founder-dashboard.module.css';

const metrics = [
  { label: 'Applications submitted', value: '0', note: 'Connect production application data' },
  { label: 'Active applications', value: '0', note: 'Open and awaiting outcome' },
  { label: 'Recruiter responses', value: '0', note: 'Replies and screening outreach' },
  { label: 'Interviews scheduled', value: '0', note: 'Upcoming interview events' },
  { label: 'Offers', value: '0', note: 'Received offers' },
];

const pipeline = [
  'Discovered',
  'Qualified',
  'Tailoring',
  'Applied',
  'Recruiter Review',
  'Interview',
  'Offer',
  'Closed',
];

const intelligence = [
  ['Current resume version', 'Not connected'],
  ['ATS score', 'Not measured'],
  ['Resume health', 'Not measured'],
  ['AI readiness', 'Not measured'],
  ['Last optimization', 'Not available'],
];

const priorities = [
  'Connect existing application records to the dashboard',
  'Confirm the current production resume version',
  'Review new recruiter responses and outcomes',
];

export default function FounderDashboardPage() {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Founder validation</p>
          <h1>Founder Success Dashboard</h1>
          <p className={styles.subtitle}>
            One command center for Tomas&apos;s live executive job search. Values remain explicit until production data is connected.
          </p>
        </div>
        <a className={styles.homeLink} href="/">AnswerBrief AI</a>
      </header>

      <section className={styles.metricGrid} aria-label="Founder success metrics">
        {metrics.map((metric) => (
          <article className={styles.metricCard} key={metric.label}>
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
            <small>{metric.note}</small>
          </article>
        ))}
      </section>

      <section className={styles.panel}>
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.eyebrow}>Application pipeline</p>
            <h2>Current funnel</h2>
          </div>
          <span className={styles.badge}>Live data pending</span>
        </div>
        <div className={styles.pipeline}>
          {pipeline.map((stage) => (
            <article className={styles.stage} key={stage}>
              <strong>0</strong>
              <span>{stage}</span>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.twoColumn}>
        <article className={styles.panel}>
          <div className={styles.sectionHeading}>
            <div>
              <p className={styles.eyebrow}>Resume intelligence</p>
              <h2>Current application package</h2>
            </div>
          </div>
          <dl className={styles.intelligenceList}>
            {intelligence.map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </article>

        <article className={styles.panel}>
          <div className={styles.sectionHeading}>
            <div>
              <p className={styles.eyebrow}>Daily focus</p>
              <h2>Next actions</h2>
            </div>
          </div>
          <ul className={styles.priorityList}>
            {priorities.map((priority) => (
              <li key={priority}>
                <span aria-hidden="true">□</span>
                {priority}
              </li>
            ))}
          </ul>
        </article>
      </section>

      <section className={styles.panel}>
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.eyebrow}>Activity</p>
            <h2>Recent job-search events</h2>
          </div>
        </div>
        <div className={styles.emptyState}>
          <strong>No activity loaded yet</strong>
          <p>The next integration should map application, recruiter, resume, and interview events into this feed.</p>
        </div>
      </section>
    </main>
  );
}
