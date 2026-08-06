import type { Metadata } from 'next';
import styles from './tomas.module.css';

const CANONICAL_URL = 'https://tomasnieves.com';
const PAGE_TITLE = 'Tomas Nieves — Senior Product Manager, Enterprise Product Strategy';
const PAGE_DESCRIPTION =
  'Senior Product Manager with nearly 30 years of enterprise product leadership at Verizon, targeting Director and Senior Director Product Management roles in digital transformation, customer experience, and AI-enabled product organizations.';

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  alternates: {
    canonical: CANONICAL_URL,
  },
  openGraph: {
    title: PAGE_TITLE,
    description: PAGE_DESCRIPTION,
    url: CANONICAL_URL,
    siteName: 'Tomas Nieves',
    type: 'profile',
    firstName: 'Tomas',
    lastName: 'Nieves',
  },
  twitter: {
    card: 'summary_large_image',
    title: PAGE_TITLE,
    description: PAGE_DESCRIPTION,
  },
};

const personJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Person',
  name: 'Tomas Nieves',
  jobTitle: 'Senior Product Manager',
  url: CANONICAL_URL,
  email: 'mailto:tomas@nieves.com',
  sameAs: ['https://www.linkedin.com/in/tomas-nieves-843053171/'],
  alumniOf: {
    '@type': 'CollegeOrUniversity',
    name: 'University of Puerto Rico',
  },
  knowsAbout: [
    'Enterprise Product Strategy',
    'Digital Product Transformation',
    'Customer Experience Modernization',
    'Product Roadmap Development',
    'Cross-Functional Leadership',
  ],
  description: PAGE_DESCRIPTION,
};

const highlights = [
  'Nearly 30 years of enterprise product ownership at a Fortune 15 company, across four distinct platforms and roles.',
  'Product responsibility spanning consumer digital experiences, self-service and assistant technology, and enterprise operational platforms.',
  'Cross-functional delivery experience working alongside legal, UX, engineering, and QA on regulated, high-traffic consumer products.',
  'Deliberate, verified investment in AI fluency this year — five completed certifications, applied directly to how he now works.',
];

const roles = [
  {
    title: 'Senior Product Owner / Product Manager',
    period: '1996 – 2026',
    note: 'Most recent focus: Verizon’s View Together initiative.',
  },
  { title: 'Product Owner, Verizon Assistant', period: null },
  { title: 'Product Owner, Verizon.com Email Platform', period: null },
  { title: 'Product Manager, Consumer and Small Business Solutions', period: null },
];

const skills = [
  'Enterprise Product Strategy',
  'Digital Product Transformation',
  'Customer Experience Modernization',
  'Executive Stakeholder Alignment',
  'Product Roadmap Development',
  'Portfolio Prioritization',
  'Cross-Functional Leadership',
  'Governance and Compliance Alignment',
  'Agile Product Delivery',
  'Product Operations',
  'Data-Informed Decision Making',
  'Responsible AI Fluency',
  'Executive Communication',
];

const certifications = [
  'Google AI Professional Certificate — Google / Coursera, 7-course program (May 2026)',
  'Google AI Essentials',
  'Microsoft Azure AI Fundamentals (AI-900)',
  'IBM AI Fundamentals',
  'ISACA AI Fundamentals',
];

const prototypes = [
  {
    name: 'CareerOS',
    description:
      'A job-search orchestration system he built and uses himself: discovers roles, normalizes and deduplicates postings, scores fit, checks compensation floors, and queues qualified roles for his own review. Every application still requires his explicit approval before anything is submitted.',
  },
  {
    name: 'Job Copilot',
    description:
      'The orchestration layer built on top of CareerOS — turning discovery, scoring, and review into one coherent, reviewable pipeline rather than a set of disconnected scripts.',
  },
  {
    name: 'AnswerBrief AI',
    description: (
      <>
        A role-specific interview-prep product that turns a resume and a job posting into a practical,
        structured interview brief. Live at{' '}
        <a href="https://www.answer-brief.com" target="_blank" rel="noreferrer">
          answer-brief.com
        </a>
        .
      </>
    ),
  },
];

export default function TomasPage() {
  return (
    <main className={styles.page}>
      {/* eslint-disable-next-line react/no-danger */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(personJsonLd) }}
      />
      <div className={styles.shell}>
        {/* 1. Hero */}
        <header className={styles.hero}>
          <p className={styles.eyebrow}>Senior Product Manager</p>
          <h1>Tomas Nieves</h1>
          <p className={styles.dek}>
            Enterprise Product Strategy &middot; Digital Transformation &middot; Customer Experience
            Modernization
          </p>
          <div className={styles.heroButtons}>
            <a className={styles.buttonPrimary} href="mailto:tomas@nieves.com">
              tomas@nieves.com
            </a>
            <a
              className={styles.buttonSecondary}
              href="https://www.linkedin.com/in/tomas-nieves-843053171/"
              target="_blank"
              rel="noreferrer"
            >
              <LinkedInIcon /> LinkedIn
            </a>
          </div>
        </header>

        {/* 2. Executive Summary */}
        <section className={styles.block}>
          <h2>Executive Summary</h2>
          <p>
            Thirty years leading enterprise product initiatives, customer experience, digital
            transformation, and cross-functional delivery at Verizon. Currently a Senior Product Manager
            in his first outside job search after nearly three decades with the company, targeting
            Director and Senior Director Product Management roles where that scope of ownership carries
            forward.
          </p>
        </section>

        {/* 3. Professional Highlights */}
        <section className={styles.block}>
          <h2>Professional Highlights</h2>
          <ul className={styles.checkList}>
            {highlights.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>

        {/* 4. Verizon Career */}
        <section className={styles.block}>
          <h2>Verizon Career</h2>
          <div className={styles.experienceHeader}>
            <strong>Verizon</strong>
            <span>1996 – 2026</span>
          </div>
          <ul className={styles.roleList}>
            {roles.map((role) => (
              <li key={role.title}>
                <div className={styles.roleRow}>
                  <span>{role.title}</span>
                  {role.period ? <span className={styles.roleYears}>{role.period}</span> : null}
                </div>
                {role.note ? <p className={styles.roleNote}>{role.note}</p> : null}
              </li>
            ))}
          </ul>
        </section>

        {/* 5. Enterprise Product Leadership */}
        <section className={styles.block}>
          <h2>Enterprise Product Leadership</h2>
          <p>
            Product ownership across four roles and platforms at one of the country&rsquo;s largest
            telecommunications companies, working across legal, UX, engineering, and QA to bring
            enterprise-scale consumer products from strategy through delivery. That kind of longevity in
            one enterprise environment means operating with the governance, compliance, and stakeholder
            alignment that regulated, high-traffic consumer products require.
          </p>
        </section>

        {/* 6. Customer Experience & Digital Transformation */}
        <section className={styles.block}>
          <h2>Customer Experience &amp; Digital Transformation</h2>
          <p>
            His product ownership has centered on digital customer experience — from Verizon&rsquo;s
            self-service assistant technology to its consumer email platform to consumer and small-business
            digital solutions. That arc reflects a consistent focus: making complex enterprise systems
            simpler for the customer on the other end of them.
          </p>
        </section>

        {/* 8. AI-enabled Product Innovation */}
        <section className={styles.block}>
          <h2>AI-Enabled Product Innovation</h2>
          <p>
            Since starting this search, he has treated AI as an execution accelerator rather than a topic to
            study from a distance — completing five certifications this year and using AI tools daily to
            build, ship, and review real production software, documented below.
          </p>
        </section>

        {/* 9. Recent AI Product Prototypes */}
        <section className={styles.block}>
          <h2>Recent AI Product Prototypes</h2>
          <p className={styles.sectionNote}>
            Recent technical projects, not a business — built to demonstrate continuous learning and
            modern AI product thinking alongside his Verizon experience above, not to replace it.
          </p>
          {prototypes.map((item) => (
            <div className={styles.project} key={item.name}>
              <h3>{item.name}</h3>
              <p>{item.description}</p>
            </div>
          ))}
        </section>

        {/* 10. Skills */}
        <section className={styles.block}>
          <h2>Skills</h2>
          <ul className={styles.skillList}>
            {skills.map((skill) => (
              <li key={skill}>{skill}</li>
            ))}
          </ul>
        </section>

        {/* 11. Education */}
        <section className={styles.block}>
          <h2>Education</h2>
          <p>Master of Science (M.S.), Microcomputing — University of Puerto Rico</p>
        </section>

        {/* 12. Certifications */}
        <section className={styles.block}>
          <h2>Certifications</h2>
          <ul className={styles.certList}>
            {certifications.map((cert) => (
              <li key={cert}>{cert}</li>
            ))}
          </ul>
        </section>

        {/* 13. Target Roles */}
        <section className={styles.block}>
          <h2>Target Roles</h2>
          <p>
            Seeking Director Product Management, Senior Director Product, and Principal Product Manager
            opportunities in Product Strategy, Customer Experience, Digital Transformation, and
            AI-enabled Product Organizations. These are target opportunities, not prior titles.
          </p>
        </section>

        {/* 14. Contact */}
        <footer className={styles.footer}>
          <p>If any of this is relevant to something you&rsquo;re hiring for, I&rsquo;d like to talk.</p>
          <div className={styles.heroButtons}>
            <a className={styles.buttonPrimary} href="mailto:tomas@nieves.com">
              tomas@nieves.com
            </a>
            <a
              className={styles.buttonSecondary}
              href="https://www.linkedin.com/in/tomas-nieves-843053171/"
              target="_blank"
              rel="noreferrer"
            >
              <LinkedInIcon /> LinkedIn
            </a>
          </div>
        </footer>
      </div>
    </main>
  );
}

function LinkedInIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M20.45 20.45h-3.56v-5.58c0-1.33-.02-3.04-1.85-3.04-1.86 0-2.14 1.45-2.14 2.94v5.68H9.34V9h3.42v1.56h.05c.48-.9 1.64-1.85 3.38-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.07 2.07 0 1 1 0-4.13 2.07 2.07 0 0 1 0 4.13zM7.12 20.45H3.56V9h3.56v11.45z" />
    </svg>
  );
}
