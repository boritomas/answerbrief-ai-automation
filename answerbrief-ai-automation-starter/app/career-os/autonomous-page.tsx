import type { CSSProperties } from 'react';
import { SectionNav } from './section-nav';
import { careerOsSelectRows } from '@/lib/career-os-supabase';
import { buildDashboardModel, type DashboardActionLink } from '@/lib/career-os-dashboard';

export const dynamic = 'force-dynamic';

type Row = Record<string, unknown>;

const sections = [
  { id: 'overview', label: 'Today at a glance' },
  { id: 'opportunities', label: 'Opportunities' },
  { id: 'application-timeline', label: 'Application timeline' },
  { id: 'blockers', label: 'Blockers' },
  { id: 'next-actions', label: 'Next actions' },
];

export default async function AutonomousCareerOsPage() {
  const ownerEmail = String(process.env.CAREER_OS_OWNER_EMAIL || 'tomas@nieves.com').trim().replace(/^"|"$/g, '');
  const [postings, applications, reports, automationRuns, workflowEvents] = await Promise.all([
    safeSelect('career_os_job_postings', `select=*&owner_email=eq.${encodeURIComponent(ownerEmail)}&order=fit_score.desc.nullslast,last_checked_at.desc&limit=160`),
    safeSelect('career_os_applications', `select=*&owner_email=eq.${encodeURIComponent(ownerEmail)}&order=updated_at.desc&limit=220`),
    safeSelect('career_os_daily_operating_reports', `select=*&owner_email=eq.${encodeURIComponent(ownerEmail)}&order=generated_at.desc&limit=1`),
    safeSelect('career_os_automation_runs', `select=*&owner_email=eq.${encodeURIComponent(ownerEmail)}&order=started_at.desc&limit=10`),
    safeSelect('career_os_employer_workflow_events', `select=*&owner_email=eq.${encodeURIComponent(ownerEmail)}&order=occurred_at.desc&limit=220`),
  ]);

  const model = buildDashboardModel({ applications, automationRuns, postings, reports, workflowEvents });
  const waiting = model.timeline.filter((item) => item.state === 'Awaiting employer').length;
  const blockerCount = model.blockers.length;
  const submittedMetric = model.metrics.find((metric) => metric.label === 'Submitted today');

  return (
    <main style={styles.page}>
      <header style={styles.header}>
        <div style={styles.brand}>AnswerBrief AI Career OS</div>
        <SectionNav sections={sections} />
      </header>

      <section id="overview" style={styles.hero}>
        <div style={styles.heroMain}>
          <p style={styles.eyebrow}>AUTONOMOUS CAREER OPERATIONS</p>
          <h1 style={styles.title}>Career OS is working for you.</h1>
          <p style={styles.lead}>
            The latest live state shows {model.opportunities.length} qualified opportunities, {model.submittedToday} confirmed submission{model.submittedToday === 1 ? '' : 's'} today, and {waiting} application{waiting === 1 ? '' : 's'} waiting on employer action.
          </p>
          <div style={blockerCount ? styles.noticeWarning : styles.notice}>
            <strong>{blockerCount ? `${blockerCount} structured blocker${blockerCount === 1 ? '' : 's'} need your attention.` : 'No human-only blocker is open right now.'}</strong>
            <span>Last autonomous run: {model.lastAutonomousRun}</span>
            <span>{model.nextScheduledRun ? `Next scheduled run: ${model.nextScheduledRun}` : 'Next scheduled run is not recorded yet.'}</span>
          </div>
        </div>
        <aside style={styles.glance}>
          <h2 style={styles.glanceTitle}>Today at a glance</h2>
          {model.metrics.map((metric) => (
            <Metric
              explanation={metric.explanation}
              key={metric.label}
              label={metric.label}
              value={metric.value}
            />
          ))}
        </aside>
      </section>

      <section style={styles.section}>
        <div style={styles.sectionHeader}>
          <p style={styles.eyebrow}>EXECUTIVE BRIEFING</p>
          <h2 style={styles.sectionTitle}>What Career OS completed</h2>
          <p style={styles.sectionCopy}>The dashboard shows completed autonomous work, verified employer signals, and exact human-only gates without exposing internal queue mechanics.</p>
        </div>
        <div style={styles.decisionGrid}>
          <DecisionCard description="Confirmed submissions recorded with canonical distinct application counting." href="#application-timeline" label="Applied" value={model.submittedToday} />
          <DecisionCard description="Qualified roles retained as one canonical opportunity record each." href="#opportunities" label="Qualified opportunities" value={model.opportunities.length} />
          <DecisionCard description="Submitted applications currently waiting for the employer." href="#application-timeline" label="Awaiting employer" value={waiting} />
          <DecisionCard description="Recruiter responses or recruiter-led updates saved against distinct applications." href="#application-timeline" label="Recruiter updates" value={model.recruiterUpdates} />
          <DecisionCard description="Interview counts require explicit interview evidence, not keyword guesses." href="#application-timeline" label="Verified interviews" value={model.verifiedInterviews} />
          <DecisionCard description="Only exact blocker types that Career OS cannot safely clear on its own." href="#blockers" label="Human input required" value={blockerCount} />
        </div>
        {submittedMetric?.explanation ? <p style={styles.inlineExplanation}>{submittedMetric.explanation}</p> : null}
      </section>

      <section id="opportunities" style={styles.section}>
        <div style={styles.sectionHeader}>
          <p style={styles.eyebrow}>CURATED OPPORTUNITIES</p>
          <h2 style={styles.sectionTitle}>One role, one canonical record</h2>
          <p style={styles.sectionCopy}>Opportunity status now comes from persisted workflow state rather than fit score guesses, and every visible action goes to a real route or saved checkpoint.</p>
        </div>
        <div style={styles.cardGrid}>
          {model.opportunities.slice(0, 8).map((role) => (
            <article id={`opportunity-${role.id}`} key={role.id} style={styles.roleCard}>
              <div style={styles.roleTop}>
                <div>
                  <span style={styles.company}>{role.company}</span>
                  <h3 style={styles.roleTitle}>{role.title}</h3>
                </div>
                <span style={styles.score}>{role.fit || 'New'}{role.fit ? '%' : ''}</span>
              </div>
              <div style={styles.chips}>
                {role.tags.map((tag) => <span key={tag} style={styles.chip}>{tag}</span>)}
              </div>
              <p style={styles.roleMeta}>{role.location} · {role.compensation} · {role.freshness}</p>
              <p id={`fit-analysis-${role.id}`} style={styles.why}><strong>Why it fits:</strong> {role.why}</p>
              <div style={styles.statusRow}>
                <span style={styles.status}>{role.status}</span>
                {role.requisition ? <span style={styles.req}>Req {role.requisition}</span> : null}
              </div>
              <div style={styles.actionRow}>
                {role.actions.map((action) => (
                  <ActionLink action={action} key={`${role.id}-${action.label}`} />
                ))}
              </div>
            </article>
          ))}
          {!model.opportunities.length ? <p style={styles.empty}>No qualified opportunities are available yet.</p> : null}
        </div>
      </section>

      <section id="application-timeline" style={styles.section}>
        <div style={styles.sectionHeader}>
          <p style={styles.eyebrow}>APPLICATION ACTIVITY</p>
          <h2 style={styles.sectionTitle}>Application timeline</h2>
          <p style={styles.sectionCopy}>Each record shows the exact saved event, current application state, next expected step, and whether Tomas needs to act.</p>
        </div>
        <div style={styles.timeline}>
          {model.timeline.map((item) => (
            <article id={`application-${item.id}`} key={item.id} style={styles.timelineItem}>
              <div style={styles.timelineBody}>
                <span style={styles.timelineState}>{item.state}</span>
                <h3 style={styles.timelineTitle}>{item.company} · {item.title}</h3>
                <p style={styles.timelineCopy}><strong>Exact event:</strong> {item.event}</p>
                <p style={styles.timelineCopy}><strong>Next expected step:</strong> {item.nextStep}</p>
                <p style={styles.timelineCopy}><strong>Tomas must act:</strong> {item.tomasMustAct ? 'Yes' : 'No'}</p>
              </div>
              <time style={styles.time}>{formatDateTime(item.occurredAt)}</time>
            </article>
          ))}
          {!model.timeline.length ? <p style={styles.empty}>No application activity is available yet.</p> : null}
        </div>
      </section>

      <section id="blockers" style={styles.section}>
        <div style={styles.sectionHeader}>
          <p style={styles.eyebrow}>BLOCKERS REQUIRING TOMAS</p>
          <h2 style={styles.sectionTitle}>Only true human-only gates</h2>
          <p style={styles.sectionCopy}>Each blocker names the exact gate that stopped automation, why Career OS paused, and the next real action Tomas can take.</p>
        </div>
        <div style={styles.timeline}>
          {model.blockers.map((item) => (
            <article id={`blocker-${item.id}`} key={item.id} style={styles.timelineItem}>
              <div style={styles.timelineBody}>
                <span style={styles.timelineState}>{item.type}</span>
                <h3 style={styles.timelineTitle}>{item.company} · {item.title}</h3>
                <p style={styles.timelineCopy}><strong>What is blocked:</strong> {item.whatIsBlocked}</p>
                <p style={styles.timelineCopy}><strong>Why Career OS stopped:</strong> {item.reason}</p>
                <p style={styles.timelineCopy}><strong>What Tomas must do:</strong> {item.tomasMustDo}</p>
                <div style={styles.actionRow}>
                  <ActionLink action={item.action} />
                </div>
              </div>
              <time style={styles.time}>{formatDateTime(item.updatedAt)}</time>
            </article>
          ))}
          {!model.blockers.length ? <p style={styles.empty}>No current blockers require your input.</p> : null}
        </div>
      </section>

      <section id="next-actions" style={styles.section}>
        <div style={styles.sectionHeader}>
          <p style={styles.eyebrow}>NEXT AUTONOMOUS ACTIONS</p>
          <h2 style={styles.sectionTitle}>What Career OS will do next</h2>
          <p style={styles.sectionCopy}>Only persisted queue and worker records appear here. Nothing is synthesized from aggregate counts.</p>
        </div>
        <div style={styles.timeline}>
          {model.nextActions.length ? model.nextActions.map((action) => (
            <article key={action.id} style={styles.timelineItem}>
              <div style={styles.timelineBody}>
                <span style={styles.timelineState}>{action.status}</span>
                <h3 style={styles.timelineTitle}>{action.action}</h3>
                <p style={styles.timelineCopy}><strong>Scheduled time:</strong> {action.scheduledTime}</p>
                <p style={styles.timelineCopy}><strong>Affected roles:</strong> {action.affectedRoles.join(', ')}</p>
                <p style={styles.timelineCopy}><strong>Last attempt:</strong> {action.lastAttempt}</p>
                <p style={styles.timelineCopy}><strong>Outcome:</strong> {action.outcome}</p>
              </div>
            </article>
          )) : <p style={styles.empty}>No autonomous actions are currently scheduled.</p>}
        </div>
      </section>
    </main>
  );
}

function ActionLink({ action }: { action: DashboardActionLink }) {
  return (
    <a
      href={action.href}
      rel={action.external ? 'noreferrer noopener' : undefined}
      style={styles.actionLink}
      target={action.external ? '_blank' : undefined}
    >
      {action.label}
    </a>
  );
}

function DecisionCard({
  description,
  href,
  label,
  value,
}: {
  description: string;
  href: string;
  label: string;
  value: number;
}) {
  return (
    <article style={styles.decisionCard}>
      <strong style={styles.decisionValue}>{value}</strong>
      <h3 style={styles.decisionTitle}>{label}</h3>
      <p style={styles.decisionCopy}>{description}</p>
      <a href={href} style={styles.cardLink}>View details</a>
    </article>
  );
}

function Metric({
  explanation,
  label,
  value,
}: {
  explanation?: string;
  label: string;
  value: number | string;
}) {
  return (
    <div style={styles.metricWrap}>
      <div style={styles.metric}>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
      {explanation ? <p style={styles.metricExplanation}>{explanation}</p> : null}
    </div>
  );
}

async function safeSelect(table: string, query: string): Promise<Row[]> {
  try { return await careerOsSelectRows(table, query); } catch { return []; }
}

function formatDateTime(value: string) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed)
    ? new Intl.DateTimeFormat('en-US', { day: 'numeric', hour: 'numeric', minute: '2-digit', month: 'short' }).format(new Date(parsed))
    : 'Date unavailable';
}

const styles: Record<string, CSSProperties> = {
  actionLink: { color: '#165ee8', fontSize: 13, fontWeight: 700, textDecoration: 'none' },
  actionRow: { display: 'flex', flexWrap: 'wrap', gap: 14, marginTop: 18 },
  brand: { fontSize: 18, fontWeight: 800 },
  cardGrid: { display: 'grid', gap: 18, gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))' },
  cardLink: { color: '#165ee8', fontSize: 13, fontWeight: 700, textDecoration: 'none' },
  chip: { background: '#f0f5fa', borderRadius: 999, color: '#38516f', fontSize: 12, fontWeight: 700, padding: '6px 9px' },
  chips: { display: 'flex', flexWrap: 'wrap', gap: 8, margin: '18px 0 14px' },
  company: { color: '#405978', fontSize: 13, fontWeight: 800, textTransform: 'uppercase' },
  decisionCard: { background: '#fff', border: '1px solid #dce5f0', borderRadius: 18, display: 'flex', flexDirection: 'column', gap: 10, padding: 24 },
  decisionCopy: { color: '#5a6f8b', lineHeight: 1.45, margin: 0 },
  decisionGrid: { display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))' },
  decisionTitle: { margin: 0 },
  decisionValue: { color: '#087f68', fontSize: 34 },
  empty: { background: '#fff', borderRadius: 16, padding: 24 },
  eyebrow: { color: '#165ee8', fontSize: 12, fontWeight: 800, letterSpacing: 1.1, margin: '0 0 12px' },
  glance: { background: '#fff', border: '1px solid #d9e5f3', borderRadius: 24, boxShadow: '0 18px 50px rgba(31,73,125,.06)', padding: 30 },
  glanceTitle: { fontSize: 26, margin: '0 0 20px' },
  header: { alignItems: 'center', background: 'rgba(255,255,255,.96)', borderBottom: '1px solid #dce5f0', display: 'flex', gap: 24, justifyContent: 'space-between', padding: '20px max(32px, calc((100vw - 1320px)/2))', position: 'sticky', top: 0, zIndex: 10 },
  hero: { display: 'grid', gap: 24, gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', margin: '0 auto', maxWidth: 1320, padding: '48px 32px 24px' },
  heroMain: { background: 'linear-gradient(135deg,#fff 0%,#eef6ff 100%)', border: '1px solid #d9e5f3', borderRadius: 24, boxShadow: '0 18px 50px rgba(31,73,125,.08)', padding: 38 },
  inlineExplanation: { color: '#4b6380', margin: '16px 0 0' },
  lead: { color: '#425b7a', fontSize: 20, lineHeight: 1.55, margin: '22px 0', maxWidth: 850 },
  metric: { alignItems: 'center', color: '#405978', display: 'flex', justifyContent: 'space-between', padding: '17px 0' },
  metricExplanation: { color: '#4b6380', fontSize: 13, lineHeight: 1.5, margin: '0 0 14px' },
  metricWrap: { borderTop: '1px solid #e3eaf2' },
  notice: { background: '#eaf7f2', borderRadius: 14, color: '#116b55', display: 'flex', flexDirection: 'column', gap: 6, padding: '16px 18px' },
  noticeWarning: { background: '#fff5eb', borderRadius: 14, color: '#9a4a00', display: 'flex', flexDirection: 'column', gap: 6, padding: '16px 18px' },
  page: { background: '#f7f9fc', color: '#10233f', fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif', minHeight: '100vh' },
  req: { color: '#6c7f97', fontSize: 12 },
  roleCard: { background: '#fff', border: '1px solid #dce5f0', borderRadius: 20, boxShadow: '0 12px 32px rgba(24,53,91,.06)', minWidth: 0, padding: 24 },
  roleMeta: { color: '#526a87', lineHeight: 1.45 },
  roleTitle: { fontSize: 22, lineHeight: 1.25, margin: '7px 0 0' },
  roleTop: { alignItems: 'flex-start', display: 'flex', gap: 18, justifyContent: 'space-between' },
  score: { background: '#eaf3ff', borderRadius: 999, color: '#135cca', flex: '0 0 auto', fontWeight: 800, padding: '7px 11px' },
  section: { margin: '0 auto', maxWidth: 1320, padding: '56px 32px 8px', scrollMarginTop: 110 },
  sectionCopy: { color: '#4b6380', fontSize: 17, lineHeight: 1.55 },
  sectionHeader: { marginBottom: 24, maxWidth: 820 },
  sectionTitle: { fontSize: 34, letterSpacing: -1, margin: 0 },
  status: { color: '#087f68', fontWeight: 800 },
  statusRow: { alignItems: 'center', display: 'flex', gap: 12, justifyContent: 'space-between', marginTop: 18 },
  time: { color: '#75869c', whiteSpace: 'nowrap' },
  timeline: { display: 'grid', gap: 12 },
  timelineBody: { display: 'grid', gap: 8 },
  timelineCopy: { color: '#526a87', margin: 0 },
  timelineItem: { background: '#fff', border: '1px solid #dce5f0', borderRadius: 16, display: 'flex', flexWrap: 'wrap', gap: 24, justifyContent: 'space-between', padding: 22 },
  timelineState: { color: '#0d6f5a', fontSize: 12, fontWeight: 800, textTransform: 'uppercase' },
  timelineTitle: { fontSize: 18, margin: 0 },
  title: { fontSize: 'clamp(40px,5vw,66px)', letterSpacing: -2.4, lineHeight: 1.02, margin: 0 },
  why: { color: '#263f5e', lineHeight: 1.55, marginBottom: 0 },
};
