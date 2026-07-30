import type { CSSProperties } from 'react';
import { careerOsSelectRows } from '@/lib/career-os-supabase';

export const dynamic = 'force-dynamic';

type Row = Record<string, unknown>;
type Opportunity = {
  id: string;
  company: string;
  title: string;
  requisition: string;
  location: string;
  compensation: string;
  fit: number;
  status: string;
  freshness: string;
  tags: string[];
  why: string;
};

type Activity = {
  id: string;
  company: string;
  title: string;
  recruiterResponse: boolean;
  state: string;
  summary: string;
  updatedAt: string;
};

export default async function AutonomousCareerOsPage() {
  const ownerEmail = String(process.env.CAREER_OS_OWNER_EMAIL || 'tomas@nieves.com').trim().replace(/^"|"$/g, '');
  const [postings, applications, reports] = await Promise.all([
    safeSelect('career_os_job_postings', `select=*&owner_email=eq.${encodeURIComponent(ownerEmail)}&order=fit_score.desc.nullslast,last_checked_at.desc&limit=120`),
    safeSelect('career_os_applications', `select=*&owner_email=eq.${encodeURIComponent(ownerEmail)}&order=updated_at.desc&limit=120`),
    safeSelect('career_os_daily_operating_reports', `select=*&owner_email=eq.${encodeURIComponent(ownerEmail)}&order=generated_at.desc&limit=1`),
  ]);

  const opportunities = buildOpportunities(postings);
  const activity = buildActivity(applications);
  const submitted = activity.filter((item) => item.state === 'Submitted').length;
  const interviews = activity.filter((item) => item.state === 'Interview').length;
  const blocked = activity.filter((item) => item.state === 'Needs Tomas').length;
  const blockerItems = activity.filter((item) => item.state === 'Needs Tomas');
  const recruiterResponses = activity.filter((item) => item.recruiterResponse).length;
  const waiting = activity.filter((item) => item.state === 'Awaiting employer').length;
  const todaySubmitted = activity.filter((item) => item.state === 'Submitted' && isToday(item.updatedAt)).length;
  const report = reports[0] || {};
  const nextRun = readNextRun(report);
  const noAction = blocked === 0;
  const nextActions = buildNextActions({ blocked, interviews, nextRun, opportunities: opportunities.length, waiting });

  return (
    <main style={styles.page}>
      <header style={styles.header}>
        <div style={styles.brand}>AnswerBrief AI Career OS</div>
        <nav style={styles.nav}>
          <a href="#activity" style={styles.navLink}>Today&apos;s Activity</a>
          <a href="#opportunities" style={styles.navLink}>Opportunities</a>
          <a href="#applications" style={styles.navLink}>Applications</a>
          <a href="#blockers" style={styles.navLink}>Blockers</a>
          <a href="#next-actions" style={styles.navLink}>Next Actions</a>
        </nav>
      </header>

      <section style={styles.hero}>
        <div style={styles.heroMain}>
          <p style={styles.eyebrow}>AUTONOMOUS CAREER OPERATIONS</p>
          <h1 style={styles.title}>Career OS is working for you.</h1>
          <p style={styles.lead}>
            Since the latest verified update, Career OS retained {opportunities.length} qualified opportunities,
            submitted {todaySubmitted} application{todaySubmitted === 1 ? '' : 's'} today, and is tracking {waiting} active employer review{waiting === 1 ? '' : 's'}.
          </p>
          <div style={styles.notice}>
            <strong>{noAction ? 'No action is required from you right now.' : `${blocked} item${blocked === 1 ? '' : 's'} require your attention.`}</strong>
            <span>{nextRun ? `Next autonomous run: ${nextRun}` : 'The next autonomous run will appear after the next status update.'}</span>
          </div>
        </div>
        <aside style={styles.glance}>
          <h2 style={styles.glanceTitle}>Today at a glance</h2>
          <Metric label="Strong opportunities" value={opportunities.length} />
          <Metric label="Submitted today" value={todaySubmitted} />
          <Metric label="Total submitted" value={submitted} />
          <Metric label="Recruiter responses" value={recruiterResponses} />
          <Metric label="Interviews" value={interviews} />
          <Metric label="Needs Tomas" value={blocked} />
        </aside>
      </section>

      <section id="activity" style={styles.section}>
        <div style={styles.sectionHeader}>
          <p style={styles.eyebrow}>EXECUTIVE BRIEFING</p>
          <h2 style={styles.sectionTitle}>What Career OS completed</h2>
          <p style={styles.sectionCopy}>The dashboard reports completed work, external responses, and true exceptions. Routine qualified applications remain autonomous.</p>
        </div>
        <div style={styles.decisionGrid}>
          <DecisionCard label="Applied" value={todaySubmitted} description="Verified submissions recorded today" />
          <DecisionCard label="Qualified opportunities" value={opportunities.length} description="Roles that met quality and fit thresholds" />
          <DecisionCard label="Awaiting employer" value={waiting} description="Submitted applications waiting on a response" />
          <DecisionCard label="Recruiter responses" value={recruiterResponses} description="Responses and recruiter updates already captured" />
          <DecisionCard label="Interview requested" value={interviews} description="Applications with interview activity" />
          <DecisionCard label="Human input required" value={blocked} description="Only checkpoints Career OS cannot safely complete" />
        </div>
      </section>

      <section id="opportunities" style={styles.section}>
        <div style={styles.sectionHeader}>
          <p style={styles.eyebrow}>CURATED OPPORTUNITIES</p>
          <h2 style={styles.sectionTitle}>One role, one canonical record</h2>
          <p style={styles.sectionCopy}>Each requisition appears once. Badges show every collection it qualifies for without duplicating the card.</p>
        </div>
        <div style={styles.cardGrid}>
          {opportunities.slice(0, 8).map((role) => (
            <article key={role.id} style={styles.roleCard}>
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
              <p style={styles.why}><strong>Why it fits:</strong> {role.why}</p>
              <div style={styles.statusRow}>
                <span style={styles.status}>{role.status}</span>
                {role.requisition ? <span style={styles.req}>Req {role.requisition}</span> : null}
              </div>
            </article>
          ))}
          {!opportunities.length ? <p style={styles.empty}>No qualified opportunities are available yet.</p> : null}
        </div>
      </section>

      <section id="applications" style={styles.section}>
        <div style={styles.sectionHeader}>
          <p style={styles.eyebrow}>APPLICATION ACTIVITY</p>
          <h2 style={styles.sectionTitle}>What happened and what happens next</h2>
        </div>
        <div style={styles.timeline}>
          {activity.slice(0, 12).map((item) => (
            <article key={item.id} style={styles.timelineItem}>
              <div>
                <span style={styles.timelineState}>{item.state}</span>
                <h3 style={styles.timelineTitle}>{item.company} · {item.title}</h3>
                <p style={styles.timelineCopy}>{item.summary}</p>
              </div>
              <time style={styles.time}>{formatDate(item.updatedAt)}</time>
            </article>
          ))}
          {!activity.length ? <p style={styles.empty}>No application activity is available yet.</p> : null}
        </div>
      </section>

      <section id="blockers" style={styles.section}>
        <div style={styles.sectionHeader}>
          <p style={styles.eyebrow}>BLOCKERS REQUIRING TOMAS</p>
          <h2 style={styles.sectionTitle}>Only true human-only gates</h2>
          <p style={styles.sectionCopy}>Career OS pauses only when a checkpoint cannot be completed autonomously.</p>
        </div>
        <div style={styles.timeline}>
          {blockerItems.slice(0, 6).map((item) => (
            <article key={`blocker-${item.id}`} style={styles.timelineItem}>
              <div>
                <span style={styles.timelineState}>Needs Tomas</span>
                <h3 style={styles.timelineTitle}>{item.company} · {item.title}</h3>
                <p style={styles.timelineCopy}>{item.summary}</p>
              </div>
              <time style={styles.time}>{formatDate(item.updatedAt)}</time>
            </article>
          ))}
          {!blockerItems.length ? <p style={styles.empty}>No current blockers require your input.</p> : null}
        </div>
      </section>

      <section id="next-actions" style={styles.section}>
        <div style={styles.sectionHeader}>
          <p style={styles.eyebrow}>NEXT AUTONOMOUS ACTIONS</p>
          <h2 style={styles.sectionTitle}>What Career OS will do next</h2>
        </div>
        <div style={styles.timeline}>
          {nextActions.map((action, index) => (
            <article key={`next-${index}`} style={styles.timelineItem}>
              <div>
                <span style={styles.timelineState}>Queued</span>
                <p style={styles.timelineCopy}>{action}</p>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div style={styles.metric}><span>{label}</span><strong>{value}</strong></div>;
}

function DecisionCard({ description, label, value }: { description: string; label: string; value: number }) {
  return <article style={styles.decisionCard}><strong style={styles.decisionValue}>{value}</strong><h3 style={styles.decisionTitle}>{label}</h3><p style={styles.decisionCopy}>{description}</p></article>;
}

async function safeSelect(table: string, query: string): Promise<Row[]> {
  try { return await careerOsSelectRows(table, query); } catch { return []; }
}

function buildOpportunities(rows: Row[]): Opportunity[] {
  const deduped = new Map<string, Opportunity>();
  for (const row of rows) {
    const raw = asRecord(row.raw_record);
    const company = clean(row.company || row.employer || raw.company || raw.employer) || 'Company not saved';
    const title = clean(row.title || row.position || raw.title) || 'Role not saved';
    const requisition = clean(row.external_requisition_id || raw.requisition_id || raw.job_id);
    const key = compact(`${company}:${requisition || title}`);
    if (deduped.has(key)) continue;
    const fit = number(row.fit_score || row.match_score);
    if (fit && fit < 65) continue;
    const text = `${title} ${clean(row.normalized_description || raw.description)}`.toLowerCase();
    const tags = new Set<string>();
    if (fit >= 85) tags.add('Best match');
    if (hasAny(text, ['ai', 'automation', 'machine learning'])) tags.add('AI leadership');
    if (daysSince(row.created_at || row.last_checked_at || row.updated_at) <= 14) tags.add('Recently posted');
    if (number(row.compensation_max_usd) >= 220000) tags.add('High compensation');
    const review = clean(raw.review_decision);
    deduped.set(key, {
      id: clean(row.id || key), company, title, requisition,
      location: clean(row.location || raw.location) || 'Location not listed',
      compensation: compensation(row), fit,
      status: review === 'watch' ? 'Watching' : review === 'save' ? 'Saved' : review === 'tailor' ? 'Tailoring package' : fit >= 85 ? 'Queued for autonomous review' : 'Watching',
      freshness: freshness(row.last_checked_at || row.updated_at || row.created_at),
      tags: Array.from(tags).length ? Array.from(tags) : ['Qualified'],
      why: whyFit(text),
    });
  }
  return Array.from(deduped.values()).sort((a, b) => b.fit - a.fit).slice(0, 18);
}

function buildActivity(rows: Row[]): Activity[] {
  return rows.map((row) => {
    const raw = asRecord(row.raw_record);
    const text = `${clean(row.lifecycle_stage)} ${clean(row.next_action)} ${JSON.stringify(raw)}`.toLowerCase();
    let state = 'In progress';
    let summary = 'Career OS is continuing the application path when it is safe.';
    if (row.confirmation_number || row.submission_evidence || hasAny(text, ['submitted', 'confirmed'])) {
      state = 'Submitted'; summary = 'Career OS recorded a confirmed submission and is waiting for the employer.';
    } else if (hasAny(text, ['interview'])) {
      state = 'Interview'; summary = 'An interview-related update is saved and preparation can begin.';
    } else if (hasAny(text, ['captcha', 'verification', 'otp', 'legal', 'consent', 'missing answer'])) {
      state = 'Needs Tomas'; summary = 'Career OS reached a checkpoint that requires Tomas before it can continue.';
    } else if (hasAny(text, ['awaiting', 'employer response', 'under review'])) {
      state = 'Awaiting employer'; summary = 'The application is with the employer; no action is required.';
    } else if (hasAny(text, ['reject', 'declined', 'not moving forward'])) {
      state = 'Closed'; summary = 'The employer outcome is recorded and targeting data will be updated.';
    }
    return {
      id: clean(row.id || `${row.employer}:${row.position}`),
      company: clean(row.employer || raw.company) || 'Employer not saved',
      title: clean(row.position || row.title || raw.title) || 'Role not saved',
      recruiterResponse: hasAny(text, ['recruiter', 'reply', 'responded', 'phone screen', 'interview']),
      state, summary,
      updatedAt: clean(row.updated_at || row.created_at || new Date().toISOString()),
    };
  });
}

function buildNextActions({
  blocked,
  interviews,
  nextRun,
  opportunities,
  waiting,
}: {
  blocked: number;
  interviews: number;
  nextRun: string;
  opportunities: number;
  waiting: number;
}) {
  const actions: string[] = [];
  if (blocked > 0) actions.push(`Pause autonomous submission paths for ${blocked} blocker${blocked === 1 ? '' : 's'} until Tomas resolves the required checkpoint${blocked === 1 ? '' : 's'}.`);
  if (interviews > 0) actions.push(`Prepare interview support packages for ${interviews} active interview thread${interviews === 1 ? '' : 's'}.`);
  actions.push(`Continue monitoring ${waiting} employer response${waiting === 1 ? '' : 's'} and record every update in the application timeline.`);
  actions.push(`Re-rank ${opportunities} qualified opportunit${opportunities === 1 ? 'y' : 'ies'} and advance the strongest matches through autonomous application steps.`);
  if (nextRun) actions.push(`Execute the next scheduled autonomous cycle at ${nextRun}.`);
  return actions.slice(0, 5);
}

function readNextRun(report: Row) {
  const payload = asRecord(report.payload);
  const cycle = asRecord(payload.daily_operating_cycle);
  const value = clean(cycle.nextScheduledRun || cycle.next_scheduled_run || payload.next_scheduled_run);
  return value ? formatDateTime(value) : '';
}

function compensation(row: Row) {
  const min = number(row.compensation_min_usd);
  const max = number(row.compensation_max_usd);
  if (min && max) return `${money(min)}-${money(max)}`;
  if (max) return `Up to ${money(max)}`;
  return clean(row.compensation_text) || 'Compensation not posted';
}

function whyFit(text: string) {
  if (hasAny(text, ['director', 'senior director']) && hasAny(text, ['product', 'platform'])) return 'Senior product leadership and platform ownership align with the approved profile.';
  if (hasAny(text, ['ai', 'automation'])) return 'AI and automation leadership signals align with the target career direction.';
  if (hasAny(text, ['customer experience', 'transformation'])) return 'Customer experience and transformation responsibilities map to verified experience.';
  return 'The role cleared Career OS fit and quality thresholds.';
}

function isToday(value: string) {
  const date = new Date(value); const now = new Date();
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
}

function daysSince(value: unknown) { const parsed = Date.parse(clean(value)); return parsed ? Math.max(0, Math.floor((Date.now() - parsed) / 86400000)) : 9999; }
function freshness(value: unknown) { const days = daysSince(value); return days === 0 ? 'Updated today' : days === 1 ? 'Updated yesterday' : days <= 14 ? `Updated ${days} days ago` : `Checked ${days} days ago`; }
function formatDate(value: string) { const parsed = Date.parse(value); return parsed ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(parsed)) : 'Date unavailable'; }
function formatDateTime(value: string) { const parsed = Date.parse(value); return parsed ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(parsed)) : value; }
function money(value: number) { return `$${Math.round(value / 1000)}K`; }
function hasAny(value: string, terms: string[]) { return terms.some((term) => value.includes(term)); }
function compact(value: unknown) { return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, ''); }
function clean(value: unknown) { return String(value || '').trim(); }
function number(value: unknown) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
function asRecord(value: unknown): Row { return value && typeof value === 'object' && !Array.isArray(value) ? value as Row : {}; }

const styles: Record<string, CSSProperties> = {
  page: { minHeight: '100vh', background: '#f7f9fc', color: '#10233f', fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif' },
  header: { position: 'sticky', top: 0, zIndex: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 24, padding: '20px max(32px, calc((100vw - 1320px)/2))', background: 'rgba(255,255,255,.96)', borderBottom: '1px solid #dce5f0' },
  brand: { fontWeight: 800, fontSize: 18 }, nav: { display: 'flex', gap: 24, flexWrap: 'wrap' }, navLink: { color: '#203858', textDecoration: 'none', fontWeight: 700, fontSize: 14 },
  hero: { maxWidth: 1320, margin: '0 auto', padding: '48px 32px 24px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 24 },
  heroMain: { padding: 38, border: '1px solid #d9e5f3', borderRadius: 24, background: 'linear-gradient(135deg,#fff 0%,#eef6ff 100%)', boxShadow: '0 18px 50px rgba(31,73,125,.08)' },
  eyebrow: { margin: '0 0 12px', color: '#165ee8', fontWeight: 800, fontSize: 12, letterSpacing: 1.1 }, title: { margin: 0, fontSize: 'clamp(40px,5vw,66px)', lineHeight: 1.02, letterSpacing: -2.4 }, lead: { maxWidth: 850, margin: '22px 0', color: '#425b7a', fontSize: 20, lineHeight: 1.55 },
  notice: { display: 'flex', flexDirection: 'column', gap: 6, padding: '16px 18px', borderRadius: 14, background: '#eaf7f2', color: '#116b55' },
  glance: { padding: 30, border: '1px solid #d9e5f3', borderRadius: 24, background: '#fff', boxShadow: '0 18px 50px rgba(31,73,125,.06)' }, glanceTitle: { margin: '0 0 20px', fontSize: 26 },
  metric: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '17px 0', borderTop: '1px solid #e3eaf2', color: '#405978' },
  section: { maxWidth: 1320, margin: '0 auto', padding: '56px 32px 8px' }, sectionHeader: { maxWidth: 820, marginBottom: 24 }, sectionTitle: { margin: 0, fontSize: 34, letterSpacing: -1 }, sectionCopy: { color: '#4b6380', fontSize: 17, lineHeight: 1.55 },
  decisionGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 16 }, decisionCard: { padding: 24, borderRadius: 18, background: '#fff', border: '1px solid #dce5f0' }, decisionValue: { fontSize: 34, color: '#087f68' }, decisionTitle: { margin: '10px 0 6px' }, decisionCopy: { margin: 0, color: '#5a6f8b', lineHeight: 1.45 },
  cardGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', gap: 18 }, roleCard: { minWidth: 0, padding: 24, background: '#fff', border: '1px solid #dce5f0', borderRadius: 20, boxShadow: '0 12px 32px rgba(24,53,91,.06)' }, roleTop: { display: 'flex', justifyContent: 'space-between', gap: 18, alignItems: 'flex-start' }, company: { color: '#405978', fontWeight: 800, fontSize: 13, textTransform: 'uppercase' }, roleTitle: { margin: '7px 0 0', fontSize: 22, lineHeight: 1.25 }, score: { flex: '0 0 auto', padding: '7px 11px', borderRadius: 999, background: '#eaf3ff', color: '#135cca', fontWeight: 800 },
  chips: { display: 'flex', flexWrap: 'wrap', gap: 8, margin: '18px 0 14px' }, chip: { padding: '6px 9px', borderRadius: 999, background: '#f0f5fa', color: '#38516f', fontSize: 12, fontWeight: 700 }, roleMeta: { color: '#526a87', lineHeight: 1.45 }, why: { color: '#263f5e', lineHeight: 1.55 }, statusRow: { display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginTop: 18 }, status: { color: '#087f68', fontWeight: 800 }, req: { color: '#6c7f97', fontSize: 12 },
  timeline: { display: 'grid', gap: 12 }, timelineItem: { display: 'flex', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap', padding: 22, background: '#fff', border: '1px solid #dce5f0', borderRadius: 16 }, timelineState: { color: '#0d6f5a', fontWeight: 800, fontSize: 12, textTransform: 'uppercase' }, timelineTitle: { margin: '7px 0', fontSize: 18 }, timelineCopy: { margin: 0, color: '#526a87' }, time: { color: '#75869c', whiteSpace: 'nowrap' }, empty: { padding: 24, background: '#fff', borderRadius: 16 },
};
