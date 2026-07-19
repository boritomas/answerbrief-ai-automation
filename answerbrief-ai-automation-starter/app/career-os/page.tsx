import { getCareerOsStatus, summarizeCareerOsStatus } from '@/lib/career-os-status';

export const dynamic = 'force-dynamic';

const navItems = ['Home', 'Opportunities', 'Applications', 'Interviews', 'Contacts', 'Documents'];

export default function CareerOsPage() {
  const status = getCareerOsStatus();
  const summary = summarizeCareerOsStatus(status);

  return (
    <main className="career-os-shell">
      <header className="career-os-nav" aria-label="Career OS navigation">
        <a className="brand" href="/career-os">Tomas Career OS</a>
        <nav>
          {navItems.map((item) => (
            <a href={item === 'Home' ? '/career-os' : `#${item.toLowerCase()}`} key={item}>{item}</a>
          ))}
        </nav>
      </header>

      <section className="career-os-home">
        <div className="career-os-briefing">
          <p className="eyebrow">Executive assistant home</p>
          <h1>{summary.greeting}</h1>
          <p className="subhead">{summary.discoveryLine}</p>
          <div className="career-os-metrics" aria-label="Career OS daily status">
            <Metric label="Worth applying today" value={status.worthApplyingToday} />
            <Metric label="Packages prepared" value={status.preparedPackages} />
            <Metric label="Submitted" value={status.submittedApplications} />
            <Metric label="Needs Tomas" value={status.humanOnlyGates} />
          </div>
          <div className="career-os-summary">
            <p>{summary.applyLine}</p>
            <p>{summary.packageLine}</p>
            <p>{summary.submittedLine}</p>
            <p>{summary.needsLine}</p>
            <p>Estimated salary: {summary.salary}</p>
          </div>
          <div className="cta-row">
            <a className="button primary" href="#applications">Review Applications</a>
            <a className="button secondary" href="/api/career-os/status">View Status JSON</a>
          </div>
        </div>

        <aside className="career-os-action" aria-label="Career OS next action">
          <p className="eyebrow">Next action</p>
          {status.nextAction ? (
            <>
              <h2>{status.nextAction.label}</h2>
              <p>{status.nextAction.reason}</p>
              {status.nextAction.estimatedMinutes ? <p>Estimated time: {status.nextAction.estimatedMinutes} minute{status.nextAction.estimatedMinutes === 1 ? '' : 's'}.</p> : null}
              {status.nextAction.deepLink ? <a className="button primary" href={status.nextAction.deepLink}>Open Required Step</a> : null}
            </>
          ) : (
            <>
              <h2>No Tomas action is ready.</h2>
              <p>{status.blocker || 'Career OS is waiting for production evidence from the autonomous workflow.'}</p>
            </>
          )}
        </aside>
      </section>

      <section id="opportunities" className="career-os-band">
        <h2>Opportunities</h2>
        <p>{status.activeOpportunities} active production opportunit{status.activeOpportunities === 1 ? 'y' : 'ies'} are currently represented in the configured evidence source.</p>
      </section>

      <section id="applications" className="career-os-band">
        <h2>Applications</h2>
        <p>{status.preparedPackages} package{status.preparedPackages === 1 ? '' : 's'} prepared and {status.submittedApplications} submission{status.submittedApplications === 1 ? '' : 's'} confirmed.</p>
      </section>

      <section id="interviews" className="career-os-band">
        <h2>Interviews</h2>
        <p>Interview packages appear here only after a connected production application reaches the interview stage.</p>
      </section>

      <section id="contacts" className="career-os-band">
        <h2>Contacts</h2>
        <p>Recruiter and networking activity appears here when connected sources provide factual production events.</p>
      </section>

      <section id="documents" className="career-os-band">
        <h2>Documents</h2>
        <p>Targeted resumes and application packages appear here only when the artifact exists and opens successfully.</p>
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="career-os-metric">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}
