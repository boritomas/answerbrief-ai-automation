import type { CSSProperties } from 'react';
import { getCareerOsStatus } from '@/lib/career-os-status';

export const dynamic = 'force-dynamic';

type JsonRecord = Record<string, unknown>;

export default async function GuidedCareerOsPage() {
  const status = await getCareerOsStatus();
  const trust = status.operationalTrust;
  const applications = status.evidence.applications as JsonRecord[];
  const artifacts = status.evidence.artifacts as JsonRecord[];

  const submitted = trust.verifiedCounts.submitted || 0;
  const interviews = trust.verifiedCounts.interviews || 0;
  const needsAttention = trust.verifiedCounts.reviewQueue || 0;
  const qualified = applications.filter((item) => text(item.lifecycle_stage).includes('qualified')).length;
  const ready = applications.filter((item) => {
    const stage = text(item.lifecycle_stage);
    return stage.includes('package_ready') || stage.includes('queued');
  }).length;
  const resumeReady = artifacts.some((item) => {
    const type = text(item.artifact_type);
    return type.includes('resume') && text(item.approval_status).includes('approved');
  });

  const calmMessage = needsAttention
    ? `Career OS is handling the search. ${needsAttention} item${needsAttention === 1 ? '' : 's'} need your attention.`
    : 'Career OS is working for you. Nothing needs your attention right now.';

  return (
    <main style={styles.page}>
      <header style={styles.header}>
        <a href="/career-os/guided" style={styles.brand}>Career OS</a>
        <nav style={styles.nav}>
          <a href="#matches" style={styles.navLink}>Best Matches</a>
          <a href="#applications" style={styles.navLink}>Applications</a>
          <a href="#interviews" style={styles.navLink}>Interviews</a>
          <a href="/career-os?view=detailed" style={styles.navLink}>Detailed View</a>
        </nav>
      </header>

      <section style={styles.hero}>
        <p style={styles.eyebrow}>YOUR CAREER GUIDE</p>
        <h1 style={styles.title}>Good morning, Tomas. You&apos;re moving forward.</h1>
        <p style={styles.lead}>{calmMessage}</p>
        <div style={styles.actions}>
          <a href="#matches" style={styles.primaryButton}>Review My Best Matches</a>
          <a href="#applications" style={styles.secondaryButton}>See My Applications</a>
          <a href="#interviews" style={styles.secondaryButton}>Prepare for Interviews</a>
        </div>
      </section>

      <section style={styles.reassurance}>
        <div>
          <p style={styles.eyebrow}>PEACE OF MIND</p>
          <h2 style={styles.sectionTitle}>Career OS is working for you</h2>
        </div>
        <div style={styles.checkList}>
          <StatusLine done={resumeReady} label="Executive Resume v3 is ready" />
          <StatusLine done label={`${qualified} strong opportunities identified`} />
          <StatusLine done={ready > 0} label={`${ready} applications ready to move forward`} />
          <StatusLine done={needsAttention === 0} label={needsAttention ? `${needsAttention} item needs your help` : 'No action required right now'} />
        </div>
      </section>

      <section style={styles.grid}>
        <ProgressCard label="Strong Matches" value={qualified} detail="Roles aligned with your experience" href="#matches" />
        <ProgressCard label="Ready to Apply" value={ready} detail="Resume and evidence prepared" href="#applications" />
        <ProgressCard label="Submitted" value={submitted} detail="Applications sent and verified" href="#applications" />
        <ProgressCard label="Interviews" value={interviews} detail="Your most important outcome" href="#interviews" />
      </section>

      <section id="matches" style={styles.section}>
        <p style={styles.eyebrow}>BEST MATCHES</p>
        <h2 style={styles.sectionTitle}>Opportunities worth your time</h2>
        <p style={styles.muted}>Career OS prioritizes roles that match your leadership experience, compensation goals, location, and verified career evidence.</p>
        <a href="/career-os?view=qualified#qualified-matches" style={styles.primaryButton}>View My Best Matches</a>
      </section>

      <section id="applications" style={styles.section}>
        <p style={styles.eyebrow}>APPLICATIONS</p>
        <h2 style={styles.sectionTitle}>Know exactly where everything stands</h2>
        <div style={styles.path}>
          {['Profile Ready', 'Jobs Matched', 'Applications Prepared', 'Submitted', 'Interviews'].map((step, index) => (
            <div key={step} style={styles.pathStep}>
              <span style={index < 3 ? styles.pathDone : styles.pathPending}>{index < 3 ? '✓' : index + 1}</span>
              <span>{step}</span>
            </div>
          ))}
        </div>
        <a href="/career-os?view=detailed#applications" style={styles.secondaryButton}>View Application Progress</a>
      </section>

      <section id="interviews" style={styles.section}>
        <p style={styles.eyebrow}>INTERVIEW CENTER</p>
        <h2 style={styles.sectionTitle}>Be ready when the opportunity comes</h2>
        <p style={styles.muted}>Your resume, company research, STAR stories, and interview preparation will be kept together in one place.</p>
        <a href="/career-os?view=detailed#interviews" style={styles.secondaryButton}>Open Interview Center</a>
      </section>
    </main>
  );
}

function StatusLine({ done, label }: { done: boolean; label: string }) {
  return <div style={styles.statusLine}><span style={done ? styles.statusDone : styles.statusAttention}>{done ? '✓' : '!'}</span><span>{label}</span></div>;
}

function ProgressCard({ label, value, detail, href }: { label: string; value: number; detail: string; href: string }) {
  return <a href={href} style={styles.card}><span style={styles.cardValue}>{value}</span><strong style={styles.cardLabel}>{label}</strong><span style={styles.muted}>{detail}</span></a>;
}

function text(value: unknown) {
  return typeof value === 'string' ? value.toLowerCase() : '';
}

const styles: Record<string, CSSProperties> = {
  page: { minHeight: '100vh', background: '#f7f8fb', color: '#172033', fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', paddingBottom: 80 },
  header: { maxWidth: 1180, margin: '0 auto', padding: '24px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24 },
  brand: { color: '#172033', textDecoration: 'none', fontWeight: 800, fontSize: 20 },
  nav: { display: 'flex', flexWrap: 'wrap', gap: 18 },
  navLink: { color: '#526079', textDecoration: 'none', fontSize: 14, fontWeight: 650 },
  hero: { maxWidth: 1124, margin: '20px auto 0', padding: '64px 52px', borderRadius: 30, background: 'linear-gradient(135deg, #ffffff 0%, #eef4ff 100%)', boxShadow: '0 24px 70px rgba(31, 55, 95, 0.10)' },
  eyebrow: { margin: '0 0 12px', color: '#4867d6', fontSize: 12, fontWeight: 800, letterSpacing: '0.14em' },
  title: { maxWidth: 760, margin: 0, fontSize: 'clamp(38px, 6vw, 66px)', lineHeight: 1.02, letterSpacing: '-0.045em' },
  lead: { maxWidth: 720, margin: '22px 0 0', color: '#526079', fontSize: 20, lineHeight: 1.55 },
  actions: { display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 30 },
  primaryButton: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '14px 20px', borderRadius: 12, background: '#3457d5', color: '#fff', textDecoration: 'none', fontWeight: 750 },
  secondaryButton: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '14px 20px', borderRadius: 12, background: '#fff', color: '#283b72', border: '1px solid #dbe2f0', textDecoration: 'none', fontWeight: 750 },
  reassurance: { maxWidth: 1124, margin: '24px auto', padding: '30px 34px', borderRadius: 22, background: '#172033', color: '#fff', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(280px, 1fr)', gap: 30, alignItems: 'center' },
  sectionTitle: { margin: '0 0 12px', fontSize: 30, letterSpacing: '-0.025em' },
  checkList: { display: 'grid', gap: 12 },
  statusLine: { display: 'flex', alignItems: 'center', gap: 12, fontSize: 15 },
  statusDone: { width: 24, height: 24, borderRadius: 999, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: '#dff7e8', color: '#167548', fontWeight: 900 },
  statusAttention: { width: 24, height: 24, borderRadius: 999, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: '#fff0cc', color: '#9b6500', fontWeight: 900 },
  grid: { maxWidth: 1124, margin: '24px auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 16 },
  card: { minHeight: 150, padding: 24, borderRadius: 20, background: '#fff', border: '1px solid #e5e9f2', textDecoration: 'none', color: '#172033', display: 'flex', flexDirection: 'column', gap: 8, boxShadow: '0 10px 35px rgba(31, 55, 95, 0.05)' },
  cardValue: { fontSize: 38, fontWeight: 850, letterSpacing: '-0.04em' },
  cardLabel: { fontSize: 17 },
  muted: { color: '#68758c', lineHeight: 1.55 },
  section: { maxWidth: 1124, margin: '24px auto', padding: '38px 40px', borderRadius: 22, background: '#fff', border: '1px solid #e5e9f2' },
  path: { display: 'flex', flexWrap: 'wrap', gap: 18, margin: '28px 0' },
  pathStep: { display: 'flex', alignItems: 'center', gap: 9, color: '#526079', fontWeight: 700 },
  pathDone: { width: 28, height: 28, borderRadius: 999, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: '#dff7e8', color: '#167548' },
  pathPending: { width: 28, height: 28, borderRadius: 999, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: '#edf0f6', color: '#68758c' },
};
