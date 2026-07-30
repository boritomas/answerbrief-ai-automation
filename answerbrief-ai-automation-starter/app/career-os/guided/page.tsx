import { createCareerOsActionToken } from '@/lib/career-os-queue';
import { careerOsSelectRows } from '@/lib/career-os-supabase';
import { OpportunityActionControl } from '../action-controls';

export const dynamic = 'force-dynamic';

type JsonRecord = Record<string, unknown>;

type CollectionKey = 'ai' | 'best' | 'compensation' | 'new';

type RoleCard = {
  aiRecommendation: string;
  canonicalUrl: string;
  collectionKeys: CollectionKey[];
  companyContext: string;
  companySignals: string[];
  compensation: string;
  compensationConfidence: string;
  employer: string;
  fitScore: number;
  freshness: string;
  gaps: string[];
  id: string;
  location: string;
  preferenceMatches: string[];
  readiness: string;
  requisitionId: string;
  status: string;
  title: string;
  whyFit: string[];
  workModel: string;
};

type ApplicationTimelineItem = {
  action: string;
  employer: string;
  id: string;
  role: string;
  status: 'Interview' | 'In progress' | 'Needs input' | 'Not moving forward' | 'Offer' | 'Submitted';
  summary: string;
  updatedAt: string;
};

type InterviewPrepItem = {
  company: string;
  focus: string;
  productPrep: string[];
  questions: string[];
  researchHref?: string;
  resumeHref?: string;
  role: string;
  stages: string[];
  starStories: string[];
};

type CompanionData = {
  actionToken: string;
  actionTokenExpiresAt: string;
  applicationsNeedingAttention: ApplicationTimelineItem[];
  collections: Record<CollectionKey, RoleCard[]>;
  generatedAt: string;
  interviewPrep: InterviewPrepItem[];
  ownerEmail: string;
  preferences: Array<{ label: string; value: string }>;
  recruiterResponses: number;
  resumeReady: boolean;
  roleCount: number;
  roles: RoleCard[];
  submittedCount: number;
  timeline: ApplicationTimelineItem[];
  topRoles: RoleCard[];
};

export default async function GuidedCareerOsPage() {
  const data = await getCompanionData();
  const topRole = data.topRoles[0];
  const briefing = topRole
    ? `${topRole.employer} is the strongest match right now. The role fits your product leadership profile, and Career OS has ${data.applicationsNeedingAttention.length ? `${data.applicationsNeedingAttention.length} item${data.applicationsNeedingAttention.length === 1 ? '' : 's'} for you to clear before the next wave.` : 'no action it needs from you at the moment.'}`
    : 'Career OS is watching the market and will surface the strongest persisted matches here as soon as they are available.';

  return (
    <main className="career-companion">
      <header className="career-companion-nav" aria-label="Career OS navigation">
        <a className="career-companion-brand" href="/career-os">AnswerBrief AI Career OS</a>
        <nav>
          <a href="#top-matches">Top Matches</a>
          <a href="#applications">Applications</a>
          <a href="#interview-center">Interview Center</a>
          <a href="#preferences">Preferences</a>
          <a href="/career-os/admin">Admin</a>
        </nav>
      </header>

      <section className="career-companion-hero" aria-labelledby="career-os-title">
        <div className="career-companion-hero-copy">
          <p className="career-companion-eyebrow">Personal career companion</p>
          <h1 id="career-os-title">Good morning, Tomas. Here is where to focus.</h1>
          <p className="career-companion-lead">{briefing}</p>
          <div className="career-companion-cta-row">
            <a className="button primary" href="#top-matches">Review Top Matches</a>
            <a className="button secondary" href="#applications">Check Applications</a>
          </div>
        </div>
        <aside className="career-companion-briefing" aria-label="Today at a glance">
          <h2>Today at a glance</h2>
          <SummaryLine label="Strongest opportunities" value={String(data.topRoles.length)} />
          <SummaryLine label="Need your attention" value={String(data.applicationsNeedingAttention.length)} />
          <SummaryLine label="Submitted" value={String(data.submittedCount)} />
          <SummaryLine label="Recruiter responses" value={String(data.recruiterResponses)} />
        </aside>
      </section>

      <section className="career-companion-section" aria-labelledby="guidance-title">
        <div className="career-companion-section-header">
          <p className="career-companion-eyebrow">AI briefing</p>
          <h2 id="guidance-title">High-value next actions</h2>
          <p>Career OS is suppressing duplicate and low-signal clutter so you can spend time only where the match, compensation, company quality, and readiness signals justify it.</p>
        </div>
        <div className="career-companion-guidance-grid">
          <GuidanceCard title="Strongest opportunities" body={topRole ? `Start with ${topRole.employer}. ${topRole.aiRecommendation}` : 'No high-confidence role is ready for review yet.'} href="#top-matches" />
          <GuidanceCard title="Applications needing attention" body={data.applicationsNeedingAttention[0] ? `${data.applicationsNeedingAttention[0].employer}: ${data.applicationsNeedingAttention[0].action}` : 'Nothing needs your input right now.'} href="#applications" />
          <GuidanceCard title="Interview preparation" body={data.interviewPrep[0] ? `Prepare the ${data.interviewPrep[0].company} story bank and product-sense notes first.` : 'Interview prep will focus on the strongest target companies until an interview is scheduled.'} href="#interview-center" />
          <GuidanceCard title="Recruiter responses" body={data.recruiterResponses ? `${data.recruiterResponses} response${data.recruiterResponses === 1 ? '' : 's'} are saved in Career OS.` : 'No saved recruiter response requires action right now.'} href="#applications" />
        </div>
      </section>

      <section className="career-companion-section" id="preferences" aria-labelledby="preferences-title">
        <div className="career-companion-section-header">
          <p className="career-companion-eyebrow">Preference-based matching</p>
          <h2 id="preferences-title">What Career OS is optimizing for</h2>
          <p>These signals come from saved profile data and the current retained role set. They shape ranking, recommendations, and what stays hidden.</p>
        </div>
        <div className="career-companion-preferences" aria-label="Saved matching preferences">
          {data.preferences.map((preference) => (
            <div className="career-companion-preference" key={preference.label}>
              <span>{preference.label}</span>
              <strong>{preference.value}</strong>
            </div>
          ))}
        </div>
      </section>

      <section className="career-companion-section" id="top-matches" aria-labelledby="matches-title">
        <div className="career-companion-section-header">
          <p className="career-companion-eyebrow">Curated opportunities</p>
          <h2 id="matches-title">Top matches, not every posting</h2>
          <p>{data.roleCount ? `${data.roleCount} high-signal role${data.roleCount === 1 ? '' : 's'} made the cut after quality, fit, compensation, and duplicate filters.` : 'No high-signal roles are ready to show yet.'}</p>
        </div>
        <CollectionTabs collections={data.collections} />
        <CollectionShowcase collections={data.collections} />
        <div className="career-companion-role-list">
          {data.topRoles.length ? data.topRoles.map((role) => (
            <RoleCardView
              actionToken={data.actionToken}
              actionTokenExpiresAt={data.actionTokenExpiresAt}
              key={role.id}
              role={role}
            />
          )) : <EmptyState title="No curated roles yet" body="Career OS has not saved a role that clears the quality bar for this view." />}
        </div>
      </section>

      <section className="career-companion-section" id="applications" aria-labelledby="applications-title">
        <div className="career-companion-section-header">
          <p className="career-companion-eyebrow">Applications</p>
          <h2 id="applications-title">A clear timeline of what happened</h2>
          <p>Each item explains the current state and the next human action, without exposing internal run details.</p>
        </div>
        <div className="career-companion-timeline">
          {data.timeline.length ? data.timeline.map((item) => (
            <article className="career-companion-timeline-item" key={item.id}>
              <div>
                <span className="career-companion-status">{item.status}</span>
                <h3>{item.employer} · {item.role}</h3>
                <p>{item.summary}</p>
                <strong>{item.action}</strong>
              </div>
              <time dateTime={item.updatedAt}>{formatDate(item.updatedAt)}</time>
            </article>
          )) : <EmptyState title="No application activity yet" body="Applications will appear here after Career OS saves a real application record." />}
        </div>
      </section>

      <section className="career-companion-section" id="interview-center" aria-labelledby="interview-title">
        <div className="career-companion-section-header">
          <p className="career-companion-eyebrow">Interview Center</p>
          <h2 id="interview-title">Prepare before the invitation arrives</h2>
          <p>Company-specific preparation is built from saved roles, application state, and approved career evidence.</p>
        </div>
        <div className="career-companion-interview-grid">
          {data.interviewPrep.length ? data.interviewPrep.map((prep) => (
            <article className="career-companion-interview-card" key={`${prep.company}:${prep.role}`}>
              <span>{prep.company}</span>
              <h3>{prep.role}</h3>
              <p>{prep.focus}</p>
              <section>
                <h4>Expected stages</h4>
                <ul>
                  {prep.stages.map((stage) => <li key={stage}>{stage}</li>)}
                </ul>
              </section>
              <section>
                <h4>Likely questions</h4>
                <ul>
                  {prep.questions.map((question) => <li key={question}>{question}</li>)}
                </ul>
              </section>
              <section>
                <h4>STAR stories</h4>
                <ul>
                  {prep.starStories.map((story) => <li key={story}>{story}</li>)}
                </ul>
              </section>
              <section>
                <h4>Product sense and analytical prep</h4>
                <ul>
                  {prep.productPrep.map((item) => <li key={item}>{item}</li>)}
                </ul>
              </section>
              <section>
                <h4>Preparation checklist</h4>
                <ul>
                  <li>Choose two STAR stories tied to product leadership and cross-functional delivery.</li>
                  <li>Prepare one product-sense case around customer pain, prioritization, and measurable impact.</li>
                  <li>Review compensation, work model, and company context before responding.</li>
                </ul>
              </section>
              <div className="career-companion-card-actions">
                {prep.resumeHref ? <a className="button secondary" href={prep.resumeHref}>Open Resume</a> : null}
                {prep.researchHref ? <a className="button secondary" href={prep.researchHref}>Company Research</a> : null}
              </div>
              <label className="career-companion-notes">
                <span>Notes</span>
                <textarea aria-label={`${prep.company} interview notes`} rows={4} />
              </label>
            </article>
          )) : <EmptyState title="No interview prep queued" body="Interview preparation will appear after Career OS has a saved role or application with enough evidence to prepare from." />}
        </div>
      </section>
    </main>
  );
}

function SummaryLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="career-companion-summary-line">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function GuidanceCard({ body, href, title }: { body: string; href: string; title: string }) {
  return (
    <a className="career-companion-guidance-card" href={href}>
      <h3>{title}</h3>
      <p>{body}</p>
    </a>
  );
}

function CollectionTabs({ collections }: { collections: Record<CollectionKey, RoleCard[]> }) {
  return (
    <div className="career-companion-collections" aria-label="Curated role collections">
      {collectionLabels.map(([key, label]) => (
        <a href={`#collection-${key}`} key={key}>
          <span>{label}</span>
          <strong>{collections[key].length}</strong>
        </a>
      ))}
    </div>
  );
}

function CollectionShowcase({ collections }: { collections: Record<CollectionKey, RoleCard[]> }) {
  return (
    <div className="career-companion-collection-showcase">
      {collectionLabels.map(([key, label]) => (
        <section id={`collection-${key}`} key={key}>
          <h3>{label}</h3>
          {collections[key].length ? (
            <ul>
              {collections[key].slice(0, 3).map((role) => (
                <li key={`${key}:${role.id}`}>
                  <strong>{role.employer}</strong>
                  <span>{role.title}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p>No saved role currently qualifies for this collection.</p>
          )}
        </section>
      ))}
    </div>
  );
}

const collectionLabels = [
  ['best', 'Best Matches'],
  ['new', 'Newly Posted'],
  ['ai', 'AI Leadership'],
  ['compensation', 'High Compensation'],
] as const;

function RoleCardView({
  actionToken,
  actionTokenExpiresAt,
  role,
}: {
  actionToken: string;
  actionTokenExpiresAt: string;
  role: RoleCard;
}) {
  return (
    <article className="career-companion-role-card">
      <div className="career-companion-role-main">
        <div className="career-companion-role-heading">
          <div>
            <span>{role.employer}</span>
            <h3>{role.title}</h3>
          </div>
          <strong aria-label={role.fitScore ? `${role.fitScore}% match` : 'New match'}>{role.fitScore || 'New'}{role.fitScore ? '%' : ''}</strong>
        </div>
        <div className="career-companion-role-meta">
          <span>{role.status}</span>
          <span>{role.location}</span>
          <span>{role.workModel}</span>
          <span>{role.compensation}</span>
          <span>{role.freshness}</span>
        </div>
        <section>
          <h4>Why this fits Tomas</h4>
          <ul>
            {role.whyFit.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </section>
        <section>
          <h4>Key gaps to watch</h4>
          <ul>
            {role.gaps.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </section>
      </div>
      <aside className="career-companion-role-side">
        <section>
          <h4>AI recommendation</h4>
          <p>{role.aiRecommendation}</p>
        </section>
        <section>
          <h4>Compensation context</h4>
          <p>{role.compensationConfidence}</p>
        </section>
        <section>
          <h4>Readiness</h4>
          <p>{role.readiness}</p>
        </section>
        <section>
          <h4>Company intelligence</h4>
          <p>{role.companyContext}</p>
          {role.companySignals.length ? (
            <ul>
              {role.companySignals.map((signal) => <li key={signal}>{signal}</li>)}
            </ul>
          ) : null}
        </section>
        <section>
          <h4>Preference match</h4>
          <div className="career-companion-chip-row">
            {role.preferenceMatches.map((match) => <span key={match}>{match}</span>)}
          </div>
        </section>
        <OpportunityActionControl
          actionToken={actionToken}
          actionTokenExpiresAt={actionTokenExpiresAt}
          employer={role.employer}
          opportunityId={role.id}
          title={role.title}
        />
      </aside>
    </article>
  );
}

function EmptyState({ body, title }: { body: string; title: string }) {
  return (
    <div className="career-companion-empty">
      <h3>{title}</h3>
      <p>{body}</p>
    </div>
  );
}

async function getCompanionData(): Promise<CompanionData> {
  const ownerEmail = String(process.env.CAREER_OS_OWNER_EMAIL || 'tomas@nieves.com').trim().replace(/^"|"$/g, '');
  const [profiles, dailyReports, jobPostings, applications, artifacts, workflowEvents, employers] = await Promise.all([
    safeSelect('career_os_profiles', `select=*&owner_email=eq.${encodeURIComponent(ownerEmail)}&limit=1`),
    safeSelect('career_os_daily_operating_reports', `select=*&owner_email=eq.${encodeURIComponent(ownerEmail)}&order=generated_at.desc&limit=1`),
    safeSelect('career_os_job_postings', `select=*&owner_email=eq.${encodeURIComponent(ownerEmail)}&order=fit_score.desc.nullslast,last_checked_at.desc&limit=80`),
    safeSelect('career_os_applications', `select=*&owner_email=eq.${encodeURIComponent(ownerEmail)}&order=updated_at.desc&limit=80`),
    safeSelect('career_os_artifacts', `select=*&owner_email=eq.${encodeURIComponent(ownerEmail)}&order=created_at.desc&limit=80`),
    safeSelect('career_os_employer_workflow_events', `select=*&owner_email=eq.${encodeURIComponent(ownerEmail)}&order=occurred_at.desc&limit=80`),
    safeSelect('career_os_employers', `select=*&owner_email=eq.${encodeURIComponent(ownerEmail)}&order=updated_at.desc&limit=40`),
  ]);

  const dailyReport = dailyReports[0] || {};
  const payload = asRecord(dailyReport.payload);
  const release = asRecord(payload.release_progress_20260719);
  const cycle = asRecord(payload.daily_operating_cycle);
  const pipelineHealth = asRecord(cycle.pipelineHealth);
  const marketCoverage = asRecord(cycle.marketCoverage);
  const profile = profiles[0] || {};
  const roles = buildRoleCards(jobPostings, employers);
  const topRoles = roles.slice(0, 6);
  const timeline = buildApplicationTimeline(applications, workflowEvents);
  const applicationsNeedingAttention = timeline.filter((item) => item.status === 'Needs input').slice(0, 4);
  const actionTokenExpiresAt = new Date(Date.now() + (60 * 60 * 1000)).toISOString();
  const actionToken = createCareerOsActionToken({
    action: 'career_os_companion_page',
    expiresAt: actionTokenExpiresAt,
    ownerEmail,
  });

  return {
    actionToken,
    actionTokenExpiresAt,
    applicationsNeedingAttention,
    collections: buildCollections(roles),
    generatedAt: String(dailyReport.generated_at || new Date().toISOString()),
    interviewPrep: buildInterviewPrep(topRoles, applications, artifacts),
    ownerEmail,
    preferences: buildPreferences(profile, roles),
    recruiterResponses: firstPositiveNumber(pipelineHealth.recruiterResponses, release.recruiter_responses),
    resumeReady: firstPositiveNumber(release.total_package_assets, pipelineHealth.packageAssets, artifacts.length) > 0,
    roleCount: roles.length || firstPositiveNumber(release.active_qualified_opportunities, marketCoverage.qualifiedMatches),
    roles,
    submittedCount: firstPositiveNumber(release.submitted_applications, pipelineHealth.totalSubmitted, timeline.filter((item) => item.status === 'Submitted').length),
    timeline,
    topRoles,
  };
}

async function safeSelect(table: string, query: string): Promise<JsonRecord[]> {
  try {
    return await careerOsSelectRows(table, query);
  } catch {
    return [];
  }
}

function buildRoleCards(jobPostings: JsonRecord[], employers: JsonRecord[]): RoleCard[] {
  const employerByName = new Map(employers.map((employer) => [compactKey(employer.canonical_name || employer.name || employer.employer), employer]));
  const deduped = new Map<string, RoleCard>();

  for (const record of jobPostings) {
    if (!isVisibleRole(record)) continue;
    const raw = asRecord(record.raw_record);
    const employer = clean(record.company || record.employer || raw.company || raw.employer) || 'Company not saved';
    const title = clean(record.title || raw.title || record.position) || 'Role not saved';
    const key = compactKey(`${employer}:${title}:${record.external_requisition_id || record.canonical_url || record.id}`);
    if (deduped.has(key)) continue;

    const employerInfo = employerByName.get(compactKey(employer)) || {};
    const fitScore = numberValue(record.fit_score || record.match_score);
    const text = roleText(record);
    const compensation = compensationText(record);
    const companySignals = companySignalList(employerInfo, record);
    const card: RoleCard = {
      aiRecommendation: recommendationFor(record, fitScore),
      canonicalUrl: clean(record.canonical_url || raw.canonical_url || raw.apply_url),
      collectionKeys: [],
      companyContext: companyContext(employerInfo, record),
      companySignals,
      compensation,
      compensationConfidence: compensationConfidence(record),
      employer,
      fitScore,
      freshness: freshnessText(record.last_checked_at || record.created_at || record.updated_at),
      gaps: roleGaps(record, employerInfo),
      id: clean(record.id || key),
      location: clean(record.location || raw.location) || 'Location not listed',
      preferenceMatches: preferenceMatches(record),
      readiness: readinessFor(record, fitScore),
      requisitionId: clean(record.external_requisition_id || raw.requisition_id || raw.job_id),
      status: statusFor(record, fitScore),
      title,
      whyFit: whyFits(text),
      workModel: clean(record.work_arrangement || raw.work_arrangement) || inferWorkModel(text),
    };
    card.collectionKeys = collectionKeysFor(card, record);
    deduped.set(key, card);
  }

  return Array.from(deduped.values())
    .filter((role) => role.fitScore >= 65 || role.collectionKeys.includes('compensation'))
    .sort((left, right) => right.fitScore - left.fitScore || right.collectionKeys.length - left.collectionKeys.length)
    .slice(0, 18);
}

function buildCollections(roles: RoleCard[]): Record<CollectionKey, RoleCard[]> {
  return {
    ai: roles.filter((role) => role.collectionKeys.includes('ai')).slice(0, 6),
    best: roles.filter((role) => role.collectionKeys.includes('best')).slice(0, 6),
    compensation: roles.filter((role) => role.collectionKeys.includes('compensation')).slice(0, 6),
    new: roles.filter((role) => role.collectionKeys.includes('new')).slice(0, 6),
  };
}

function buildApplicationTimeline(applications: JsonRecord[], workflowEvents: JsonRecord[]): ApplicationTimelineItem[] {
  return applications.slice(0, 12).map((application) => {
    const text = `${application.lifecycle_stage || ''} ${application.next_action || ''} ${JSON.stringify(application.raw_record || {})}`.toLowerCase();
    const latestEvent = workflowEvents.find((event) => clean(event.application_id) === clean(application.id));
    const status = applicationStatus(text, application);
    return {
      action: actionForStatus(status, application, text),
      employer: clean(application.employer || asRecord(application.raw_record).company) || 'Employer not saved',
      id: clean(application.id || `${application.employer}:${application.position}`),
      role: clean(application.position || application.title || asRecord(application.raw_record).title) || 'Role not saved',
      status,
      summary: summaryForStatus(status, application, latestEvent, text),
      updatedAt: clean(application.updated_at || latestEvent?.occurred_at || new Date().toISOString()),
    };
  });
}

function buildInterviewPrep(topRoles: RoleCard[], applications: JsonRecord[], artifacts: JsonRecord[]): InterviewPrepItem[] {
  const interviewApps = applications.filter((application) => {
    const text = `${application.lifecycle_stage || ''} ${application.next_action || ''} ${JSON.stringify(application.raw_record || {})}`.toLowerCase();
    return text.includes('interview');
  });
  const sourceRoles = interviewApps.length
    ? interviewApps.map((application) => ({
      company: clean(application.employer),
      role: clean(application.position || application.title),
      url: clean(asRecord(application.raw_record).canonical_url || asRecord(application.raw_record).application_url),
    }))
    : topRoles.slice(0, 3).map((role) => ({ company: role.employer, role: role.title, url: role.canonicalUrl }));
  const resume = artifacts.find((artifact) => textIncludes(artifact.artifact_type, ['resume']));

  return sourceRoles.slice(0, 3).map((item) => ({
    company: item.company || 'Target company',
    focus: `Prepare a concise story for why ${item.company || 'this company'} should trust Tomas to lead ${productFocus(item.role)}.`,
    questions: [
      `How would you prioritize the first 90 days for ${item.role || 'this role'}?`,
      'Which customer or stakeholder signal would you use to decide what to build next?',
      'Tell me about a time you aligned business, product, and technical teams under pressure.',
    ],
    productPrep: [
      'Define the customer problem, the measurable outcome, and the first tradeoff you would test.',
      'Prepare one prioritization example that balances growth, risk, technical effort, and customer value.',
      'Bring a metric tree for activation, retention, or workflow efficiency depending on the company context.',
    ],
    researchHref: item.url || undefined,
    resumeHref: clean(resume?.public_url || resume?.artifact_url || resume?.storage_url) || undefined,
    role: item.role || 'Target role',
    stages: ['Recruiter screen', 'Hiring manager conversation', 'Product leadership panel', 'Case or product-sense discussion'],
    starStories: [
      'A product decision where Tomas aligned business, product, and technical partners.',
      'A transformation or automation story with a clear before, action, and measurable after.',
      'A customer-experience story showing how feedback became prioritization and execution.',
    ],
  }));
}

function buildPreferences(profile: JsonRecord, roles: RoleCard[]) {
  const verified = asRecord(profile.verified_profile);
  const strategy = asRecord(verified.career_strategy || verified.strategy || profile.strategy);
  const compensation = asRecord(strategy.compensation_strategy || verified.compensation_strategy);
  const topLocations = Array.from(new Set(roles.map((role) => role.location).filter((value) => value && value !== 'Location not listed'))).slice(0, 2);
  const hasAi = roles.some((role) => role.collectionKeys.includes('ai'));

  return [
    { label: 'Title', value: clean(strategy.target_title || verified.target_title) || 'Product leadership roles' },
    { label: 'Seniority', value: clean(strategy.seniority || verified.seniority) || 'Director and senior leadership' },
    { label: 'Location', value: clean(strategy.location_preference || verified.location_preference) || (topLocations.join(' / ') || 'Saved location preference not found') },
    { label: 'Compensation', value: compensation.preferred_minimum_base_salary_usd ? `${formatMoney(numberValue(compensation.preferred_minimum_base_salary_usd))}+ base preferred` : 'Compensation floor applied when available' },
    { label: 'Industry', value: clean(strategy.industry_preference || verified.industry_preference) || (hasAi ? 'AI, platforms, and transformation' : 'High-fit saved industries') },
    { label: 'Work model', value: clean(strategy.work_model || verified.work_model) || 'Remote and hybrid prioritized when saved' },
  ];
}

function isVisibleRole(record: JsonRecord) {
  const raw = asRecord(record.raw_record);
  const decision = clean(raw.review_decision).toLowerCase();
  const status = `${record.status || ''} ${record.posting_validation_status || ''}`.toLowerCase();
  if (['skip', 'reject_similar', 'hide'].includes(decision)) return false;
  if (status.includes('inactive') || status.includes('closed') || status.includes('expired')) return false;
  if (status.includes('ineligible')) return false;
  return clean(record.company || record.employer) && clean(record.title || record.position);
}

function roleText(record: JsonRecord) {
  const raw = asRecord(record.raw_record);
  return [
    record.title,
    record.normalized_description,
    record.description,
    record.qualification_reason,
    raw.title,
    raw.description,
    raw.normalized_description,
  ].map(clean).join(' ').toLowerCase();
}

function whyFits(text: string) {
  const reasons: string[] = [];
  if (hasAny(text, ['director', 'senior director', 'group product'])) reasons.push('The role sits in the saved senior product leadership band.');
  if (hasAny(text, ['product management', 'product manager', 'roadmap'])) reasons.push('Product strategy and roadmap ownership are visible in the posting.');
  if (hasAny(text, ['platform', 'enterprise', 'api'])) reasons.push("Enterprise platform depth maps well to Tomas's background.");
  if (hasAny(text, ['ai', 'automation', 'machine learning'])) reasons.push('AI or automation signals make this worth prioritizing.');
  if (hasAny(text, ['customer experience', 'customer journey', 'cx'])) reasons.push('Customer-experience ownership is a strong transferable signal.');
  if (hasAny(text, ['transformation', 'modernization'])) reasons.push('Transformation work appears central to the role.');
  return reasons.slice(0, 3).length ? reasons.slice(0, 3) : ['Career OS retained this role because the saved evidence clears the fit and quality threshold.'];
}

function roleGaps(record: JsonRecord, employerInfo: JsonRecord) {
  const gaps: string[] = [];
  const text = roleText(record);
  if (!record.compensation_text && !record.compensation_max_usd) gaps.push('Compensation is not fully posted.');
  if (!record.location) gaps.push('Location or travel expectations need confirmation.');
  if (hasAny(text, ['hands-on coding', 'deep technical', 'principal engineer'])) gaps.push('Technical depth may be heavier than the ideal product-leadership mix.');
  if (!companySignalList(employerInfo, record).length) gaps.push('Company quality notes are not saved yet.');
  return gaps.length ? gaps.slice(0, 3) : ['No major gap is visible in the saved posting evidence.'];
}

function companyContext(employerInfo: JsonRecord, record: JsonRecord) {
  const signals = companySignalList(employerInfo, record);
  if (signals[0]) return signals[0];
  if (record.posting_validation_status === 'active') return 'The posting is saved as active; no extra company research note is saved yet.';
  return 'No saved company intelligence beyond the posting is available yet.';
}

function companySignalList(employerInfo: JsonRecord, record: JsonRecord) {
  const raw = asRecord(record.raw_record);
  return [
    labeledSignal('Funding', employerInfo.funding_stage || raw.funding_stage),
    labeledSignal('Growth', employerInfo.growth_context || employerInfo.growth_signal || raw.growth_signal),
    labeledSignal('Stability', employerInfo.stability_signal || employerInfo.layoff_signal || raw.stability_signal),
    labeledSignal('Rating', employerInfo.rating || employerInfo.company_rating || raw.company_rating),
    clean(employerInfo.notes || employerInfo.company_notes || raw.company_notes),
  ].filter(Boolean).slice(0, 4);
}

function compensationText(record: JsonRecord) {
  const text = clean(record.compensation_text);
  const min = numberValue(record.compensation_min_usd);
  const max = numberValue(record.compensation_max_usd);
  if (min && max) return `${formatMoney(min)}-${formatMoney(max)}`;
  if (max) return `Up to ${formatMoney(max)}`;
  if (text) return text;
  return 'Compensation not posted';
}

function compensationConfidence(record: JsonRecord) {
  const min = numberValue(record.compensation_min_usd);
  const max = numberValue(record.compensation_max_usd);
  if (min && max) return 'High confidence: a saved salary range is attached to this posting.';
  if (record.compensation_text) return 'Medium confidence: compensation text is saved, but the range needs review.';
  return 'Low confidence: no compensation range is saved yet.';
}

function collectionKeysFor(role: RoleCard, record: JsonRecord): CollectionKey[] {
  const keys: CollectionKey[] = [];
  const text = roleText(record);
  if (role.fitScore >= 85) keys.push('best');
  if (daysSince(record.created_at || record.last_checked_at || record.updated_at) <= 14) keys.push('new');
  if (hasAny(text, ['ai', 'automation', 'machine learning', 'platform'])) keys.push('ai');
  if (numberValue(record.compensation_max_usd) >= 220000 || hasAny(clean(record.compensation_text).toLowerCase(), ['equity', 'bonus', 'total compensation'])) keys.push('compensation');
  return keys.length ? keys : ['best'];
}

function recommendationFor(record: JsonRecord, fitScore: number) {
  if (fitScore >= 90 && (record.compensation_text || record.compensation_max_usd)) return 'Apply after confirming the latest resume package is attached.';
  if (fitScore >= 85) return 'Strong match. Tailor the resume and keep this near the top of the queue.';
  if (!record.compensation_text && !record.compensation_max_usd) return 'Watch until compensation is clearer, unless the company context is compelling.';
  return 'Save for review after the higher-signal roles are handled.';
}

function readinessFor(record: JsonRecord, fitScore: number) {
  const hasCompensation = Boolean(record.compensation_text || record.compensation_max_usd);
  const hasUrl = Boolean(clean(record.canonical_url || asRecord(record.raw_record).canonical_url || asRecord(record.raw_record).apply_url));
  if (fitScore >= 90 && hasCompensation && hasUrl) return 'Ready to apply after a final resume fit check.';
  if (fitScore >= 85 && hasUrl) return 'Ready for resume tailoring before applying.';
  if (!hasCompensation) return 'Watch or save until compensation is clearer.';
  return 'Good review candidate after higher-confidence matches are handled.';
}

function statusFor(record: JsonRecord, fitScore: number) {
  const raw = asRecord(record.raw_record);
  const decision = clean(raw.review_decision);
  if (decision === 'save') return 'Saved';
  if (decision === 'watch') return 'Watching';
  if (decision === 'tailor') return 'Tailoring';
  if (fitScore >= 90) return 'Best match';
  if (fitScore >= 85) return 'Strong match';
  return 'Review later';
}

function preferenceMatches(record: JsonRecord) {
  const matches: string[] = [];
  const text = roleText(record);
  if (hasAny(text, ['product'])) matches.push('Title');
  if (hasAny(text, ['director', 'senior', 'group'])) matches.push('Seniority');
  if (record.location || hasAny(text, ['remote', 'hybrid', 'texas', 'dallas'])) matches.push('Location');
  if (record.compensation_text || record.compensation_max_usd) matches.push('Compensation');
  if (hasAny(text, ['ai', 'platform', 'enterprise', 'customer', 'transformation'])) matches.push('Industry');
  if (record.work_arrangement || hasAny(text, ['remote', 'hybrid'])) matches.push('Work model');
  return matches.length ? matches : ['Saved fit'];
}

function applicationStatus(text: string, application: JsonRecord): ApplicationTimelineItem['status'] {
  if (hasAny(text, ['offer'])) return 'Offer';
  if (hasAny(text, ['interview'])) return 'Interview';
  if (application.confirmation_number || application.submission_evidence || hasAny(text, ['submitted', 'confirmed'])) return 'Submitted';
  if (hasAny(text, ['reject', 'not moving forward', 'declined'])) return 'Not moving forward';
  if (hasAny(text, ['human', 'tomas', 'account', 'legal', 'privacy', 'compensation', 'missing', 'verification'])) return 'Needs input';
  return 'In progress';
}

function summaryForStatus(
  status: ApplicationTimelineItem['status'],
  application: JsonRecord,
  latestEvent: JsonRecord | undefined,
  text: string,
) {
  if (status === 'Submitted') return 'Career OS saved a confirmed submission for this application.';
  if (status === 'Interview') return 'An interview or interview follow-up is saved for this application.';
  if (status === 'Needs input') return needsInputSummary(text);
  if (status === 'Not moving forward') return 'The employer outcome is saved, and no response is needed.';
  if (status === 'Offer') return 'An offer-stage item is saved and ready for compensation and scope review.';
  const savedSummary = sanitizeCandidateText(clean(latestEvent?.evidence_text || application.lifecycle_stage));
  return savedSummary || 'Career OS saved this application as in progress.';
}

function actionForStatus(status: ApplicationTimelineItem['status'], application: JsonRecord, text: string) {
  if (status === 'Submitted') return 'No action required unless the employer replies.';
  if (status === 'Interview') return 'Prepare company notes, STAR stories, and product-sense examples.';
  if (status === 'Needs input') return needsInputAction(text, application);
  if (status === 'Not moving forward') return 'No action required. Career OS will use this outcome to improve targeting.';
  if (status === 'Offer') return 'Review compensation, scope, and timing before responding.';
  return 'Career OS is continuing the application path when it is safe.';
}

function needsInputSummary(text: string) {
  if (hasAny(text, ['captcha', 'verification', 'code', 'otp'])) {
    return 'The employer needs a verification step from Tomas before Career OS can continue.';
  }
  if (hasAny(text, ['account', 'sign in', 'signin', 'login', 'password', 'email'])) {
    return 'The employer account step needs Tomas before Career OS can continue.';
  }
  if (hasAny(text, ['legal', 'privacy', 'consent', 'authorize', 'approval'])) {
    return 'The employer needs a legal or factual approval from Tomas before Career OS can continue.';
  }
  if (hasAny(text, ['missing', 'compensation', 'salary', 'employment', 'fact'])) {
    return 'Career OS needs one saved answer from Tomas before it can continue this application.';
  }
  return 'This application is paused at a Tomas-only checkpoint.';
}

function needsInputAction(text: string, application: JsonRecord) {
  const savedAction = sanitizeCandidateText(clean(application.next_action));
  if (hasAny(text, ['captcha', 'verification', 'code', 'otp'])) return 'Complete the employer verification step, then let Career OS continue.';
  if (hasAny(text, ['account', 'sign in', 'signin', 'login', 'password', 'email'])) return 'Complete or confirm the employer account step.';
  if (hasAny(text, ['legal', 'privacy', 'consent', 'authorize', 'approval'])) return 'Review the approval language before Career OS proceeds.';
  if (hasAny(text, ['missing', 'compensation', 'salary', 'employment', 'fact'])) return savedAction || 'Add the requested answer so Career OS can continue.';
  return savedAction || 'Review the saved employer request.';
}

function sanitizeCandidateText(value: string) {
  return value
    .replace(/browser-worker/gi, 'Career OS')
    .replace(/browser worker/gi, 'Career OS')
    .replace(/authorized email sign-in path/gi, 'employer account step')
    .replace(/technical browser blocker/gi, 'saved pause')
    .replace(/technical blocker/gi, 'saved pause')
    .replace(/stopped instead of looping/gi, 'paused safely')
    .replace(/looping/gi, 'repeating')
    .replace(/pipeline/gi, 'career workflow')
    .replace(/raw record/gi, 'saved record')
    .replace(/automation/gi, 'Career OS');
}

function inferWorkModel(value: string) {
  if (value.includes('remote')) return 'Remote signal';
  if (value.includes('hybrid')) return 'Hybrid signal';
  if (value.includes('onsite') || value.includes('on-site')) return 'On-site signal';
  return 'Work model not listed';
}

function productFocus(role: string) {
  const text = role.toLowerCase();
  if (text.includes('ai')) return 'AI product strategy';
  if (text.includes('platform')) return 'platform product execution';
  if (text.includes('customer') || text.includes('cx')) return 'customer experience outcomes';
  return 'product leadership outcomes';
}

function labeledSignal(label: string, value: unknown) {
  const cleaned = clean(value);
  return cleaned ? `${label}: ${cleaned}` : '';
}

function textIncludes(value: unknown, terms: string[]) {
  const text = clean(value).toLowerCase();
  return terms.some((term) => text.includes(term));
}

function hasAny(value: string, terms: string[]) {
  return terms.some((term) => value.includes(term));
}

function daysSince(value: unknown) {
  const date = Date.parse(clean(value));
  if (!date) return Number.MAX_SAFE_INTEGER;
  return Math.max(0, Math.floor((Date.now() - date) / 86400000));
}

function freshnessText(value: unknown) {
  const days = daysSince(value);
  if (days === Number.MAX_SAFE_INTEGER) return 'Freshness not saved';
  if (days === 0) return 'Updated today';
  if (days === 1) return 'Updated yesterday';
  if (days <= 14) return `Updated ${days} days ago`;
  return `Last checked ${days} days ago`;
}

function formatDate(value: unknown) {
  const date = Date.parse(clean(value));
  if (!date) return 'Date not saved';
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(date));
}

function formatMoney(value: number) {
  if (!value) return '$0';
  return `$${Math.round(value / 1000)}K`;
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}

function clean(value: unknown) {
  return String(value || '').trim();
}

function compactKey(value: unknown) {
  return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function firstPositiveNumber(...values: unknown[]) {
  for (const value of values) {
    const number = numberValue(value);
    if (number > 0) return number;
  }
  return 0;
}

function numberValue(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}
