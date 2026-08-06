import type { Metadata } from 'next';
import styles from './tomas.module.css';

export const metadata: Metadata = {
  title: 'Tomas Nieves — Enterprise Product Management Leader',
  description: 'Nearly 30 years leading product at Verizon. Now building AI-powered tools and looking for what’s next.',
};

const skills = [
  'Enterprise Product Strategy',
  'Digital Product Transformation',
  'Customer Experience Modernization',
  'Executive Stakeholder Alignment',
  'Product Roadmap & Portfolio Prioritization',
  'Cross-Functional Leadership',
  'Data-Informed Decision Making',
  'Responsible AI Fluency',
];

const roles = [
  { title: 'Senior Product Owner / Product Manager', years: '1996 – 2026' },
  { title: 'Product Owner, Verizon Assistant' },
  { title: 'Product Owner, Verizon.com Email Platform' },
  { title: 'Product Manager, Consumer and Small Business Solutions' },
];

const certifications = [
  'Google AI Professional Certificate — Google / Coursera, 7-course program',
  'Google AI Essentials',
  'Microsoft Azure AI Fundamentals (AI-900)',
  'IBM AI Fundamentals',
  'ISACA AI Fundamentals',
];

export default function TomasPage() {
  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.hero}>
          <p className={styles.eyebrow}>Enterprise Product Management Leader</p>
          <h1>Tomas Nieves</h1>
          <p className={styles.dek}>
            Product Strategy &middot; Digital Transformation &middot; Customer Experience Modernization
          </p>
          <div className={styles.heroLinks}>
            <a href="mailto:tomas@nieves.com">tomas@nieves.com</a>
            <a href="https://www.linkedin.com/in/tomas-nieves-843053171/" target="_blank" rel="noreferrer">
              LinkedIn
            </a>
          </div>
        </header>

        <section className={styles.block}>
          <h2>The short version</h2>
          <p>
            I spent nearly three decades at Verizon building and owning consumer-facing products —
            from the Verizon Assistant to Verizon.com&rsquo;s email platform to consumer and small-business
            solutions. This is my first outside job search in a long time.
          </p>
          <p>
            Rather than wait around for it, I started building. In the past few weeks I&rsquo;ve built{' '}
            <strong>CareerOS</strong>, an AI-powered job search system with real engineering discipline
            behind it — fit scoring, compensation checks, and a human-approval gate before anything is
            ever submitted. This page is part of that same effort: a fast, honest way for you to see what
            I&rsquo;ve done and what I&rsquo;m looking for next.
          </p>
        </section>

        <section className={styles.block}>
          <h2>What I bring</h2>
          <ul className={styles.pillList}>
            {skills.map((skill) => (
              <li key={skill}>{skill}</li>
            ))}
          </ul>
        </section>

        <section className={styles.block}>
          <h2>Experience</h2>
          <div className={styles.experienceHeader}>
            <strong>Verizon</strong>
            <span>1996 – 2026</span>
          </div>
          <ul className={styles.roleList}>
            {roles.map((role) => (
              <li key={role.title}>
                {role.title}
                {role.years ? <span className={styles.roleYears}>{role.years}</span> : null}
              </li>
            ))}
          </ul>
          <p className={styles.education}>M.S., Microcomputing — University of Puerto Rico</p>
        </section>

        <section className={styles.block}>
          <h2>Recently</h2>
          <p>
            I&rsquo;ve spent this year building AI fluency deliberately, not just using the tools —
            understanding how they work and where their limits are:
          </p>
          <ul className={styles.certList}>
            {certifications.map((cert) => (
              <li key={cert}>{cert}</li>
            ))}
          </ul>
        </section>

        <section className={styles.block}>
          <h2>What I&rsquo;ve built</h2>
          <div className={styles.project}>
            <h3>CareerOS</h3>
            <p>
              An end-to-end AI job-search orchestration system. It discovers roles across dozens of
              employer career sites, normalizes and deduplicates postings, scores fit against my
              background, and checks compensation floors — then queues qualified roles for my review.
              Every application still requires my explicit approval before anything is submitted. Built
              with production engineering discipline: isolated execution environments, branch-protected
              deploys, and full test coverage.
            </p>
          </div>
          <div className={styles.project}>
            <h3>AnswerBrief AI</h3>
            <p>
              A role-specific interview-prep product that turns a resume and a job posting into a
              practical, structured interview brief. Live at{' '}
              <a href="https://www.answer-brief.com" target="_blank" rel="noreferrer">
                answer-brief.com
              </a>
              .
            </p>
          </div>
        </section>

        <section className={styles.block}>
          <h2>What I&rsquo;m looking for</h2>
          <p>
            Director or Senior Director of Product Management roles focused on digital transformation and
            customer experience modernization — remote or hybrid in the Dallas&ndash;Fort Worth area.
          </p>
        </section>

        <footer className={styles.footer}>
          <p>If any of this is relevant to something you&rsquo;re hiring for, I&rsquo;d like to talk.</p>
          <div className={styles.heroLinks}>
            <a href="mailto:tomas@nieves.com">tomas@nieves.com</a>
            <a href="https://www.linkedin.com/in/tomas-nieves-843053171/" target="_blank" rel="noreferrer">
              LinkedIn
            </a>
          </div>
        </footer>
      </div>
    </main>
  );
}
